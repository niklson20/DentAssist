create or replace function public.list_my_appointments_all()
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  clinic_name text,
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
  v_email text;
begin
  if auth.uid() is null then
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
    clinic.name,
    member.first_name,
    member.last_name,
    appointment.status
  from public.appointments as appointment
  join public.clinics as clinic
    on clinic.id = appointment.clinic_id
  join public.clinic_members as member
    on member.id = appointment.dentist_id
    and member.clinic_id = appointment.clinic_id
  where
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
  order by appointment.starts_at, clinic.name, member.last_name, member.first_name;
end;
$$;

comment on function public.list_my_appointments_all() is
  'Chronological appointments for the authenticated patient account across clinics; excludes clinical notes and procedure details.';

revoke all on function public.list_my_appointments_all()
  from public, anon, authenticated, service_role;

grant execute on function public.list_my_appointments_all() to authenticated;
