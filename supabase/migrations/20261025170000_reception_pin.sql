-- Reception PIN (2.A5).
-- anon calls these with the HMAC of the clinic_device cookie only.
-- A revoked device and an unknown secret return the same empty result.
-- service_role does not read these tables. The server action checks Argon2id,
-- then mints a magic-link token without sending mail.

alter table public.clinic_members
  add column pin_attempt_count integer not null default 0;

alter table public.clinic_members
  add constraint clinic_members_pin_attempt_count_check
  check (pin_attempt_count between 0 and 5);

comment on column public.clinic_members.pin_attempt_count is
  'Wrong reception PINs for this member. Hidden from authenticated SELECT. Five asks for the password until a correct PIN or password resets it.';

-- Table-level UPDATE would include every new column. Keep pin_hash and the
-- counter off the browser role so the counter cannot be cleared from the client.
revoke insert, update on table public.clinic_members from authenticated;

grant insert (
  id, clinic_id, user_id, role, sees_patients, listed_online,
  first_name, last_name, unavailable, created_at, updated_at
), update (
  id, clinic_id, user_id, role, sees_patients, listed_online,
  first_name, last_name, unavailable, created_at, updated_at
) on table public.clinic_members to authenticated;

create unique index clinic_devices_secret_hash_uidx
  on public.clinic_devices (secret_hash);

create or replace function private.lock_reception_device(p_secret_hash text)
returns public.clinic_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinic_devices;
begin
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select *
  into v_row
  from public.clinic_devices
  where secret_hash = p_secret_hash
    and revoked_at is null
  order by created_at
  limit 1
  for update;

  if not found then
    return null;
  end if;

  return v_row;
end;
$$;

create or replace function private.lock_reception_member(p_clinic_id uuid, p_member_id uuid)
returns public.clinic_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinic_members;
begin
  if p_clinic_id is null or p_member_id is null then
    return null;
  end if;

  select *
  into v_row
  from public.clinic_members
  where id = p_member_id
    and clinic_id = p_clinic_id
    and unavailable = false
    and pin_hash is not null
  for update;

  if not found then
    return null;
  end if;

  return v_row;
end;
$$;

create or replace function public.list_reception_device(p_secret_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.clinic_devices;
  v_name text;
  v_members jsonb;
begin
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select *
  into v_device
  from public.clinic_devices
  where secret_hash = p_secret_hash
    and revoked_at is null
  order by created_at
  limit 1;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select clinics.name
  into v_name
  from public.clinics
  where clinics.id = v_device.clinic_id;

  if v_name is null or btrim(v_name) = '' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', member.id,
        'first_name', member.first_name,
        'last_name', member.last_name
      )
      order by member.first_name, member.last_name, member.id
    ),
    '[]'::jsonb
  )
  into v_members
  from public.clinic_members as member
  where member.clinic_id = v_device.clinic_id
    and member.unavailable = false
    and member.pin_hash is not null;

  return jsonb_build_object(
    'status', 'ok',
    'clinic_name', v_name,
    'members', v_members
  );
end;
$$;

comment on function public.list_reception_device(text) is
  'Clinic name and members who have a PIN and are not unavailable. Empty when the device is revoked or unknown. Takes the device HMAC only.';

create or replace function public.read_reception_pin(p_secret_hash text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.clinic_devices;
  v_member public.clinic_members;
  v_email text;
begin
  v_device := private.lock_reception_device(p_secret_hash);
  if v_device is null or v_device.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_member := private.lock_reception_member(v_device.clinic_id, p_member_id);
  if v_member is null or v_member.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select users.email
  into v_email
  from auth.users as users
  where users.id = v_member.user_id;

  if v_email is null or btrim(v_email) = '' then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_member.pin_attempt_count >= 5 then
    return jsonb_build_object(
      'status', 'password',
      'email', btrim(v_email),
      'user_id', v_member.user_id
    );
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'pin_hash', v_member.pin_hash,
    'email', btrim(v_email),
    'user_id', v_member.user_id,
    'attempt_count', v_member.pin_attempt_count
  );
end;
$$;

comment on function public.read_reception_pin(text, uuid) is
  'Argon2id PIN hash and auth email for one member of a live device. After five failures the hash is omitted. Takes the device HMAC only.';

create or replace function public.record_reception_pin_failure(p_secret_hash text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.clinic_devices;
  v_member public.clinic_members;
  v_count integer;
begin
  v_device := private.lock_reception_device(p_secret_hash);
  if v_device is null or v_device.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_member := private.lock_reception_member(v_device.clinic_id, p_member_id);
  if v_member is null or v_member.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_member.pin_attempt_count >= 5 then
    return jsonb_build_object('status', 'password', 'attempt_count', v_member.pin_attempt_count);
  end if;

  update public.clinic_members
  set pin_attempt_count = pin_attempt_count + 1
  where id = v_member.id
    and pin_attempt_count < 5
  returning pin_attempt_count into v_count;

  if v_count is null or v_count >= 5 then
    return jsonb_build_object('status', 'password', 'attempt_count', coalesce(v_count, 5));
  end if;

  return jsonb_build_object('status', 'wrong', 'attempt_count', v_count);
end;
$$;

comment on function public.record_reception_pin_failure(text, uuid) is
  'Counts one wrong reception PIN. The fifth failure asks for the password. Takes the device HMAC only.';

create or replace function public.clear_reception_pin_failures(p_secret_hash text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.clinic_devices;
  v_member public.clinic_members;
begin
  v_device := private.lock_reception_device(p_secret_hash);
  if v_device is null or v_device.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_member := private.lock_reception_member(v_device.clinic_id, p_member_id);
  if v_member is null or v_member.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.clinic_members
  set pin_attempt_count = 0
  where id = v_member.id;

  return jsonb_build_object('status', 'ok');
end;
$$;

comment on function public.clear_reception_pin_failures(text, uuid) is
  'Resets the reception PIN counter after a correct PIN or password. Takes the device HMAC only.';

revoke all on function private.lock_reception_device(text)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_reception_member(uuid, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.list_reception_device(text)
  from public, anon, authenticated, service_role;
revoke all on function public.read_reception_pin(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.record_reception_pin_failure(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.clear_reception_pin_failures(text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.list_reception_device(text) to anon;
grant execute on function public.read_reception_pin(text, uuid) to anon;
grant execute on function public.record_reception_pin_failure(text, uuid) to anon;
grant execute on function public.clear_reception_pin_failures(text, uuid) to anon;

notify pgrst, 'reload schema';
