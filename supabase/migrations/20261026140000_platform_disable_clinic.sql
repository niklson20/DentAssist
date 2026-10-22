-- Platform clinic shutdown (2.B3): disable access and staff login check.

create or replace function public.disable_clinic_access(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  update public.clinics
  set status = 'disabled'
  where id = p_clinic_id
    and status = 'active';
end;
$$;

comment on function public.disable_clinic_access(uuid) is
  'Platform admin sets clinic status to disabled. Removes the clinic from the directory.';

create or replace function public.is_staff_clinic_disabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members as member
    join public.clinics as clinic on clinic.id = member.clinic_id
    where member.user_id = auth.uid()
      and clinic.status = 'disabled'
  );
$$;

comment on function public.is_staff_clinic_disabled() is
  'True when the signed-in staff member belongs to a disabled clinic.';

revoke all on function public.disable_clinic_access(uuid), public.is_staff_clinic_disabled()
from public, anon;

grant execute on function public.disable_clinic_access(uuid), public.is_staff_clinic_disabled()
to authenticated, service_role;
