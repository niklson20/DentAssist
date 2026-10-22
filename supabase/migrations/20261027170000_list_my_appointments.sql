-- Patient appointments in one clinic (2.D13).
-- A signed-in patient account sees start, end, dentist name, and status.
-- The row must belong to that account email and to the clinic slug argument.
-- Another clinic is not returned. anon and service_role cannot execute.

create or replace function public.list_my_appointments(slug text)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  dentist_first_name text,
  dentist_last_name text,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := lower(btrim(slug));
  v_email text;
begin
  if auth.uid() is null
    or v_slug is null
    or v_slug = ''
    or char_length(v_slug) > 200
    or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  then
    return;
  end if;

  select lower(account.email)
  into v_email
  from public.patient_accounts as account
  where account.user_id = auth.uid();

  if v_email is null then
    return;
  end if;

  return query
  select
    appointment.starts_at,
    appointment.ends_at,
    member.first_name,
    member.last_name,
    appointment.status
  from public.appointments as appointment
  join public.clinics as clinic
    on clinic.id = appointment.clinic_id
  join public.clinic_members as member
    on member.id = appointment.dentist_id
    and member.clinic_id = appointment.clinic_id
  where lower(clinic.slug) = v_slug
    and (
      exists (
        select 1
        from public.booking_requests as request
        where request.clinic_id = appointment.clinic_id
          and request.booker_email is not null
          and request.pii_purged_at is null
          and lower(request.booker_email) = v_email
          and (
            request.id = appointment.booking_request_id
            or request.appointment_id = appointment.id
            or exists (
              select 1
              from public.appointment_offers as offer
              where offer.booking_request_id = request.id
                and offer.appointment_id = appointment.id
            )
          )
      )
      or exists (
        select 1
        from public.patients as patient
        where patient.id = appointment.patient_id
          and patient.clinic_id = appointment.clinic_id
          and patient.email is not null
          and lower(patient.email) = v_email
      )
      or exists (
        select 1
        from public.patient_contacts as contact
        where contact.patient_id = appointment.patient_id
          and contact.clinic_id = appointment.clinic_id
          and contact.email is not null
          and lower(contact.email) = v_email
      )
    )
  order by appointment.starts_at, appointment.id;
end;
$$;

comment on function public.list_my_appointments(text) is
  'Appointments of the signed-in patient email in one clinic: start, end, dentist name, and status.';

revoke all on function public.list_my_appointments(text)
  from public, anon, authenticated, service_role;

grant execute on function public.list_my_appointments(text) to authenticated;
