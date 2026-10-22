-- Expose booking window metadata on the public clinic page (2.D4 day bar).

alter type public.clinic_public_page
  add attribute max_ahead_days integer;

alter type public.clinic_public_page
  add attribute default_duration_min smallint;

comment on type public.clinic_public_page is
  'Public clinic page. dentists is a json array of id, first_name, and last_name. max_ahead_days and default_duration_min drive the patient slot bar. Legal columns are absent.';

create or replace function public.get_clinic_public(slug text)
returns setof public.clinic_public_page
language sql
stable
security definer
set search_path = public
as $$
  select
    clinic.name,
    clinic.slug,
    clinic.city,
    clinic.address,
    clinic.phone,
    clinic.logo_path,
    clinic.description,
    clinic.latitude,
    clinic.longitude,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', member.id,
            'first_name', member.first_name,
            'last_name', member.last_name
          )
          order by member.last_name, member.first_name, member.id
        )
        from public.clinic_members as member
        where member.clinic_id = clinic.id
          and member.sees_patients
          and member.listed_online
          and not member.unavailable
      ),
      '[]'::jsonb
    ) as dentists,
    clinic.max_ahead_days,
    clinic.default_duration_min
  from public.clinics as clinic
  where clinic.slug = btrim(get_clinic_public.slug)
    and clinic.status = 'active'
    and clinic.setup_completed_at is not null
    and clinic.online_booking_enabled;
$$;
