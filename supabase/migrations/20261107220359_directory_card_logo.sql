-- Include each clinic's logo path in directory search results.
alter type public.clinic_directory_hit add attribute logo_path text;

create or replace function public.search_clinics(
  city text default null,
  name text default null,
  lat double precision default null,
  lng double precision default null,
  max_distance_km double precision default null
)
returns setof public.clinic_directory_hit
language sql
stable
security definer
set search_path = public
as $$
  with matched as (
    select
      clinic.name,
      clinic.address,
      clinic.phone,
      clinic.slug,
      case
        when search_clinics.lat is null
          or search_clinics.lng is null
          or clinic.latitude is null
          or clinic.longitude is null
        then null
        else 6371.0088 * 2 * asin(
          least(
            1::double precision,
            sqrt(
              greatest(
                0::double precision,
                power(sin(radians(clinic.latitude - search_clinics.lat) / 2), 2)
                + cos(radians(search_clinics.lat))
                  * cos(radians(clinic.latitude))
                  * power(sin(radians(clinic.longitude - search_clinics.lng) / 2), 2)
              )
            )
          )
        )
      end as distance_km,
      clinic.latitude,
      clinic.longitude,
      btrim(clinic.city) as city,
      clinic.logo_path
    from public.clinics as clinic
    where clinic.status = 'active'
      and clinic.setup_completed_at is not null
      and clinic.online_booking_enabled
      and (
        (
          nullif(btrim(search_clinics.name), '') is not null
          and position(
            lower(btrim(search_clinics.name)) in lower(clinic.name)
          ) > 0
        )
        or (
          nullif(btrim(search_clinics.name), '') is null
          and (
            nullif(btrim(search_clinics.city), '') is null
            or lower(btrim(clinic.city)) = lower(btrim(search_clinics.city))
          )
        )
      )
  )
  select
    matched.name,
    matched.address,
    matched.phone,
    matched.slug,
    matched.distance_km,
    matched.latitude,
    matched.longitude,
    matched.city,
    matched.logo_path
  from matched
  where search_clinics.max_distance_km is null
    or search_clinics.lat is null
    or search_clinics.lng is null
    or (
      matched.distance_km is not null
      and matched.distance_km <= search_clinics.max_distance_km
    )
  order by matched.distance_km asc nulls last, matched.name asc, matched.slug asc;
$$;

comment on type public.clinic_directory_hit is
  'One directory card. city is the clinic city and logo_path identifies its public logo. distance_km is null without an origin or without a pin. Coordinates are the public map pin.';

comment on function public.search_clinics(text, text, double precision, double precision, double precision) is
  'Directory search. Returns name, address, phone, slug, distance, map pin, city, and logo path. No appointments.';

notify pgrst, 'reload schema';
