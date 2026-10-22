-- Staff account PIN (2.C9).
-- The signed-in member stores an Argon2id hash of a 6-digit PIN.
-- First setup only: a second call does not replace the hash.
-- authenticated cannot UPDATE pin_hash, and reception cannot UPDATE the row,
-- so this function is security definer and touches only auth.uid().
-- The hash is not returned. service_role does not call it.

create or replace function public.set_own_pin(p_pin_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
  v_hash text;
  v_updated uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if p_pin_hash is null
    or char_length(p_pin_hash) > 300
    or p_pin_hash !~ $re$^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/_-]+={0,2}\$[A-Za-z0-9+/_-]+={0,2}$$re$
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  select member.id, member.pin_hash
  into v_id, v_hash
  from public.clinic_members as member
  where member.user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_hash is not null then
    return jsonb_build_object('status', 'already_set');
  end if;

  update public.clinic_members
  set pin_hash = p_pin_hash
  where id = v_id
    and user_id = auth.uid()
    and pin_hash is null
  returning id into v_updated;

  if v_updated is null then
    return jsonb_build_object('status', 'already_set');
  end if;

  return jsonb_build_object('status', 'ok');
end;
$fn$;

comment on function public.set_own_pin(text) is
  'Stores an Argon2id PIN hash on the signed-in member when pin_hash is empty. Does not return the hash.';

create or replace function public.own_pin_is_set()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members as member
    where member.user_id = auth.uid()
      and member.pin_hash is not null
  );
$$;

comment on function public.own_pin_is_set() is
  'True when the signed-in member already has a PIN hash. The hash stays hidden.';

revoke all on function public.set_own_pin(text)
  from public, anon, authenticated, service_role;
revoke all on function public.own_pin_is_set()
  from public, anon, authenticated, service_role;

grant execute on function public.set_own_pin(text) to authenticated;
grant execute on function public.own_pin_is_set() to authenticated;

notify pgrst, 'reload schema';
