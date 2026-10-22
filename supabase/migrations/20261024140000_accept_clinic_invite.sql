-- Accept a clinic invite (2.A3).
-- anon cannot read code hashes, so these functions are service_role only.
-- The server action verifies the Argon2id code, then calls accept_clinic_invite.
-- A new clinic is hidden until setup is finished: no address, no phone,
-- online booking off, setup_completed_at null.

alter table public.clinics alter column address drop not null;
alter table public.clinics alter column phone drop not null;

alter table public.clinics drop constraint clinics_required_text_check;
alter table public.clinics add constraint clinics_required_text_check check (
  char_length(btrim(name)) > 0
  and char_length(btrim(slug)) > 0
  and char_length(btrim(city)) > 0
  and (
    setup_completed_at is null
    or (
      address is not null
      and phone is not null
      and char_length(btrim(address)) > 0
      and char_length(btrim(phone)) > 0
    )
  )
);

comment on constraint clinics_required_text_check on public.clinics is
  'Name, slug, and city are always required. Address and phone may wait until setup is finished.';

-- Same folding as lib/slug.ts. Both cases are replaced before lower()
-- so the result does not depend on the database collation.
create or replace function private.slugify_clinic(value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  mapped text := coalesce(value, '');
begin
  mapped := replace(mapped, 'Ǆ', 'dz');
  mapped := replace(mapped, 'ǅ', 'dz');
  mapped := replace(mapped, 'ǆ', 'dz');
  mapped := replace(mapped, 'Đ', 'dj');
  mapped := replace(mapped, 'đ', 'dj');
  mapped := replace(mapped, 'Č', 'c');
  mapped := replace(mapped, 'č', 'c');
  mapped := replace(mapped, 'Ć', 'c');
  mapped := replace(mapped, 'ć', 'c');
  mapped := replace(mapped, 'Š', 's');
  mapped := replace(mapped, 'š', 's');
  mapped := replace(mapped, 'Ž', 'z');
  mapped := replace(mapped, 'ž', 'z');
  mapped := lower(mapped);
  mapped := regexp_replace(mapped, '[^a-z0-9]+', '-', 'g');
  mapped := regexp_replace(mapped, '-{2,}', '-', 'g');
  mapped := regexp_replace(mapped, '^-+|-+$', '', 'g');
  if mapped is null or mapped = '' then
    return 'ordinacija';
  end if;
  return mapped;
end;
$$;

create or replace function private.unique_clinic_slug(base text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  candidate text := base;
  suffix integer := 2;
begin
  while exists (select 1 from public.clinics where slug = candidate) loop
    candidate := base || '-' || suffix::text;
    suffix := suffix + 1;
    if suffix > 1000 then
      return null;
    end if;
  end loop;
  return candidate;
end;
$$;

create table private.clinic_invite_resends (
  id bigint generated always as identity primary key,
  invite_id uuid not null references public.clinic_invites (id) on delete cascade,
  sent_at timestamptz not null default now()
);

comment on table private.clinic_invite_resends is
  'Page resends of a clinic invite code. At most three rows in any rolling hour.';

create index clinic_invite_resends_invite_sent_idx
  on private.clinic_invite_resends (invite_id, sent_at desc);

create or replace function private.lock_clinic_invite(p_token_hash text)
returns public.clinic_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinic_invites;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select *
  into v_row
  from public.clinic_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    return null;
  end if;

  return v_row;
end;
$$;

create or replace function private.clinic_invite_is_open(p_row public.clinic_invites)
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

create or replace function public.read_clinic_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinic_invites;
begin
  v_row := private.lock_clinic_invite(p_token_hash);
  if not private.clinic_invite_is_open(v_row) then
    return jsonb_build_object('status', 'invalid');
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'email', v_row.email,
    'code_hash', v_row.code_hash
  );
end;
$$;

comment on function public.read_clinic_invite(text) is
  'Returns the invite email and Argon2id code hash when the link is still open. service_role only.';

create or replace function public.record_clinic_invite_failure(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinic_invites;
  v_count integer;
begin
  v_row := private.lock_clinic_invite(p_token_hash);
  if not private.clinic_invite_is_open(v_row) then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.clinic_invites
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

comment on function public.record_clinic_invite_failure(text) is
  'Counts one wrong code. The fifth wrong code disables the invite. service_role only.';

create or replace function public.resend_clinic_invite(
  p_token_hash text,
  p_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinic_invites;
  v_recent integer;
begin
  v_row := private.lock_clinic_invite(p_token_hash);
  if not private.clinic_invite_is_open(v_row) then
    return jsonb_build_object('status', 'invalid');
  end if;

  if p_code_hash is null
    or char_length(p_code_hash) > 300
    or p_code_hash !~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/_-]+={0,2}\$[A-Za-z0-9+/_-]+={0,2}$'
  then
    return jsonb_build_object('status', 'bad_hash');
  end if;

  select count(*)::integer
  into v_recent
  from private.clinic_invite_resends
  where invite_id = v_row.id
    and sent_at > now() - interval '1 hour';

  if v_recent >= 3 then
    return jsonb_build_object('status', 'rate_limit');
  end if;

  update public.clinic_invites
  set code_hash = p_code_hash,
      send_count = send_count + 1,
      last_sent_at = now()
  where id = v_row.id;

  insert into private.clinic_invite_resends (invite_id)
  values (v_row.id);

  return jsonb_build_object(
    'status', 'ok',
    'email', v_row.email,
    'previous_code_hash', v_row.code_hash,
    'previous_send_count', v_row.send_count,
    'previous_last_sent_at', v_row.last_sent_at
  );
end;
$$;

comment on function public.resend_clinic_invite(text, text) is
  'Stores a new code hash and allows at most three page resends per hour. Does not reset wrong attempts. service_role only.';

create or replace function public.revert_clinic_invite_resend(
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
  v_row public.clinic_invites;
  v_resend_id bigint;
begin
  v_row := private.lock_clinic_invite(p_token_hash);
  if v_row.id is null or p_previous_send_count is null or p_previous_send_count < 0 then
    return jsonb_build_object('status', 'failed');
  end if;

  update public.clinic_invites
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
  from private.clinic_invite_resends
  where invite_id = v_row.id
  order by sent_at desc, id desc
  limit 1;

  if v_resend_id is not null then
    delete from private.clinic_invite_resends where id = v_resend_id;
  end if;

  return jsonb_build_object('status', 'ok');
end;
$$;

comment on function public.revert_clinic_invite_resend(text, text, text, integer, timestamptz) is
  'Restores the previous code when the resend mail could not be sent. service_role only.';

create or replace function public.accept_clinic_invite(
  p_token_hash text,
  p_code_hash text,
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_clinic_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinic_invites;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_name text := btrim(coalesce(p_clinic_name, ''));
  v_city text;
  v_user_email text;
  v_slug text;
  v_clinic_id uuid;
  v_try integer;
begin
  if p_user_id is null
    or v_first = ''
    or v_last = ''
    or v_name = ''
    or char_length(v_first) > 80
    or char_length(v_last) > 80
    or char_length(v_name) > 120
  then
    return jsonb_build_object('status', 'invalid_name');
  end if;

  v_row := private.lock_clinic_invite(p_token_hash);
  if not private.clinic_invite_is_open(v_row) or v_row.code_hash is distinct from p_code_hash then
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

  select btrim(request.city)
  into v_city
  from public.clinic_access_requests as request
  where request.clinic_invite_id = v_row.id
    and request.status = 'invited'
  order by request.created_at desc
  limit 1;

  if v_city is null or v_city = '' then
    return jsonb_build_object('status', 'not_ready');
  end if;

  for v_try in 1..5 loop
    v_slug := private.unique_clinic_slug(private.slugify_clinic(v_name));
    if v_slug is null then
      return jsonb_build_object('status', 'failed');
    end if;

    begin
      -- Guide defaults until setup: 30-minute step, no buffer, 30-minute visits,
      -- 2-hour notice, 30-day horizon. Not listed, and not bookable online.
      insert into public.clinics (
        name,
        slug,
        city,
        slot_minutes,
        buffer_minutes,
        default_duration_min,
        min_notice_minutes,
        max_ahead_days,
        online_booking_enabled
      )
      values (
        v_name,
        v_slug,
        v_city,
        30,
        0,
        30,
        120,
        30,
        false
      )
      returning id into v_clinic_id;
      exit;
    exception
      when unique_violation then
        v_clinic_id := null;
    end;
  end loop;

  if v_clinic_id is null then
    return jsonb_build_object('status', 'failed');
  end if;

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
    v_clinic_id,
    p_user_id,
    'owner',
    false,
    false,
    v_first,
    v_last
  );

  update public.clinic_invites
  set used_at = now(),
      clinic_id = v_clinic_id
  where id = v_row.id
    and used_at is null;

  if not found then
    raise exception 'clinic invite changed during accept';
  end if;

  return jsonb_build_object('status', 'ok', 'clinic_id', v_clinic_id);
end;
$$;

comment on function public.accept_clinic_invite(text, text, uuid, text, text, text) is
  'Opens the clinic for the auth user whose email matches the invite and marks the invite used. service_role only.';

revoke all on function private.slugify_clinic(text)
  from public, anon, authenticated, service_role;
revoke all on function private.unique_clinic_slug(text)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_clinic_invite(text)
  from public, anon, authenticated, service_role;
revoke all on function private.clinic_invite_is_open(public.clinic_invites)
  from public, anon, authenticated, service_role;

revoke all on table private.clinic_invite_resends
  from public, anon, authenticated, service_role;

revoke all on function public.read_clinic_invite(text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_clinic_invite_failure(text)
  from public, anon, authenticated, service_role;
revoke all on function public.resend_clinic_invite(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.revert_clinic_invite_resend(text, text, text, integer, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.accept_clinic_invite(text, text, uuid, text, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.read_clinic_invite(text) to service_role;
grant execute on function public.record_clinic_invite_failure(text) to service_role;
grant execute on function public.resend_clinic_invite(text, text) to service_role;
grant execute on function public.revert_clinic_invite_resend(text, text, text, integer, timestamptz)
  to service_role;
grant execute on function public.accept_clinic_invite(text, text, uuid, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
