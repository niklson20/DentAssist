-- Platform administrators can edit the clinic details shown in the platform panel
-- and restore access after a clinic has been paused.

create or replace function public.update_platform_clinic_details(
  p_clinic_id uuid,
  p_name text,
  p_city text,
  p_address text,
  p_phone text,
  p_update_coordinates boolean,
  p_latitude double precision,
  p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_name is null or char_length(btrim(p_name)) = 0
    or p_city is null or char_length(btrim(p_city)) = 0
    or p_address is null or char_length(btrim(p_address)) = 0
    or p_phone is null or char_length(btrim(p_phone)) = 0
    or p_update_coordinates is null then
    raise exception 'invalid clinic details';
  end if;

  update public.clinics
  set name = btrim(p_name),
      city = btrim(p_city),
      address = btrim(p_address),
      phone = btrim(p_phone),
      latitude = case when p_update_coordinates then p_latitude else latitude end,
      longitude = case when p_update_coordinates then p_longitude else longitude end
  where id = p_clinic_id;

  if not found then
    raise exception 'clinic not found';
  end if;
end;
$$;

comment on function public.update_platform_clinic_details(uuid, text, text, text, text, boolean, double precision, double precision) is
  'Platform admin updates clinic name, city, address, phone, and refreshed coordinates when the address changes.';

create or replace function public.enable_clinic_access(p_clinic_id uuid)
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
  set status = 'active'
  where id = p_clinic_id
    and status = 'disabled';
end;
$$;

comment on function public.enable_clinic_access(uuid) is
  'Platform admin restores access to a paused clinic.';

revoke all on function public.update_platform_clinic_details(uuid, text, text, text, text, boolean, double precision, double precision),
  public.enable_clinic_access(uuid)
from public, anon;

grant execute on function public.update_platform_clinic_details(uuid, text, text, text, text, boolean, double precision, double precision),
  public.enable_clinic_access(uuid)
to authenticated, service_role;
