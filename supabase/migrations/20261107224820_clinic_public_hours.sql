alter type public.clinic_public_page
  add attribute weekday_opens_at time;

alter type public.clinic_public_page
  add attribute weekday_closes_at time;

alter type public.clinic_public_page
  add attribute weekend_opens_at time;

alter type public.clinic_public_page
  add attribute weekend_closes_at time;

alter type public.clinic_public_page
  add attribute weekday_has_schedule boolean;

alter type public.clinic_public_page
  add attribute weekend_has_schedule boolean;

comment on type public.clinic_public_page is
  'Public clinic page. dentists is a json array of id, first_name, and last_name. Public hours are approximate ranges aggregated from listed online dentists; *_has_schedule distinguishes closed days from missing schedules. Legal columns are absent.';

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
    clinic.default_duration_min,
    schedule.weekday_opens_at,
    schedule.weekday_closes_at,
    schedule.weekend_opens_at,
    schedule.weekend_closes_at,
    schedule.weekday_has_schedule,
    schedule.weekend_has_schedule
  from public.clinics as clinic
  left join lateral (
    select
      min(hours.opens_at) filter (where hours.iso_dow between 1 and 5) as weekday_opens_at,
      max(hours.closes_at) filter (where hours.iso_dow between 1 and 5) as weekday_closes_at,
      min(hours.opens_at) filter (where hours.iso_dow between 6 and 7) as weekend_opens_at,
      max(hours.closes_at) filter (where hours.iso_dow between 6 and 7) as weekend_closes_at,
      count(hours.iso_dow) filter (where hours.iso_dow between 1 and 5) > 0 as weekday_has_schedule,
      count(hours.iso_dow) filter (where hours.iso_dow between 6 and 7) > 0 as weekend_has_schedule
    from public.working_hours as hours
    join public.clinic_members as member
      on member.id = hours.clinic_member_id
      and member.clinic_id = hours.clinic_id
    where hours.clinic_id = clinic.id
      and member.sees_patients
      and member.listed_online
      and not member.unavailable
  ) as schedule on true
  where clinic.slug = btrim(get_clinic_public.slug)
    and clinic.status = 'active'
    and clinic.setup_completed_at is not null
    and clinic.online_booking_enabled;
$$;
