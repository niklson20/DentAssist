-- Token transitions and hourly jobs (1.10).
-- choose_offer, decline_offers, reschedule_by_token, and cancel_by_token
-- are signed-in patients only. anon has no execute.
-- The token argument is the lowercase hex HMAC-SHA-256 of the raw link
-- token. The application computes it with TOKEN_PEPPER from .env.local.
-- The pepper is not stored in the database.
-- expire_booking_requests, purge_booking_request_pii, and due_reminders
-- are service_role only.
-- save_visit already rejects a write 24 hours after ends_at, including
-- for the owner. This migration does not replace it.
-- Offer rows stay after the appointment leaves status offered, so a later
-- reschedule or cancel can still see which slots were offered.

alter table public.visits
  drop constraint visits_appointment_clinic_patient_fkey;

alter table public.visits
  add constraint visits_appointment_clinic_patient_fkey
  foreign key (appointment_id, clinic_id, patient_id)
  references public.appointments (id, clinic_id, patient_id)
  on delete cascade
  deferrable initially immediate;

create or replace function private.guard_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.clinic_id is distinct from old.clinic_id then
    raise exception 'appointment clinic is immutable';
  end if;

  new.status := btrim(new.status);
  new.source := btrim(new.source);
  new.note := nullif(btrim(new.note), '');
  new.cancellation_note := nullif(btrim(new.cancellation_note), '');

  if new.cancelled_by is not null then
    new.cancelled_by := btrim(new.cancelled_by);
  end if;

  perform public.assert_slot_grid(new.clinic_id, new.starts_at, new.ends_at);

  if not exists (
    select 1
    from public.clinic_members as member
    where member.id = new.dentist_id
      and member.clinic_id = new.clinic_id
      and member.sees_patients
      and member.role in ('owner', 'dentist')
  ) then
    raise exception 'appointment dentist must be a dentist or an owner who sees patients';
  end if;

  if public.is_reception()
    and new.status = 'completed'
    and (tg_op = 'INSERT' or old.status is distinct from 'completed')
  then
    raise exception 'reception cannot complete an appointment';
  end if;

  if tg_op = 'UPDATE'
    and old.status = 'scheduled'
    and new.status = 'cancelled'
    and new.cancelled_by = 'staff'
    and new.cancellation_note is null
  then
    raise exception 'cancellation note is required when staff cancels a scheduled appointment';
  end if;

  -- Block only the leave-offered step. Once the transition functions have
  -- moved the row, the offer record may remain.
  if tg_op = 'UPDATE'
    and old.status = 'offered'
    and new.status is distinct from 'offered'
    and exists (
      select 1
      from public.appointment_offers
      where appointment_id = new.id
    )
    and coalesce(current_setting('dentassist.booking_transition', true), '')
      not in ('offer', 'expire')
  then
    raise exception 'an offer still holds this appointment';
  end if;

  if tg_op = 'UPDATE'
    and new.booking_request_id is distinct from old.booking_request_id
    and exists (
      select 1
      from public.appointment_offers
      where appointment_id = new.id
    )
  then
    raise exception 'appointment request is locked by an offer';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.patient_id is distinct from old.patient_id
      or new.clinic_id is distinct from old.clinic_id
    )
    and exists (
      select 1
      from public.visits
      where appointment_id = new.id
    )
    and coalesce(current_setting('dentassist.booking_transition', true), '')
      is distinct from 'merge'
  then
    raise exception 'appointment identity is locked by a visit';
  end if;

  return new;
end;
$$;

create or replace function private.guard_booking_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_email text;
  account_confirmed_at timestamptz;
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.clinic_id is distinct from old.clinic_id
    or new.account_id is distinct from old.account_id
    or new.dentist_id is distinct from old.dentist_id
    or new.for_child is distinct from old.for_child
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'booking request identity is immutable';
  end if;

  if tg_op = 'UPDATE'
    and old.patient_id is not null
    and new.patient_id is distinct from old.patient_id
    and coalesce(current_setting('dentassist.booking_transition', true), '')
      is distinct from 'merge'
  then
    raise exception 'accepted chart is immutable';
  end if;

  if tg_op = 'UPDATE'
    and old.pii_purged_at is not null
    and new.pii_purged_at is distinct from old.pii_purged_at
  then
    raise exception 'purged booking request stays purged';
  end if;

  new.status := btrim(new.status);
  new.booker_email := nullif(btrim(new.booker_email), '');
  new.patient_first_name := nullif(btrim(new.patient_first_name), '');
  new.patient_last_name := nullif(btrim(new.patient_last_name), '');
  new.patient_phone := nullif(btrim(new.patient_phone), '');
  new.contact_relationship := nullif(btrim(new.contact_relationship), '');
  new.contact_first_name := nullif(btrim(new.contact_first_name), '');
  new.contact_last_name := nullif(btrim(new.contact_last_name), '');
  new.contact_phone := nullif(btrim(new.contact_phone), '');
  new.reason := nullif(btrim(new.reason), '');
  new.patient_note := nullif(btrim(new.patient_note), '');

  if tg_op = 'INSERT' and not exists (
    select 1
    from public.clinic_members as member
    where member.id = new.dentist_id
      and member.clinic_id = new.clinic_id
      and member.sees_patients
      and member.role in ('owner', 'dentist')
  ) then
    raise exception 'booking request dentist must be a dentist or an owner who sees patients';
  end if;

  if new.pii_purged_at is null then
    select patient_accounts.email, patient_accounts.email_confirmed_at
    into account_email, account_confirmed_at
    from public.patient_accounts
    where patient_accounts.id = new.account_id;

    if account_confirmed_at is null then
      raise exception 'booking request requires a confirmed patient account';
    end if;

    if lower(new.booker_email) is distinct from lower(account_email) then
      raise exception 'booker email must be the patient account email';
    end if;
  end if;

  if new.appointment_id is not null and not exists (
    select 1
    from public.appointments as appointment
    where appointment.id = new.appointment_id
      and appointment.clinic_id = new.clinic_id
      and appointment.dentist_id = new.dentist_id
      and (
        appointment.booking_request_id is null
        or appointment.booking_request_id = new.id
      )
  ) then
    raise exception 'request appointment must be the same clinic and dentist';
  end if;

  if new.status = 'accepted'
    and (tg_op = 'INSERT' or old.status is distinct from 'accepted')
    and coalesce(current_setting('dentassist.booking_transition', true), '')
      is distinct from 'offer'
    and not (
      public.is_owner()
      and public.current_clinic_id() = new.clinic_id
    )
    and not exists (
      select 1
      from public.clinic_members as member
      where member.id = new.dentist_id
        and member.clinic_id = new.clinic_id
        and member.user_id = auth.uid()
        and member.role = 'dentist'
    )
  then
    raise exception 'only the owner or that dentist can accept a request';
  end if;

  return new;
end;
$$;

create or replace function private.guard_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  appointment_status text;
  appointment_end timestamptz;
  appointment_clinic uuid;
  appointment_patient uuid;
begin
  new.procedure_description := nullif(btrim(new.procedure_description), '');
  new.recommendations := nullif(btrim(new.recommendations), '');
  new.treatment_plan := nullif(btrim(new.treatment_plan), '');
  new.internal_notes := nullif(btrim(new.internal_notes), '');

  if tg_op = 'UPDATE'
    and coalesce(current_setting('dentassist.booking_transition', true), '') = 'merge'
    and new.id is not distinct from old.id
    and new.appointment_id is not distinct from old.appointment_id
    and new.clinic_id is not distinct from old.clinic_id
    and new.recorded_at is not distinct from old.recorded_at
    and new.procedure_description is not distinct from old.procedure_description
    and new.recommendations is not distinct from old.recommendations
    and new.treatment_plan is not distinct from old.treatment_plan
    and new.internal_notes is not distinct from old.internal_notes
    and new.patient_id is distinct from old.patient_id
  then
    select
      appointments.status,
      appointments.clinic_id,
      appointments.patient_id
    into appointment_status, appointment_clinic, appointment_patient
    from public.appointments
    where appointments.id = new.appointment_id;

    if appointment_status is distinct from 'completed'
      or new.clinic_id is distinct from appointment_clinic
      or new.patient_id is distinct from appointment_patient
    then
      raise exception 'a visit can be saved only for a completed appointment';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' and (
    new.appointment_id is distinct from old.appointment_id
    or new.clinic_id is distinct from old.clinic_id
    or new.patient_id is distinct from old.patient_id
    or new.recorded_at is distinct from old.recorded_at
    or new.id is distinct from old.id
  ) then
    raise exception 'visit identity is immutable';
  end if;

  select
    appointments.status,
    appointments.ends_at,
    appointments.clinic_id,
    appointments.patient_id
  into
    appointment_status,
    appointment_end,
    appointment_clinic,
    appointment_patient
  from public.appointments
  where appointments.id = new.appointment_id;

  if appointment_status is distinct from 'completed'
    or new.clinic_id is distinct from appointment_clinic
    or new.patient_id is distinct from appointment_patient
  then
    raise exception 'a visit can be saved only for a completed appointment';
  end if;

  if now() >= appointment_end + interval '24 hours' then
    raise exception 'a visit cannot change 24 hours after the appointment ends';
  end if;

  return new;
end;
$$;

create or replace function private.chart_slug(
  p_clinic_id uuid,
  p_first_name text,
  p_last_name text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_slug text;
  v_suffix integer := 2;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('chart-slug:' || p_clinic_id::text, 0)
  );

  v_base := lower(
    btrim(coalesce(p_first_name, '')) || '-' || btrim(coalesce(p_last_name, ''))
  );
  v_base := replace(v_base, 'dž', 'dz');
  v_base := replace(v_base, 'đ', 'dj');
  v_base := replace(v_base, 'č', 'c');
  v_base := replace(v_base, 'ć', 'c');
  v_base := replace(v_base, 'š', 's');
  v_base := replace(v_base, 'ž', 'z');
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);

  if v_base is null or v_base = '' then
    v_base := 'karton';
  end if;

  v_slug := v_base;

  while exists (
    select 1
    from public.patients as patient
    where patient.clinic_id = p_clinic_id
      and patient.slug = v_slug
  ) loop
    v_slug := v_base || '-' || v_suffix::text;
    v_suffix := v_suffix + 1;
  end loop;

  return v_slug;
end;
$$;

create or replace function private.lock_active_booking_link(
  p_token text,
  p_purpose text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := lower(btrim(p_token));
  v_request_id uuid;
begin
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'booking link is not active';
  end if;

  select link.booking_request_id
  into v_request_id
  from public.booking_links as link
  where link.token_hash = v_hash
    and link.purpose = p_purpose
    and link.revoked_at is null
    and link.expires_at > now()
  for update;

  if v_request_id is null then
    raise exception 'booking link is not active';
  end if;

  return v_request_id;
end;
$$;

create or replace function private.require_booking_account(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_email text;
  v_confirmed_at timestamptz;
  v_booker text;
begin
  if auth.uid() is null then
    raise exception 'a signed-in patient is required';
  end if;

  select account.id, account.email, account.email_confirmed_at
  into v_account_id, v_email, v_confirmed_at
  from public.patient_accounts as account
  where account.user_id = auth.uid();

  if v_account_id is null then
    raise exception 'a signed-in patient is required';
  end if;

  if v_confirmed_at is null then
    raise exception 'a confirmed email is required';
  end if;

  select request.booker_email
  into v_booker
  from public.booking_requests as request
  where request.id = p_request_id
    and request.account_id = v_account_id;

  if v_booker is null or lower(v_booker) is distinct from lower(v_email) then
    raise exception 'booking link does not match this account';
  end if;
end;
$$;

create or replace function private.ensure_accepted_chart(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.booking_requests%rowtype;
  v_patient_id uuid;
  v_dependent_id uuid;
  v_slug text;
begin
  select *
  into v_request
  from public.booking_requests as request
  where request.id = p_request_id;

  if v_request.id is null then
    raise exception 'booking request was not found';
  end if;

  if v_request.for_child then
    select dependent.id
    into v_dependent_id
    from public.patient_dependents as dependent
    where dependent.account_id = v_request.account_id
      and dependent.date_of_birth = v_request.patient_date_of_birth
      and lower(dependent.first_name) = lower(v_request.patient_first_name)
      and lower(dependent.last_name) = lower(v_request.patient_last_name)
      and dependent.relationship = v_request.contact_relationship
    order by dependent.created_at
    limit 1;

    if v_dependent_id is null then
      raise exception 'dependent does not belong to this account';
    end if;
  end if;

  v_patient_id := v_request.patient_id;

  if v_patient_id is null then
    if not v_request.for_child and exists (
      select 1
      from public.patients as patient
      where patient.clinic_id = v_request.clinic_id
        and patient.email is not null
        and lower(patient.email) = lower(v_request.booker_email)
    ) then
      raise exception 'a chart with this email already exists';
    end if;

    v_slug := private.chart_slug(
      v_request.clinic_id,
      v_request.patient_first_name,
      v_request.patient_last_name
    );

    insert into public.patients (
      clinic_id,
      first_name,
      last_name,
      slug,
      email,
      phone,
      date_of_birth
    ) values (
      v_request.clinic_id,
      v_request.patient_first_name,
      v_request.patient_last_name,
      v_slug,
      case when v_request.for_child then null else v_request.booker_email end,
      case when v_request.for_child then null else v_request.patient_phone end,
      v_request.patient_date_of_birth
    )
    returning id into v_patient_id;
  end if;

  if exists (
    select 1
    from public.patient_chart_links as link
    where link.clinic_id = v_request.clinic_id
      and link.patient_id = v_patient_id
      and (
        link.account_id is distinct from v_request.account_id
        or link.dependent_id is distinct from v_dependent_id
      )
  ) then
    raise exception 'chart is already linked to another account';
  end if;

  insert into public.patient_chart_links (
    clinic_id,
    patient_id,
    account_id,
    dependent_id
  )
  select
    v_request.clinic_id,
    v_patient_id,
    v_request.account_id,
    v_dependent_id
  where not exists (
    select 1
    from public.patient_chart_links as link
    where link.clinic_id = v_request.clinic_id
      and link.patient_id = v_patient_id
  );

  if v_request.for_child and not exists (
    select 1
    from public.patient_contacts as contact
    where contact.patient_id = v_patient_id
      and contact.clinic_id = v_request.clinic_id
      and contact.relationship = v_request.contact_relationship
      and lower(contact.first_name) = lower(v_request.contact_first_name)
      and lower(contact.last_name) = lower(v_request.contact_last_name)
      and contact.phone is not distinct from v_request.contact_phone
  ) then
    insert into public.patient_contacts (
      patient_id,
      clinic_id,
      relationship,
      first_name,
      last_name,
      phone
    ) values (
      v_patient_id,
      v_request.clinic_id,
      v_request.contact_relationship,
      v_request.contact_first_name,
      v_request.contact_last_name,
      v_request.contact_phone
    );
  end if;

  return v_patient_id;
end;
$$;

create or replace function private.cancel_request_holds(
  p_request_id uuid,
  p_cancelled_by text,
  p_except_appointment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('dentassist.booking_transition', true), '')
    not in ('offer', 'expire')
  then
    raise exception 'request holds can be closed only by a booking transition';
  end if;

  update public.appointments as appointment
  set
    status = 'cancelled',
    cancelled_by = p_cancelled_by
  where appointment.booking_request_id = p_request_id
    and appointment.id is distinct from p_except_appointment_id
    and appointment.status in ('pending_confirmation', 'offered', 'scheduled');
end;
$$;

create or replace function private.reschedule_slot_is_open(
  p_clinic_id uuid,
  p_dentist_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_except_appointment_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_buffer_minutes smallint;
  v_notice_minutes integer;
  v_horizon_days integer;
  v_online boolean;
  v_status text;
  v_setup_at timestamptz;
  v_day date;
  v_today date;
  v_local_start timestamp;
  v_local_end timestamp;
  v_opens_at time;
  v_closes_at time;
  v_break_starts_at time;
  v_break_ends_at time;
begin
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    return false;
  end if;

  select
    clinic.buffer_minutes,
    clinic.min_notice_minutes,
    clinic.max_ahead_days,
    clinic.online_booking_enabled,
    clinic.status,
    clinic.setup_completed_at
  into
    v_buffer_minutes,
    v_notice_minutes,
    v_horizon_days,
    v_online,
    v_status,
    v_setup_at
  from public.clinics as clinic
  where clinic.id = p_clinic_id;

  if v_status is distinct from 'active'
    or v_setup_at is null
    or not v_online
  then
    return false;
  end if;

  if not exists (
    select 1
    from public.clinic_members as member
    where member.id = p_dentist_id
      and member.clinic_id = p_clinic_id
      and member.sees_patients
      and member.listed_online
      and not member.unavailable
      and member.role in ('owner', 'dentist')
  ) then
    return false;
  end if;

  v_day := (timezone('Europe/Belgrade', p_starts_at))::date;
  v_today := (timezone('Europe/Belgrade', now()))::date;
  v_local_start := p_starts_at at time zone 'Europe/Belgrade';
  v_local_end := p_ends_at at time zone 'Europe/Belgrade';

  if v_day < v_today or v_day > v_today + v_horizon_days then
    return false;
  end if;

  if p_starts_at < now() + make_interval(mins => greatest(v_notice_minutes, 0)) then
    return false;
  end if;

  select
    working_hours.opens_at,
    working_hours.closes_at,
    working_hours.break_starts_at,
    working_hours.break_ends_at
  into v_opens_at, v_closes_at, v_break_starts_at, v_break_ends_at
  from public.working_hours
  where working_hours.clinic_member_id = p_dentist_id
    and working_hours.clinic_id = p_clinic_id
    and working_hours.iso_dow = extract(isodow from v_day)::smallint
    and not working_hours.is_closed;

  if v_opens_at is null
    or v_closes_at is null
    or v_local_start < v_day + v_opens_at
    or v_local_end > v_day + v_closes_at
  then
    return false;
  end if;

  if v_break_starts_at is not null
    and v_break_ends_at is not null
    and v_break_ends_at > v_break_starts_at
    and v_local_start < v_day + v_break_ends_at
    and v_day + v_break_starts_at < v_local_end
  then
    return false;
  end if;

  if exists (
    select 1
    from public.blocked_periods as block
    where block.clinic_member_id = p_dentist_id
      and block.clinic_id = p_clinic_id
      and block.ends_at > block.starts_at
      and block.starts_at < p_ends_at
      and p_starts_at < block.ends_at
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.dentist_id = p_dentist_id
      and appointment.clinic_id = p_clinic_id
      and appointment.id is distinct from p_except_appointment_id
      and appointment.status in (
        'pending_confirmation',
        'offered',
        'scheduled',
        'completed',
        'no_show'
      )
      and appointment.starts_at
        < p_ends_at + make_interval(mins => v_buffer_minutes::integer)
      and p_starts_at
        < appointment.ends_at + make_interval(mins => v_buffer_minutes::integer)
  ) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function private.lock_pending_request(p_request_id uuid)
returns public.booking_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.booking_requests%rowtype;
begin
  select *
  into v_request
  from public.booking_requests as request
  where request.id = p_request_id
  for update;

  if v_request.id is null or v_request.status is distinct from 'pending' then
    raise exception 'booking request is not pending';
  end if;

  if v_request.expires_at <= now() then
    raise exception 'booking request has expired';
  end if;

  return v_request;
end;
$$;

create or replace function public.choose_offer(token text, offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := token;
  v_offer_id uuid := offer_id;
  v_request_id uuid;
  v_request public.booking_requests%rowtype;
  v_expires_at timestamptz;
  v_patient_id uuid;
  v_scheduled_id uuid;
begin
  if v_offer_id is null then
    raise exception 'offer is required';
  end if;

  v_request_id := private.lock_active_booking_link(v_token, 'offer');
  perform private.require_booking_account(v_request_id);
  v_request := private.lock_pending_request(v_request_id);
  v_expires_at := v_request.expires_at;

  if not exists (
    select 1
    from public.appointment_offers as offer
    join public.appointments as appointment
      on appointment.id = offer.appointment_id
    where offer.booking_request_id = v_request.id
      and offer.appointment_id = v_offer_id
      and appointment.status = 'offered'
      and appointment.booking_request_id = v_request.id
      and appointment.clinic_id = v_request.clinic_id
  ) then
    raise exception 'offer does not belong to this request';
  end if;

  v_patient_id := private.ensure_accepted_chart(v_request.id);

  perform set_config('dentassist.booking_transition', 'offer', true);
  perform private.cancel_request_holds(v_request.id, 'patient', v_offer_id);

  update public.appointments as appointment
  set
    status = 'scheduled',
    patient_id = v_patient_id,
    confirmed_at = now()
  where appointment.id = v_offer_id
    and appointment.status = 'offered'
  returning appointment.id into v_scheduled_id;

  if v_scheduled_id is null then
    raise exception 'offer does not belong to this request';
  end if;

  update public.booking_requests as request
  set
    status = 'accepted',
    patient_id = v_patient_id
  where request.id = v_request.id
    and request.status = 'pending'
    and request.expires_at = v_expires_at;

  if not found then
    raise exception 'booking request is not pending';
  end if;

  update public.booking_links as link
  set revoked_at = now()
  where link.booking_request_id = v_request.id
    and link.purpose = 'offer'
    and link.revoked_at is null;

  perform set_config('dentassist.booking_transition', '', true);
  return v_scheduled_id;
end;
$$;

create or replace function public.decline_offers(token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := token;
  v_request_id uuid;
  v_request public.booking_requests%rowtype;
begin
  v_request_id := private.lock_active_booking_link(v_token, 'offer');
  perform private.require_booking_account(v_request_id);
  v_request := private.lock_pending_request(v_request_id);

  perform set_config('dentassist.booking_transition', 'offer', true);
  perform private.cancel_request_holds(v_request.id, 'patient', null);

  update public.booking_requests as request
  set status = 'declined_by_patient'
  where request.id = v_request.id
    and request.status = 'pending';

  if not found then
    raise exception 'booking request is not pending';
  end if;

  update public.booking_links as link
  set revoked_at = now()
  where link.booking_request_id = v_request.id
    and link.purpose = 'offer'
    and link.revoked_at is null;

  perform set_config('dentassist.booking_transition', '', true);
end;
$$;

create or replace function private.lock_scheduled_appointment(p_request_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_appointment public.appointments%rowtype;
begin
  select count(*)
  into v_count
  from public.appointments as appointment
  where appointment.booking_request_id = p_request_id
    and appointment.status = 'scheduled';

  if v_count <> 1 then
    raise exception 'appointment is not scheduled';
  end if;

  select *
  into v_appointment
  from public.appointments as appointment
  where appointment.booking_request_id = p_request_id
    and appointment.status = 'scheduled'
  for update;

  return v_appointment;
end;
$$;

create or replace function public.reschedule_by_token(
  token text,
  starts_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := token;
  v_starts_at timestamptz := starts_at;
  v_request_id uuid;
  v_appointment public.appointments%rowtype;
  v_ends_at timestamptz;
begin
  if v_starts_at is null then
    raise exception 'start is required';
  end if;

  v_request_id := private.lock_active_booking_link(v_token, 'manage');
  perform private.require_booking_account(v_request_id);
  v_appointment := private.lock_scheduled_appointment(v_request_id);

  if v_appointment.patient_reschedule_count <> 0 then
    raise exception 'appointment was already rescheduled';
  end if;

  if v_appointment.starts_at <= now() + interval '24 hours' then
    raise exception 'appointment can no longer be rescheduled';
  end if;

  if v_starts_at = v_appointment.starts_at then
    raise exception 'slot is not available';
  end if;

  v_ends_at := v_starts_at + (v_appointment.ends_at - v_appointment.starts_at);

  perform pg_advisory_xact_lock(
    hashtextextended('booking-dentist:' || v_appointment.dentist_id::text, 0)
  );
  perform public.assert_slot_grid(
    v_appointment.clinic_id,
    v_starts_at,
    v_ends_at
  );

  if not private.reschedule_slot_is_open(
    v_appointment.clinic_id,
    v_appointment.dentist_id,
    v_starts_at,
    v_ends_at,
    v_appointment.id
  ) then
    raise exception 'slot is not available';
  end if;

  update public.appointments as appointment
  set
    starts_at = v_starts_at,
    ends_at = v_ends_at,
    patient_reschedule_count = 1
  where appointment.id = v_appointment.id
    and appointment.status = 'scheduled'
    and appointment.patient_reschedule_count = 0;

  if not found then
    raise exception 'appointment was already rescheduled';
  end if;
end;
$$;

create or replace function public.cancel_by_token(token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := token;
  v_request_id uuid;
  v_appointment public.appointments%rowtype;
begin
  v_request_id := private.lock_active_booking_link(v_token, 'manage');
  perform private.require_booking_account(v_request_id);
  v_appointment := private.lock_scheduled_appointment(v_request_id);

  if v_appointment.starts_at <= now() + interval '24 hours' then
    raise exception 'appointment can no longer be cancelled';
  end if;

  update public.appointments as appointment
  set
    status = 'cancelled',
    cancelled_by = 'patient'
  where appointment.id = v_appointment.id
    and appointment.status = 'scheduled';

  if not found then
    raise exception 'appointment is not scheduled';
  end if;

  update public.booking_links as link
  set revoked_at = now()
  where link.booking_request_id = v_request_id
    and link.purpose = 'manage'
    and link.revoked_at is null;
end;
$$;

create or replace function public.expire_booking_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_count integer := 0;
begin
  perform set_config('dentassist.booking_transition', 'expire', true);

  for v_request_id in
    select request.id
    from public.booking_requests as request
    where request.status = 'pending'
      and request.expires_at <= now()
    order by request.id
    for update
  loop
    perform private.cancel_request_holds(v_request_id, 'system', null);

    update public.booking_requests as request
    set status = 'expired'
    where request.id = v_request_id
      and request.status = 'pending';

    update public.booking_links as link
    set revoked_at = now()
    where link.booking_request_id = v_request_id
      and link.purpose = 'offer'
      and link.revoked_at is null;

    v_count := v_count + 1;
  end loop;

  perform set_config('dentassist.booking_transition', '', true);
  return v_count;
end;
$$;

create or replace function public.purge_booking_request_pii()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.booking_requests as request
  set
    booker_email = null,
    patient_first_name = null,
    patient_last_name = null,
    patient_date_of_birth = null,
    patient_phone = null,
    contact_relationship = null,
    contact_first_name = null,
    contact_last_name = null,
    contact_phone = null,
    pii_purged_at = now()
  where request.pii_purged_at is null
    and request.status <> 'pending'
    and request.created_at <= now() - interval '90 days';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.due_reminders()
returns table (
  appointment_id uuid,
  clinic_id uuid,
  kind text,
  starts_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    appointment.id as appointment_id,
    appointment.clinic_id,
    reminder.kind,
    appointment.starts_at
  from public.appointments as appointment
  cross join (
    values
      ('24h'::text, interval '24 hours'),
      ('2h'::text, interval '2 hours')
  ) as reminder(kind, ahead)
  where appointment.status = 'scheduled'
    and appointment.starts_at > now()
    and now() >= appointment.starts_at - reminder.ahead
    and coalesce(appointment.confirmed_at, appointment.created_at)
      <= appointment.starts_at - reminder.ahead
    and not exists (
      select 1
      from public.appointment_reminders as sent
      where sent.appointment_id = appointment.id
        and sent.kind = reminder.kind
    )
  order by appointment.starts_at, reminder.kind;
$$;

create or replace function public.merge_patients(
  target_id uuid,
  source_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id uuid := target_id;
  v_source_id uuid := source_id;
  v_target public.patients%rowtype;
  v_source public.patients%rowtype;
  v_clinic_id uuid;
  v_member_id uuid;
  v_tooth public.tooth_states%rowtype;
  v_target_tooth uuid;
  v_invite public.patient_link_invites%rowtype;
begin
  if v_target_id is null or v_source_id is null or v_target_id = v_source_id then
    raise exception 'merge requires two different charts';
  end if;

  if not public.is_owner() then
    raise exception 'only the owner of this clinic can merge patients';
  end if;

  perform 1
  from public.patients as patient
  where patient.id in (v_target_id, v_source_id)
  order by patient.id
  for update;

  select *
  into v_target
  from public.patients as patient
  where patient.id = v_target_id;

  select *
  into v_source
  from public.patients as patient
  where patient.id = v_source_id;

  if v_target.id is null or v_source.id is null then
    raise exception 'patient was not found';
  end if;

  if v_target.clinic_id is distinct from v_source.clinic_id then
    raise exception 'patients must belong to the same clinic';
  end if;

  v_clinic_id := v_target.clinic_id;

  if public.current_clinic_id() is distinct from v_clinic_id then
    raise exception 'only the owner of this clinic can merge patients';
  end if;

  if v_target.merged_into_id is not null or v_source.merged_into_id is not null then
    raise exception 'a merged chart cannot be merged again';
  end if;

  select member.id
  into v_member_id
  from public.clinic_members as member
  where member.user_id = auth.uid()
    and member.clinic_id = v_clinic_id;

  perform set_config('dentassist.booking_transition', 'merge', true);
  set constraints visits_appointment_clinic_patient_fkey deferred;

  insert into public.patient_contacts (
    patient_id,
    clinic_id,
    relationship,
    first_name,
    last_name,
    phone,
    email,
    confirmed_at
  )
  select
    v_target_id,
    contact.clinic_id,
    contact.relationship,
    contact.first_name,
    contact.last_name,
    contact.phone,
    contact.email,
    contact.confirmed_at
  from public.patient_contacts as contact
  where contact.patient_id = v_source_id
    and contact.clinic_id = v_clinic_id;

  delete from public.patient_contacts as contact
  where contact.patient_id = v_source_id
    and contact.clinic_id = v_clinic_id;

  insert into public.patient_alerts (
    patient_id,
    clinic_id,
    code,
    note
  )
  select
    v_target_id,
    alert.clinic_id,
    alert.code,
    alert.note
  from public.patient_alerts as alert
  where alert.patient_id = v_source_id
    and alert.clinic_id = v_clinic_id;

  delete from public.patient_alerts as alert
  where alert.patient_id = v_source_id
    and alert.clinic_id = v_clinic_id;

  if exists (
    select 1
    from public.patient_anamnesis as anamnesis
    where anamnesis.patient_id = v_target_id
  ) then
    delete from public.patient_anamnesis as anamnesis
    where anamnesis.patient_id = v_source_id;
  else
    insert into public.patient_anamnesis (
      patient_id,
      clinic_id,
      chronic_conditions,
      medications,
      allergies,
      pregnancy
    )
    select
      v_target_id,
      anamnesis.clinic_id,
      anamnesis.chronic_conditions,
      anamnesis.medications,
      anamnesis.allergies,
      anamnesis.pregnancy
    from public.patient_anamnesis as anamnesis
    where anamnesis.patient_id = v_source_id;

    delete from public.patient_anamnesis as anamnesis
    where anamnesis.patient_id = v_source_id;
  end if;

  insert into public.patient_email_claims (
    patient_id,
    clinic_id,
    appointment_id,
    email,
    status,
    resolved_by,
    resolved_at
  )
  select
    v_target_id,
    claim.clinic_id,
    claim.appointment_id,
    claim.email,
    claim.status,
    claim.resolved_by,
    claim.resolved_at
  from public.patient_email_claims as claim
  where claim.patient_id = v_source_id
    and claim.clinic_id = v_clinic_id;

  delete from public.patient_email_claims as claim
  where claim.patient_id = v_source_id
    and claim.clinic_id = v_clinic_id;

  for v_tooth in
    select *
    from public.tooth_states as tooth
    where tooth.patient_id = v_source_id
      and tooth.clinic_id = v_clinic_id
  loop
    v_target_tooth := null;

    select tooth.id
    into v_target_tooth
    from public.tooth_states as tooth
    where tooth.patient_id = v_target_id
      and tooth.fdi_code = v_tooth.fdi_code;

    if not found then
      insert into public.tooth_states (
        patient_id,
        clinic_id,
        fdi_code,
        status,
        surfaces
      ) values (
        v_target_id,
        v_tooth.clinic_id,
        v_tooth.fdi_code,
        v_tooth.status,
        v_tooth.surfaces
      )
      returning id into v_target_tooth;
    else
      insert into public.tooth_state_changes (
        tooth_state_id,
        clinic_id,
        old_status,
        new_status,
        old_surfaces,
        new_surfaces,
        changed_by
      ) values (
        v_target_tooth,
        v_tooth.clinic_id,
        null,
        v_tooth.status,
        null,
        v_tooth.surfaces,
        v_member_id
      );
    end if;

    update public.tooth_state_changes as change
    set tooth_state_id = v_target_tooth
    where change.tooth_state_id = v_tooth.id
      and change.tooth_state_id is distinct from v_target_tooth;

    delete from public.tooth_states as tooth
    where tooth.id = v_tooth.id;
  end loop;

  update public.appointments as appointment
  set patient_id = v_target_id
  where appointment.clinic_id = v_clinic_id
    and appointment.patient_id = v_source_id;

  update public.visits as visit
  set patient_id = v_target_id
  where visit.clinic_id = v_clinic_id
    and visit.patient_id = v_source_id;

  update public.booking_requests as request
  set
    patient_id = case
      when request.patient_id = v_source_id then v_target_id
      else request.patient_id
    end,
    suggested_patient_id = case
      when request.suggested_patient_id = v_source_id then v_target_id
      else request.suggested_patient_id
    end
  where request.clinic_id = v_clinic_id
    and (
      request.patient_id = v_source_id
      or request.suggested_patient_id = v_source_id
    );

  if exists (
    select 1
    from public.patient_chart_links as link
    where link.clinic_id = v_clinic_id
      and link.patient_id = v_target_id
  ) then
    delete from public.patient_chart_links as link
    where link.clinic_id = v_clinic_id
      and link.patient_id = v_source_id;
  else
    insert into public.patient_chart_links (
      clinic_id,
      patient_id,
      account_id,
      dependent_id,
      confirmed_at,
      created_at
    )
    select
      link.clinic_id,
      v_target_id,
      link.account_id,
      link.dependent_id,
      link.confirmed_at,
      link.created_at
    from public.patient_chart_links as link
    where link.clinic_id = v_clinic_id
      and link.patient_id = v_source_id;

    delete from public.patient_chart_links as link
    where link.clinic_id = v_clinic_id
      and link.patient_id = v_source_id;
  end if;

  for v_invite in
    select *
    from public.patient_link_invites as invite
    where invite.clinic_id = v_clinic_id
      and invite.patient_id = v_source_id
  loop
    delete from public.patient_link_invites as invite
    where invite.id = v_invite.id;

    insert into public.patient_link_invites (
      id,
      clinic_id,
      patient_id,
      email,
      token_hash,
      expires_at,
      confirmed_at,
      created_by,
      created_at
    ) values (
      v_invite.id,
      v_invite.clinic_id,
      v_target_id,
      v_invite.email,
      v_invite.token_hash,
      v_invite.expires_at,
      v_invite.confirmed_at,
      v_invite.created_by,
      v_invite.created_at
    );
  end loop;

  -- patient_files stay on the source chart. The storage key contains that
  -- chart id, and the file row cannot change patient_id.

  update public.patients as patient
  set merged_into_id = v_target_id
  where patient.clinic_id = v_clinic_id
    and patient.merged_into_id = v_source_id;

  update public.patients as patient
  set merged_into_id = v_target_id
  where patient.id = v_source_id
    and patient.merged_into_id is null;

  perform set_config('dentassist.booking_transition', '', true);
end;
$$;

comment on function public.choose_offer(text, uuid) is
  'Signed-in patient chooses one offer. The chosen appointment becomes scheduled, the requested hold and the other offers are cancelled, and the request is accepted. The same account-to-chart link as acceptance is written. expires_at is not changed. token is the lowercase hex HMAC-SHA-256 of the raw offer link. anon has no execute.';

comment on function public.decline_offers(text) is
  'Signed-in patient declines every offer. The requested hold and all offers are cancelled and the request becomes declined_by_patient. No chart link is written. token is the lowercase hex HMAC-SHA-256 of the raw offer link.';

comment on function public.reschedule_by_token(text, timestamptz) is
  'Signed-in patient moves the scheduled appointment once, and only while more than 24 hours remain before it starts. token is the lowercase hex HMAC-SHA-256 of the raw manage link.';

comment on function public.cancel_by_token(text) is
  'Signed-in patient cancels the scheduled appointment while more than 24 hours remain before it starts. token is the lowercase hex HMAC-SHA-256 of the raw manage link.';

comment on function public.expire_booking_requests() is
  'Cancels pending requests whose deadline has passed, including the requested hold and every offer, and marks them expired. service_role only.';

comment on function public.purge_booking_request_pii() is
  'Clears copied identity on non-pending requests older than 90 days. The status remains. service_role only.';

comment on function public.due_reminders() is
  'Scheduled appointments whose 24h or 2h reminder is due and not yet recorded. Skips a reminder whose moment had already passed when the appointment was confirmed. Does not insert appointment_reminders. service_role only.';

comment on function public.merge_patients(uuid, uuid) is
  'Owner of the clinic moves dependent rows onto the target chart, keeps the target anamnesis when both have one, and sets merged_into_id. The source row is kept. Files stay on the source because their storage key contains that chart id.';

revoke all on function private.chart_slug(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_active_booking_link(text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.require_booking_account(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.ensure_accepted_chart(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cancel_request_holds(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.reschedule_slot_is_open(uuid, uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_pending_request(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_scheduled_appointment(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.choose_offer(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.decline_offers(text)
  from public, anon, authenticated, service_role;
revoke all on function public.reschedule_by_token(text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_by_token(text)
  from public, anon, authenticated, service_role;
revoke all on function public.expire_booking_requests()
  from public, anon, authenticated, service_role;
revoke all on function public.purge_booking_request_pii()
  from public, anon, authenticated, service_role;
revoke all on function public.due_reminders()
  from public, anon, authenticated, service_role;
revoke all on function public.merge_patients(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.choose_offer(text, uuid) to authenticated;
grant execute on function public.decline_offers(text) to authenticated;
grant execute on function public.reschedule_by_token(text, timestamptz) to authenticated;
grant execute on function public.cancel_by_token(text) to authenticated;
grant execute on function public.merge_patients(uuid, uuid) to authenticated;

grant execute on function public.expire_booking_requests() to service_role;
grant execute on function public.purge_booking_request_pii() to service_role;
grant execute on function public.due_reminders() to service_role;
