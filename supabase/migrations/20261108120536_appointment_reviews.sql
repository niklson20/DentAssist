create table public.appointment_reviews (
  appointment_id uuid primary key references public.appointments (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  dentist_id uuid not null,
  patient_user_id uuid not null references auth.users (id) on delete cascade,
  clinic_rating smallint not null,
  dentist_rating smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_reviews_dentist_clinic_fkey
    foreign key (dentist_id, clinic_id)
    references public.clinic_members (id, clinic_id)
    on delete cascade,
  constraint appointment_reviews_clinic_rating_check
    check (clinic_rating between 1 and 5),
  constraint appointment_reviews_dentist_rating_check
    check (dentist_rating is null or dentist_rating between 1 and 5)
);

comment on table public.appointment_reviews is
  'One clinic rating and optional dentist rating per completed appointment. No public reviewer identity or comment.';

alter table public.appointment_reviews enable row level security;
revoke all on table public.appointment_reviews from public, anon, authenticated, service_role;

create or replace function public.submit_appointment_review(
  p_appointment_id uuid,
  p_clinic_rating integer,
  p_dentist_rating integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_saved_appointment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'patient authentication required';
  end if;

  if p_appointment_id is null
    or p_clinic_rating is null
    or p_clinic_rating not between 1 and 5
    or (p_dentist_rating is not null and p_dentist_rating not between 1 and 5)
  then
    raise exception 'invalid appointment rating';
  end if;

  select lower(account.email)
  into v_email
  from public.patient_accounts as account
  where account.user_id = auth.uid()
    and account.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'patient account required';
  end if;

  insert into public.appointment_reviews (
    appointment_id,
    clinic_id,
    dentist_id,
    patient_user_id,
    clinic_rating,
    dentist_rating
  )
  select
    appointment.id,
    appointment.clinic_id,
    appointment.dentist_id,
    auth.uid(),
    p_clinic_rating,
    p_dentist_rating
  from public.appointments as appointment
  where appointment.id = p_appointment_id
    and appointment.status = 'completed'
    and appointment.ends_at <= now()
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
  on conflict (appointment_id) do update
  set clinic_rating = excluded.clinic_rating,
      dentist_rating = excluded.dentist_rating,
      updated_at = now()
  where appointment_reviews.patient_user_id = auth.uid()
  returning appointment_id into v_saved_appointment_id;

  if v_saved_appointment_id is null then
    raise exception 'appointment is not eligible for this review';
  end if;
end;
$$;

comment on function public.submit_appointment_review(uuid, integer, integer) is
  'Creates or updates the signed-in patient''s rating for their own completed, past appointment.';

revoke all on function public.submit_appointment_review(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_appointment_review(uuid, integer, integer)
  to authenticated;

create or replace function public.get_public_rating_summaries(p_slugs text[])
returns table (
  clinic_slug text,
  dentist_id uuid,
  rating_average numeric,
  rating_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_clinics as (
    select clinic.id, clinic.slug
    from public.clinics as clinic
    where clinic.slug = any(coalesce(p_slugs, '{}'::text[]))
      and clinic.status = 'active'
      and clinic.setup_completed_at is not null
      and clinic.online_booking_enabled
  )
  select
    clinic.slug,
    null::uuid,
    round(avg(review.clinic_rating)::numeric, 1),
    count(*)::bigint
  from visible_clinics as clinic
  join public.appointment_reviews as review
    on review.clinic_id = clinic.id
  group by clinic.slug
  union all
  select
    clinic.slug,
    member.id,
    round(avg(review.dentist_rating)::numeric, 1),
    count(*)::bigint
  from visible_clinics as clinic
  join public.clinic_members as member
    on member.clinic_id = clinic.id
    and member.sees_patients
    and member.listed_online
    and not member.unavailable
  join public.appointment_reviews as review
    on review.clinic_id = clinic.id
    and review.dentist_id = member.id
    and review.dentist_rating is not null
  group by clinic.slug, member.id;
$$;

comment on function public.get_public_rating_summaries(text[]) is
  'Public aggregate ratings for visible clinics and their listed dentists. Does not expose reviewers.';

revoke all on function public.get_public_rating_summaries(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_rating_summaries(text[])
  to anon, authenticated;

drop function public.list_my_appointments_all();

create function public.list_my_appointments_all()
returns table (
  appointment_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  clinic_name text,
  dentist_first_name text,
  dentist_last_name text,
  status text,
  clinic_rating smallint,
  dentist_rating smallint
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
    appointment.id,
    appointment.starts_at,
    appointment.ends_at,
    clinic.name,
    member.first_name,
    member.last_name,
    appointment.status,
    case when review.patient_user_id = auth.uid() then review.clinic_rating end,
    case when review.patient_user_id = auth.uid() then review.dentist_rating end
  from public.appointments as appointment
  join public.clinics as clinic
    on clinic.id = appointment.clinic_id
  join public.clinic_members as member
    on member.id = appointment.dentist_id
    and member.clinic_id = appointment.clinic_id
  left join public.appointment_reviews as review
    on review.appointment_id = appointment.id
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
  'Chronological appointments for the authenticated patient account, including its own review ratings.';

revoke all on function public.list_my_appointments_all()
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_appointments_all() to authenticated;
