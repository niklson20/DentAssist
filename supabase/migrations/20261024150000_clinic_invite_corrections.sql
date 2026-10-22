-- Corrections to the clinic invite (2.A3).
-- 1. The invite functions move from service_role to anon. Their only argument is the
--    HMAC of the link token, which is unguessable without TOKEN_PEPPER, so anon may
--    call them. service_role stays for the Auth admin API alone.
-- 2. clinic_invite_user_id lets the server action find the account an invited email
--    already has, instead of listing users. It answers only while the invite is open.
-- 3. The slug follows the clinic name until the guide finishes. The invite form writes
--    the first name, so the slug must stay changeable until setup_completed_at is set.

-- Returns the auth user that already holds the invited email, or null.
-- No raw token, no email, and no code hash leave this function.
create or replace function public.clinic_invite_user_id(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinic_invites;
  v_user_id uuid;
begin
  v_row := private.lock_clinic_invite(p_token_hash);
  if not private.clinic_invite_is_open(v_row) then
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

comment on function public.clinic_invite_user_id(text) is
  'Returns the auth user id for the invited email while the link is still open. Takes the token HMAC only.';

comment on function public.read_clinic_invite(text) is
  'Returns the invite email and Argon2id code hash when the link is still open. Takes the token HMAC only.';

comment on function public.record_clinic_invite_failure(text) is
  'Counts one wrong code. The fifth wrong code disables the invite. Takes the token HMAC only.';

comment on function public.resend_clinic_invite(text, text) is
  'Stores a new code hash and allows at most three page resends per hour. Does not reset wrong attempts. Takes the token HMAC only.';

comment on function public.revert_clinic_invite_resend(text, text, text, integer, timestamptz) is
  'Restores the previous code when the resend mail could not be sent. Takes the token HMAC only.';

comment on function public.accept_clinic_invite(text, text, uuid, text, text, text) is
  'Opens the clinic for the auth user whose email matches the invite and marks the invite used. Takes the token HMAC only.';

revoke all on function public.clinic_invite_user_id(text)
  from public, anon, authenticated, service_role;

revoke execute on function public.read_clinic_invite(text) from service_role;
revoke execute on function public.record_clinic_invite_failure(text) from service_role;
revoke execute on function public.resend_clinic_invite(text, text) from service_role;
revoke execute on function public.revert_clinic_invite_resend(text, text, text, integer, timestamptz)
  from service_role;
revoke execute on function public.accept_clinic_invite(text, text, uuid, text, text, text)
  from service_role;

grant execute on function public.clinic_invite_user_id(text) to anon;
grant execute on function public.read_clinic_invite(text) to anon;
grant execute on function public.record_clinic_invite_failure(text) to anon;
grant execute on function public.resend_clinic_invite(text, text) to anon;
grant execute on function public.revert_clinic_invite_resend(text, text, text, integer, timestamptz)
  to anon;
grant execute on function public.accept_clinic_invite(text, text, uuid, text, text, text) to anon;

-- Replaces the body from 1.1. The trigger clinics_protect_row keeps pointing here.
create or replace function private.protect_clinic_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Until the guide is finished the public link is not published anywhere, so a new
  -- clinic name may still rewrite the slug. The write that first sets
  -- setup_completed_at is part of that window. Afterwards the slug is frozen.
  if tg_op = 'UPDATE'
    and new.slug is distinct from old.slug
    and old.setup_completed_at is not null then
    raise exception 'clinic slug is immutable';
  end if;

  if tg_op = 'UPDATE'
    and auth.uid() is not null
    and not (public.is_owner() or public.is_platform_admin()) then
    if new.tax_id is distinct from old.tax_id
      or new.registration_number is distinct from old.registration_number
      or new.license_number is distinct from old.license_number
      or new.status is distinct from old.status then
      raise exception 'only the owner may change legal data or clinic status';
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
