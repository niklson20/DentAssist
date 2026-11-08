create or replace function public.get_clinic_rating_details(
  p_clinic_id uuid,
  p_dentist_id uuid default null
)
returns table (
  appointment_id uuid,
  reviewer_name text,
  dentist_name text,
  clinic_rating smallint,
  dentist_rating smallint,
  starts_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or p_clinic_id is null
    or not public.is_owner()
    or public.current_clinic_id() is distinct from p_clinic_id
  then
    raise exception 'clinic owner access required';
  end if;

  return query
  select
    review.appointment_id,
    concat_ws(' ', account.first_name, account.last_name),
    concat_ws(' ', dentist.first_name, dentist.last_name),
    review.clinic_rating,
    review.dentist_rating,
    appointment.starts_at,
    review.created_at
  from public.appointment_reviews as review
  join public.patient_accounts as account
    on account.user_id = review.patient_user_id
  join public.appointments as appointment
    on appointment.id = review.appointment_id
    and appointment.clinic_id = review.clinic_id
  join public.clinic_members as dentist
    on dentist.id = review.dentist_id
    and dentist.clinic_id = review.clinic_id
  where review.clinic_id = p_clinic_id
    and (p_dentist_id is null or review.dentist_id = p_dentist_id)
  order by review.created_at desc, review.appointment_id;
end;
$$;

comment on function public.get_clinic_rating_details(uuid, uuid) is
  'Returns reviewer names and ratings only to the owner of the matching clinic.';

revoke all on function public.get_clinic_rating_details(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_clinic_rating_details(uuid, uuid)
  to authenticated;
