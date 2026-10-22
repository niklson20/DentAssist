-- Settings PIN gate (2.C10).
-- The signed-in owner reads their own Argon2id hash so the server can verify
-- the settings PIN. authenticated still cannot SELECT pin_hash.
-- Other roles get no hash. service_role does not call this.
-- The reception failure counter stays untouched.

create or replace function public.read_owner_settings_pin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_hash text;
begin
  if auth.uid() is null or not public.is_owner() then
    return jsonb_build_object('status', 'invalid');
  end if;

  select member.pin_hash
  into v_hash
  from public.clinic_members as member
  where member.user_id = auth.uid()
    and member.role = 'owner';

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_hash is null then
    return jsonb_build_object('status', 'unset');
  end if;

  return jsonb_build_object('status', 'ready', 'pin_hash', v_hash);
end;
$fn$;

comment on function public.read_owner_settings_pin() is
  'Argon2id PIN hash of the signed-in owner. Other roles and an empty hash omit the hash.';

revoke all on function public.read_owner_settings_pin()
  from public, anon, authenticated, service_role;

grant execute on function public.read_owner_settings_pin() to authenticated;

notify pgrst, 'reload schema';
