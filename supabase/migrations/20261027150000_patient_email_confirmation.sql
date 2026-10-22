-- Patient email confirmation (2.D11a).
-- Replaces private.protect_patient_account. Existing bans stay.
-- email_confirmed_at may move from null to a time only when this transaction
-- set dentassist.patient_email_confirm to that account id, via set_config(..., true).
-- Only confirm_patient_email does that. Changing the email still clears it.
-- An insert still cannot arrive with the confirmation already filled.
-- The four functions run as security definer, search_path = public.
-- Grants match set_own_pin: authenticated only. None of them return code_hash.
-- They use the account for auth.uid() and the newest challenge for that email.
-- Locking is by email. Turnstile stays in the server action, as with
-- request_clinic_access. service_role gains no new execute grant.
-- The hash is Argon2id from the application. Verification is
-- pgsodium.crypto_pwhash_str_verify.

create or replace function private.lock_patient_email(target_email text)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('patient-email:' || lower(btrim(target_email)), 0)
  );
end;
$$;

comment on function private.lock_patient_email(text) is
  'Serializes patient email challenges for one email. Does not lock clinic invites.';

create or replace function private.protect_patient_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'patient account user is immutable';
  end if;

  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' and lower(new.email) is distinct from lower(old.email) then
      new.email_confirmed_at = null;
    elsif tg_op = 'INSERT' and new.email_confirmed_at is not null then
      raise exception 'email confirmation is set only after the code passes';
    elsif tg_op = 'UPDATE'
      and new.email_confirmed_at is distinct from old.email_confirmed_at
      and not (
        old.email_confirmed_at is null
        and new.email_confirmed_at is not null
        and new.id is not distinct from old.id
        and current_setting('dentassist.patient_email_confirm', true)
          is not distinct from old.id::text
      )
    then
      raise exception 'email confirmation is set only after the code passes';
    end if;
  end if;

  return new;
end;
$$;

comment on function private.protect_patient_account() is
  'Keeps the auth user immutable. A signed-in or anonymous session cannot fill email_confirmed_at on insert, and can set it from null only when dentassist.patient_email_confirm equals the account id. An email change clears the confirmation.';

comment on column public.patient_accounts.email_confirmed_at is
  'Null until the registration code passes. Signed-in users cannot write this column. confirm_patient_email sets it from null only when dentassist.patient_email_confirm equals the account id.';

create or replace function public.patient_email_challenge_quota(p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_account public.patient_accounts%rowtype;
  v_ip_hash text := lower(btrim(p_ip_hash));
  v_email_sends integer;
  v_network_sends integer;
begin
  if auth.uid() is null or v_ip_hash is null or v_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select account.*
  into v_account
  from public.patient_accounts as account
  where account.user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform private.lock_patient_email(v_account.email);

  select count(*)::integer
  into v_email_sends
  from public.patient_email_challenges as challenge
  where lower(challenge.email) = lower(v_account.email)
    and challenge.created_at > now() - interval '1 hour';

  select count(*)::integer
  into v_network_sends
  from public.patient_email_challenges as challenge
  where challenge.ip_hash = v_ip_hash
    and challenge.created_at > now() - interval '1 hour';

  return jsonb_build_object(
    'status', 'ok',
    'email_sends', v_email_sends,
    'network_sends', v_network_sends
  );
end;
$fn$;

comment on function public.patient_email_challenge_quota(text) is
  'Counts sends of the signed-in account email and of that network in the last hour. Does not return code_hash. Captcha after 10 network sends stays in the server action.';

create or replace function public.start_patient_email_challenge(
  p_code_hash text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_account public.patient_accounts%rowtype;
  v_ip_hash text := lower(btrim(p_ip_hash));
  v_email_sends integer;
  v_created timestamptz;
  v_previous timestamptz;
begin
  if auth.uid() is null
    or p_code_hash is null
    or char_length(p_code_hash) > 300
    or p_code_hash !~ $re$^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/_-]+={0,2}\$[A-Za-z0-9+/_-]+={0,2}$$re$
    or v_ip_hash is null
    or v_ip_hash !~ '^[0-9a-f]{64}$'
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  select account.*
  into v_account
  from public.patient_accounts as account
  where account.user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform private.lock_patient_email(v_account.email);

  if v_account.email_confirmed_at is not null then
    return jsonb_build_object('status', 'already_confirmed');
  end if;

  select count(*)::integer
  into v_email_sends
  from public.patient_email_challenges as challenge
  where lower(challenge.email) = lower(v_account.email)
    and challenge.created_at > now() - interval '1 hour';

  if v_email_sends >= 3 then
    return jsonb_build_object('status', 'rate_limit');
  end if;

  -- now() is stable inside a transaction, so two sends would tie.
  -- clock_timestamp() keeps the newest row the one inserted last.
  v_created := clock_timestamp();
  select max(challenge.created_at)
  into v_previous
  from public.patient_email_challenges as challenge
  where lower(challenge.email) = lower(v_account.email);

  if v_previous is not null and v_created <= v_previous then
    v_created := v_previous + interval '1 microsecond';
  end if;

  insert into public.patient_email_challenges (
    email, code_hash, ip_hash, created_at, expires_at
  ) values (
    v_account.email,
    p_code_hash,
    v_ip_hash,
    v_created,
    v_created + interval '10 minutes'
  );

  return jsonb_build_object('status', 'ok');
end;
$fn$;

comment on function public.start_patient_email_challenge(text, text) is
  'Stores a challenge for the signed-in account when that email was sent fewer than three times in the last hour. already_confirmed and rate_limit write nothing. Does not check Turnstile and does not return code_hash.';

create or replace function public.abandon_patient_email_challenge(p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_account public.patient_accounts%rowtype;
  v_challenge public.patient_email_challenges%rowtype;
  v_deleted uuid;
begin
  if auth.uid() is null
    or p_code_hash is null
    or char_length(p_code_hash) > 300
    or p_code_hash !~ $re$^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/_-]+={0,2}\$[A-Za-z0-9+/_-]+={0,2}$$re$
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  select account.*
  into v_account
  from public.patient_accounts as account
  where account.user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform private.lock_patient_email(v_account.email);

  select challenge.*
  into v_challenge
  from public.patient_email_challenges as challenge
  where lower(challenge.email) = lower(v_account.email)
  order by challenge.created_at desc
  limit 1
  for update;

  if not found
    or v_challenge.code_hash is distinct from p_code_hash
    or v_challenge.consumed_at is not null
    or v_challenge.attempt_count <> 0
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  delete from public.patient_email_challenges
  where id = v_challenge.id
    and consumed_at is null
    and attempt_count = 0
  returning id into v_deleted;

  if v_deleted is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  return jsonb_build_object('status', 'ok');
end;
$fn$;

comment on function public.abandon_patient_email_challenge(text) is
  'Deletes the newest unused challenge when its hash matches and the mail never left. An older or already used row stays. Does not return code_hash.';

create or replace function public.confirm_patient_email(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_account public.patient_accounts%rowtype;
  v_challenge public.patient_email_challenges%rowtype;
  v_match boolean;
  v_attempts integer;
  v_consumed uuid;
  v_confirmed uuid;
begin
  if auth.uid() is null or p_code is null or p_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select account.*
  into v_account
  from public.patient_accounts as account
  where account.user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform private.lock_patient_email(v_account.email);

  if v_account.email_confirmed_at is not null then
    return jsonb_build_object('status', 'already_confirmed');
  end if;

  select challenge.*
  into v_challenge
  from public.patient_email_challenges as challenge
  where lower(challenge.email) = lower(v_account.email)
  order by challenge.created_at desc
  limit 1
  for update;

  -- A newer row shadows every older code, including after it is dead.
  if not found
    or v_challenge.consumed_at is not null
    or v_challenge.expires_at <= now()
    or v_challenge.attempt_count >= 5
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_match := pgsodium.crypto_pwhash_str_verify(
    convert_to(v_challenge.code_hash, 'UTF8'),
    convert_to(p_code, 'UTF8')
  );

  if v_match is not true then
    update public.patient_email_challenges
    set attempt_count = attempt_count + 1
    where id = v_challenge.id
      and consumed_at is null
      and expires_at > now()
      and attempt_count < 5
    returning attempt_count into v_attempts;

    if v_attempts is null or v_attempts >= 5 then
      return jsonb_build_object('status', 'invalid');
    end if;

    return jsonb_build_object('status', 'wrong');
  end if;

  update public.patient_email_challenges
  set consumed_at = now()
  where id = v_challenge.id
    and consumed_at is null
    and expires_at > now()
    and attempt_count < 5
  returning id into v_consumed;

  if v_consumed is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform set_config('dentassist.patient_email_confirm', v_account.id::text, true);

  update public.patient_accounts
  set email_confirmed_at = now()
  where id = v_account.id
    and user_id = auth.uid()
    and email_confirmed_at is null
  returning id into v_confirmed;

  if v_confirmed is null then
    raise exception 'email confirmation is set only after the code passes';
  end if;

  return jsonb_build_object('status', 'ok');
end;
$fn$;

comment on function public.confirm_patient_email(text) is
  'Checks a 6-digit code against the newest challenge hash inside the database. The fifth wrong code disables that row. A correct code sets consumed_at, then email_confirmed_at. Does not return code_hash.';

revoke all on function private.lock_patient_email(text)
  from public, anon, authenticated, service_role;

revoke all on function public.patient_email_challenge_quota(text)
  from public, anon, authenticated, service_role;
revoke all on function public.start_patient_email_challenge(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.abandon_patient_email_challenge(text)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_patient_email(text)
  from public, anon, authenticated, service_role;

grant execute on function public.patient_email_challenge_quota(text) to authenticated;
grant execute on function public.start_patient_email_challenge(text, text) to authenticated;
grant execute on function public.abandon_patient_email_challenge(text) to authenticated;
grant execute on function public.confirm_patient_email(text) to authenticated;

notify pgrst, 'reload schema';
