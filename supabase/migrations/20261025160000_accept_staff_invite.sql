-- Accept a colleague invite (2.A4).
-- Same rules as the clinic invite: 7 days, five wrong codes, three page resends an hour.
-- anon may call these functions. Their only lookup argument is the HMAC of the link
-- token, which is unguessable without TOKEN_PEPPER. service_role stays off them.
-- The role and the names come from the invite row, not from the caller.
-- A dentist sees patients and is hidden from the public page until the owner lists them.
-- A receptionist does not see patients.

create table private.staff_invite_resends (
  id bigint generated always as identity primary key,
  invite_id uuid not null references public.staff_invites (id) on delete cascade,
  sent_at timestamptz not null default now()
);

comment on table private.staff_invite_resends is
  'Page resends of a colleague invite code. At most three rows in any rolling hour.';

create index staff_invite_resends_invite_sent_idx
  on private.staff_invite_resends (invite_id, sent_at desc);

create or replace function private.lock_staff_invite(p_token_hash text)
returns public.staff_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_invites;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select *
  into v_row
  from public.staff_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    return null;
  end if;

  return v_row;
end;
$$;

create or replace function private.staff_invite_is_open(p_row public.staff_invites)
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  if p_row is null or p_row.id is null then
    return false;
  end if;
  return p_row.used_at is null
    and p_row.expires_at > now()
    and p_row.attempt_count < 5;
end;
$$;

-- Clinic name and the inviter's first and last name, for the mail and the page.
create or replace function private.staff_invite_context(
  p_clinic_id uuid,
  p_created_by uuid,
  p_role text,
  out clinic_name text,
  out inviter_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select btrim(clinic.name),
         btrim(member.first_name) || ' ' || btrim(member.last_name)
  from public.clinics as clinic
  join public.clinic_members as member
    on member.id = p_created_by
   and member.clinic_id = clinic.id
  where clinic.id = p_clinic_id
    and p_role in ('dentist', 'reception')
    and char_length(btrim(clinic.name)) > 0
    and char_length(btrim(member.first_name)) > 0
    and char_length(btrim(member.last_name)) > 0;
$$;

create or replace function public.read_staff_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_invites;
  v_clinic_name text;
  v_inviter_name text;
begin
  v_row := private.lock_staff_invite(p_token_hash);
  if not private.staff_invite_is_open(v_row) then
    return jsonb_build_object('status', 'invalid');
  end if;

  select context.clinic_name, context.inviter_name
  into v_clinic_name, v_inviter_name
  from private.staff_invite_context(v_row.clinic_id, v_row.created_by, v_row.role) as context;

  if v_clinic_name is null or v_inviter_name is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'email', v_row.email,
    'code_hash', v_row.code_hash,
    'role', v_row.role,
    'clinic_name', v_clinic_name,
    'inviter_name', v_inviter_name
  );
end;
$$;

comment on function public.read_staff_invite(text) is
  'Returns the colleague invite when the link is still open. Takes the token HMAC only.';

create or replace function public.staff_invite_user_id(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_invites;
  v_user_id uuid;
begin
  v_row := private.lock_staff_invite(p_token_hash);
  if not private.staff_invite_is_open(v_row) then
    return null;
  end if;

  select users.id
  into v_user_id
  from auth.users as users
  where lower(users.email) = lower(v_row.email)
  limit 1;

  return v_user_id;
end;
$$;

comment on function public.staff_invite_user_id(text) is
  'Returns the auth user id for the invited email while the link is still open. Takes the token HMAC only.';

create or replace function public.record_staff_invite_failure(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_invites;
  v_count integer;
begin
  v_row := private.lock_staff_invite(p_token_hash);
  if not private.staff_invite_is_open(v_row) then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.staff_invites
  set attempt_count = attempt_count + 1
  where id = v_row.id
    and used_at is null
    and expires_at > now()
    and attempt_count < 5
  returning attempt_count into v_count;

  if v_count is null or v_count >= 5 then
    return jsonb_build_object('status', 'invalid');
  end if;

  return jsonb_build_object('status', 'wrong', 'attempt_count', v_count);
end;
$$;

comment on function public.record_staff_invite_failure(text) is
  'Counts one wrong code. The fifth wrong code disables the invite. Takes the token HMAC only.';

create or replace function public.resend_staff_invite(
  p_token_hash text,
  p_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_invites;
  v_recent integer;
  v_clinic_name text;
  v_inviter_name text;
begin
  v_row := private.lock_staff_invite(p_token_hash);
  if not private.staff_invite_is_open(v_row) then
    return jsonb_build_object('status', 'invalid');
  end if;

  if p_code_hash is null
    or char_length(p_code_hash) > 300
    or p_code_hash !~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/_-]+={0,2}\$[A-Za-z0-9+/_-]+={0,2}$'
  then
    return jsonb_build_object('status', 'bad_hash');
  end if;

  select context.clinic_name, context.inviter_name
  into v_clinic_name, v_inviter_name
  from private.staff_invite_context(v_row.clinic_id, v_row.created_by, v_row.role) as context;

  if v_clinic_name is null or v_inviter_name is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select count(*)::integer
  into v_recent
  from private.staff_invite_resends
  where invite_id = v_row.id
    and sent_at > now() - interval '1 hour';

  if v_recent >= 3 then
    return jsonb_build_object('status', 'rate_limit');
  end if;

  update public.staff_invites
  set code_hash = p_code_hash,
      send_count = send_count + 1,
      last_sent_at = now()
  where id = v_row.id;

  insert into private.staff_invite_resends (invite_id)
  values (v_row.id);

  return jsonb_build_object(
    'status', 'ok',
    'email', v_row.email,
    'role', v_row.role,
    'clinic_name', v_clinic_name,
    'inviter_name', v_inviter_name,
    'previous_code_hash', v_row.code_hash,
    'previous_send_count', v_row.send_count,
    'previous_last_sent_at', v_row.last_sent_at
  );
end;
$$;

comment on function public.resend_staff_invite(text, text) is
  'Stores a new code hash and allows at most three page resends per hour. Does not reset wrong attempts. Takes the token HMAC only.';

create or replace function public.revert_staff_invite_resend(
  p_token_hash text,
  p_previous_code_hash text,
  p_new_code_hash text,
  p_previous_send_count integer,
  p_previous_last_sent_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_invites;
  v_resend_id bigint;
begin
  v_row := private.lock_staff_invite(p_token_hash);
  if v_row.id is null or p_previous_send_count is null or p_previous_send_count < 0 then
    return jsonb_build_object('status', 'failed');
  end if;

  update public.staff_invites
  set code_hash = p_previous_code_hash,
      send_count = p_previous_send_count,
      last_sent_at = p_previous_last_sent_at
  where id = v_row.id
    and used_at is null
    and code_hash = p_new_code_hash;

  if not found then
    return jsonb_build_object('status', 'failed');
  end if;

  select id
  into v_resend_id
  from private.staff_invite_resends
  where invite_id = v_row.id
  order by sent_at desc, id desc
  limit 1;

  if v_resend_id is not null then
    delete from private.staff_invite_resends where id = v_resend_id;
  end if;

  return jsonb_build_object('status', 'ok');
end;
$$;

comment on function public.revert_staff_invite_resend(text, text, text, integer, timestamptz) is
  'Restores the previous code when the resend mail could not be sent. Takes the token HMAC only.';

create or replace function public.accept_staff_invite(
  p_token_hash text,
  p_code_hash text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_invites;
  v_user_email text;
begin
  if p_user_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_row := private.lock_staff_invite(p_token_hash);
  if not private.staff_invite_is_open(v_row) or v_row.code_hash is distinct from p_code_hash then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_row.role not in ('dentist', 'reception') then
    return jsonb_build_object('status', 'invalid');
  end if;

  select lower(users.email)
  into v_user_email
  from auth.users as users
  where users.id = p_user_id;

  if v_user_email is null or v_user_email <> lower(v_row.email) then
    return jsonb_build_object('status', 'email_mismatch');
  end if;

  if exists (
    select 1
    from public.clinic_members
    where user_id = p_user_id
  ) then
    return jsonb_build_object('status', 'already_member');
  end if;

  begin
    insert into public.clinic_members (
      clinic_id,
      user_id,
      role,
      sees_patients,
      listed_online,
      first_name,
      last_name
    )
    values (
      v_row.clinic_id,
      p_user_id,
      v_row.role,
      v_row.role = 'dentist',
      false,
      btrim(v_row.first_name),
      btrim(v_row.last_name)
    );
  exception
    when unique_violation then
      return jsonb_build_object('status', 'already_member');
  end;

  update public.staff_invites
  set used_at = now()
  where id = v_row.id
    and used_at is null;

  if not found then
    raise exception 'staff invite changed during accept';
  end if;

  return jsonb_build_object('status', 'ok');
end;
$$;

comment on function public.accept_staff_invite(text, text, uuid) is
  'Adds the auth user as the dentist or receptionist named on the invite and marks the invite used. Takes the token HMAC only.';

revoke all on function private.lock_staff_invite(text)
  from public, anon, authenticated, service_role;
revoke all on function private.staff_invite_is_open(public.staff_invites)
  from public, anon, authenticated, service_role;
revoke all on function private.staff_invite_context(uuid, uuid, text)
  from public, anon, authenticated, service_role;

revoke all on table private.staff_invite_resends
  from public, anon, authenticated, service_role;

revoke all on function public.read_staff_invite(text)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_invite_user_id(text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_staff_invite_failure(text)
  from public, anon, authenticated, service_role;
revoke all on function public.resend_staff_invite(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.revert_staff_invite_resend(text, text, text, integer, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.accept_staff_invite(text, text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.read_staff_invite(text) to anon;
grant execute on function public.staff_invite_user_id(text) to anon;
grant execute on function public.record_staff_invite_failure(text) to anon;
grant execute on function public.resend_staff_invite(text, text) to anon;
grant execute on function public.revert_staff_invite_resend(text, text, text, integer, timestamptz)
  to anon;
grant execute on function public.accept_staff_invite(text, text, uuid) to anon;

notify pgrst, 'reload schema';
