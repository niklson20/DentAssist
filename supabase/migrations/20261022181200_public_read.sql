-- Public directory reads (1.7): list_cities, search_clinics, get_clinic_public.
-- security definer so anon can read the directory without SELECT on tables.
-- A clinic is visible when it is active, setup is finished, and online booking
-- is on. Slots, booking writes, and legal columns are not part of this migration.
-- Dentist names are members who see patients, are listed online, and are not
-- unavailable. The member id is returned so a later slot call can name them;
-- the auth user id is not.

create type public.clinic_directory_hit as (
  name text,
  address text,
  phone text,
  slug text,
  distance_km double precision,
  latitude double precision,
  longitude double precision
);

comment on type public.clinic_directory_hit is
  'One directory card. distance_km is null without an origin or without a pin. Coordinates are the public map pin.';

create type public.clinic_public_page as (
  name text,
  slug text,
  city text,
  address text,
  phone text,
  logo_path text,
  description text,
  latitude double precision,
  longitude double precision,
  dentists jsonb
);

comment on type public.clinic_public_page is
  'Public clinic page. dentists is a json array of id, first_name, and last_name. Legal columns are absent.';

create or replace function public.list_cities()
returns table (city text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct btrim(clinic.city) as city
  from public.clinics as clinic
  where clinic.status = 'active'
    and clinic.setup_completed_at is not null
    and clinic.online_booking_enabled
  order by city;
$$;

comment on function public.list_cities() is
  'Cities that have a clinic visible in the directory. anon and authenticated only.';

-- Arguments: $1 city, $2 name, $3 lat, $4 lng.
-- A non-blank name searches the whole country and ignores city.
create or replace function public.search_clinics(
  city text default null,
  name text default null,
  lat double precision default null,
  lng double precision default null
)
returns setof public.clinic_directory_hit
language sql
stable
security definer
set search_path = public
as $$
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
    clinic.longitude
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
  order by distance_km asc nulls last, clinic.name asc, clinic.slug asc;
$$;

comment on function public.search_clinics(text, text, double precision, double precision) is
  'Directory search. Returns name, address, phone, slug, distance, and the map pin. No appointments.';

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
    ) as dentists
  from public.clinics as clinic
  where clinic.slug = btrim(get_clinic_public.slug)
    and clinic.status = 'active'
    and clinic.setup_completed_at is not null
    and clinic.online_booking_enabled;
$$;

comment on function public.get_clinic_public(text) is
  'Public clinic page and the dentists listed online. Empty when the slug is not a visible clinic.';

revoke all on function public.list_cities() from public, anon, authenticated, service_role;
revoke all on function public.search_clinics(text, text, double precision, double precision)
  from public, anon, authenticated, service_role;
revoke all on function public.get_clinic_public(text) from public, anon, authenticated, service_role;

grant execute on function public.list_cities() to anon, authenticated;
grant execute on function public.search_clinics(text, text, double precision, double precision)
  to anon, authenticated;
grant execute on function public.get_clinic_public(text) to anon, authenticated;
