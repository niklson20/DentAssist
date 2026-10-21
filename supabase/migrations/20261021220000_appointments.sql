-- Appointments, offers, and visits (1.5).
-- anon has no SELECT. Reception reads and writes appointments, but cannot
-- move one to completed, and cannot read visits.
-- booking_request_id has no foreign key yet: booking_requests arrive later.
-- A partial unique index cannot be a foreign-key target, so the visits key
-- on (id, clinic_id, patient_id) is a full unique constraint. id already
-- makes every row unique when patient_id is null.

set search_path = public, extensions;

create extension if not exists btree_gist with schema extensions;

alter table public.appointment_types
  add constraint appointment_types_id_clinic_key unique (id, clinic_id);

create or replace function public.assert_slot_grid(
  p_clinic_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  step_minutes smallint;
  local_start timestamp;
  minute_of_day integer;
  duration_seconds numeric;
begin
  if p_clinic_id is null or p_starts_at is null or p_ends_at is null then
    raise exception 'appointment slot requires a clinic and both times';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'appointment end must be after its start';
  end if;

  select clinics.slot_minutes
  into step_minutes
  from public.clinics
  where clinics.id = p_clinic_id;

  if step_minutes is null then
    raise exception 'appointment clinic has no slot step';
  end if;

  local_start := p_starts_at at time zone 'Europe/Belgrade';

  minute_of_day :=
    extract(hour from local_start)::integer * 60
    + extract(minute from local_start)::integer;

  if local_start <> date_trunc('minute', local_start)
    or minute_of_day % step_minutes <> 0
  then
    raise exception 'appointment start must be aligned to the clinic step in Europe/Belgrade';
  end if;

  duration_seconds := extract(epoch from (p_ends_at - p_starts_at));

  if duration_seconds <> trunc(duration_seconds)
    or duration_seconds < step_minutes * 60
    or duration_seconds > 120 * 60
    or mod(duration_seconds, step_minutes * 60) <> 0
  then
    raise exception 'appointment duration must be a multiple of the clinic step, from the step through 120 minutes';
  end if;
end;
$$;

comment on function public.assert_slot_grid(uuid, timestamptz, timestamptz) is
  'Rejects a start that is off the clinic step in Europe/Belgrade, or a duration outside the step through 120 minutes.';

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  dentist_id uuid not null,
  patient_id uuid,
  booking_request_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  appointment_type_id uuid not null,
  status text not null,
  source text not null,
  note text,
  cancelled_by text,
  cancellation_note text,
  patient_reschedule_count smallint not null default 0,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_visit_key unique (id, clinic_id, patient_id),
  constraint appointments_dentist_clinic_fkey
    foreign key (dentist_id, clinic_id)
    references public.clinic_members (id, clinic_id)
    on delete restrict,
  constraint appointments_patient_clinic_fkey
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete restrict,
  constraint appointments_type_clinic_fkey
    foreign key (appointment_type_id, clinic_id)
    references public.appointment_types (id, clinic_id)
    on delete restrict,
  constraint appointments_status_check check (
    status in (
      'pending_confirmation',
      'offered',
      'scheduled',
      'completed',
      'no_show',
      'cancelled'
    )
  ),
  constraint appointments_source_check check (source in ('patient', 'staff')),
  constraint appointments_cancelled_by_check check (
    cancelled_by is null or cancelled_by in ('patient', 'staff', 'system')
  ),
  constraint appointments_patient_status_check check (
    patient_id is not null
    or status in ('pending_confirmation', 'offered', 'cancelled')
  ),
  constraint appointments_reschedule_count_check check (
    patient_reschedule_count between 0 and 1
  ),
  constraint appointments_time_order_check check (ends_at > starts_at),
  constraint appointments_dentist_overlap_excl exclude using gist (
    dentist_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);

comment on table public.appointments is
  'One hold on a dentist chair. Cancelled rows do not occupy the slot. The buffer between appointments is not enforced here.';
comment on column public.appointments.dentist_id is
  'Member who sees patients. Reception cannot be a chair.';
comment on column public.appointments.patient_id is
  'Required unless the status is pending_confirmation, offered, or cancelled.';
comment on column public.appointments.booking_request_id is
  'Request that produced this row. The foreign key is added with booking_requests.';
comment on column public.appointments.cancellation_note is
  'Required when staff cancels a scheduled appointment.';
comment on column public.appointments.patient_reschedule_count is
  'How many times the patient has moved this appointment. 0 or 1.';
comment on column public.appointments.confirmed_by is
  'Optional uuid recorded when the appointment is confirmed. No target table in this migration.';

create index appointments_clinic_starts_idx
  on public.appointments (clinic_id, starts_at);

create index appointments_dentist_starts_idx
  on public.appointments (dentist_id, starts_at);

create index appointments_patient_id_idx
  on public.appointments (patient_id)
  where patient_id is not null;

create index appointments_booking_request_id_idx
  on public.appointments (booking_request_id)
  where booking_request_id is not null;

create index appointments_appointment_type_id_idx
  on public.appointments (appointment_type_id);

create table public.appointment_offers (
  booking_request_id uuid not null,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  position smallint not null,
  primary key (booking_request_id, position),
  constraint appointment_offers_appointment_id_key unique (appointment_id),
  constraint appointment_offers_position_check check (position between 1 and 3)
);

comment on table public.appointment_offers is
  'Up to three offered slots for one booking request. Each row holds its own appointment in status offered.';
comment on column public.appointment_offers.booking_request_id is
  'Request these slots answer. The foreign key is added with booking_requests.';
comment on column public.appointment_offers.position is
  '1, 2, or 3.';

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  patient_id uuid not null,
  procedure_description text,
  recommendations text,
  treatment_plan text,
  internal_notes text,
  recorded_at timestamptz not null default now(),
  constraint visits_appointment_id_key unique (appointment_id),
  constraint visits_id_clinic_key unique (id, clinic_id),
  constraint visits_appointment_clinic_patient_fkey
    foreign key (appointment_id, clinic_id, patient_id)
    references public.appointments (id, clinic_id, patient_id)
    on delete cascade,
  constraint visits_patient_clinic_fkey
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete restrict
);

comment on table public.visits is
  'At most one clinical record per appointment. Writes go through save_visit, only while the appointment is completed, and stop 24 hours after it ends. The owner does not extend that deadline.';
comment on column public.visits.internal_notes is
  'Clinical note. Hidden from reception by row policy.';
comment on column public.visits.recorded_at is
  'Set on the first save and then immutable.';

create index visits_clinic_patient_idx
  on public.visits (clinic_id, patient_id);

alter table public.tooth_state_changes
  add constraint tooth_state_changes_visit_id_fkey
  foreign key (visit_id)
  references public.visits (id)
  on delete set null;

comment on column public.tooth_state_changes.visit_id is
  'Visit this change belongs to. Same clinic. Null when the change is not tied to a visit.';

create index tooth_state_changes_visit_id_idx
  on public.tooth_state_changes (visit_id)
  where visit_id is not null;

create or replace function private.assert_tooth_change_visit_clinic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visit_id is not null and not exists (
    select 1
    from public.visits
    where visits.id = new.visit_id
      and visits.clinic_id = new.clinic_id
  ) then
    raise exception 'tooth change visit must belong to the same clinic';
  end if;

  return new;
end;
$$;

create trigger tooth_state_changes_visit_clinic
  before insert or update of visit_id, clinic_id on public.tooth_state_changes
  for each row
  execute function private.assert_tooth_change_visit_clinic();

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

  if tg_op = 'UPDATE'
    and new.status is distinct from 'offered'
    and exists (
      select 1
      from public.appointment_offers
      where appointment_id = new.id
    )
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
  then
    raise exception 'appointment identity is locked by a visit';
  end if;

  return new;
end;
$$;

create trigger appointments_guard
  before insert or update on public.appointments
  for each row
  execute function private.guard_appointment();

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row
  execute function private.set_updated_at();

create trigger appointments_audit
  after insert or update or delete on public.appointments
  for each row
  execute function private.audit_row();

create or replace function private.guard_appointment_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  appointment_status text;
  appointment_request uuid;
begin
  if tg_op = 'UPDATE' and (
    new.booking_request_id is distinct from old.booking_request_id
    or new.appointment_id is distinct from old.appointment_id
    or new.position is distinct from old.position
  ) then
    raise exception 'offer identity is immutable';
  end if;

  select appointments.status, appointments.booking_request_id
  into appointment_status, appointment_request
  from public.appointments
  where appointments.id = new.appointment_id;

  if appointment_status is distinct from 'offered'
    or appointment_request is distinct from new.booking_request_id
  then
    raise exception 'offered appointment must belong to the same request';
  end if;

  return new;
end;
$$;

create trigger appointment_offers_guard
  before insert or update on public.appointment_offers
  for each row
  execute function private.guard_appointment_offer();

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

create trigger visits_guard
  before insert or update on public.visits
  for each row
  execute function private.guard_visit();

create trigger visits_audit
  after insert or update or delete on public.visits
  for each row
  execute function private.audit_row();

create or replace function private.prevent_hiding_scheduled_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.sees_patients and not new.sees_patients and (
    exists (
      select 1
      from public.working_hours
      where clinic_member_id = new.id
    )
    or exists (
      select 1
      from public.blocked_periods
      where clinic_member_id = new.id
    )
    or exists (
      select 1
      from public.appointments
      where dentist_id = new.id
    )
  ) then
    raise exception 'a member with working hours, blocked periods, or appointments must see patients';
  end if;

  return new;
end;
$$;

create or replace function public.save_visit(
  p_appointment_id uuid,
  p_procedure_description text,
  p_recommendations text,
  p_treatment_plan text,
  p_internal_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  appointment_clinic uuid;
  appointment_patient uuid;
  visit_id uuid;
begin
  select appointments.clinic_id, appointments.patient_id
  into appointment_clinic, appointment_patient
  from public.appointments
  where appointments.id = p_appointment_id;

  if appointment_clinic is null
    or appointment_clinic is distinct from public.current_clinic_id()
    or not (public.is_owner() or public.is_dentist())
  then
    raise exception 'only a dentist or the owner can save a visit';
  end if;

  insert into public.visits (
    appointment_id,
    clinic_id,
    patient_id,
    procedure_description,
    recommendations,
    treatment_plan,
    internal_notes
  ) values (
    p_appointment_id,
    appointment_clinic,
    appointment_patient,
    p_procedure_description,
    p_recommendations,
    p_treatment_plan,
    p_internal_notes
  )
  on conflict (appointment_id) do update
  set
    procedure_description = excluded.procedure_description,
    recommendations = excluded.recommendations,
    treatment_plan = excluded.treatment_plan,
    internal_notes = excluded.internal_notes
  returning id into visit_id;

  return visit_id;
end;
$$;

comment on function public.save_visit(uuid, text, text, text, text) is
  'Inserts or updates the visit for a completed appointment. Rejects the write 24 hours after the appointment ends, including for the owner.';

revoke all on table
  public.appointments,
  public.appointment_offers,
  public.visits
from public, anon, authenticated;

grant select, insert, update, delete on table public.appointments to authenticated;

grant select, insert, update, delete on table public.appointment_offers to authenticated;

grant select on table public.visits to authenticated;

grant select, insert, update, delete on table
  public.appointments,
  public.appointment_offers,
  public.visits
to service_role;

alter table public.appointments enable row level security;
alter table public.appointment_offers enable row level security;
alter table public.visits enable row level security;

create policy appointments_staff
  on public.appointments
  for all
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist() or public.is_reception())
  )
  with check (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist() or public.is_reception())
  );

create policy appointment_offers_staff
  on public.appointment_offers
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.appointments
      where appointments.id = appointment_id
        and appointments.clinic_id = public.current_clinic_id()
        and (public.is_owner() or public.is_dentist() or public.is_reception())
    )
  )
  with check (
    exists (
      select 1
      from public.appointments
      where appointments.id = appointment_id
        and appointments.clinic_id = public.current_clinic_id()
        and (public.is_owner() or public.is_dentist() or public.is_reception())
    )
  );

create policy visits_clinical
  on public.visits
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  );

revoke all on function
  public.assert_slot_grid(uuid, timestamptz, timestamptz),
  public.save_visit(uuid, text, text, text, text)
from public, anon;

grant execute on function
  public.assert_slot_grid(uuid, timestamptz, timestamptz),
  public.save_visit(uuid, text, text, text, text)
to authenticated, service_role;

revoke all on function
  private.assert_tooth_change_visit_clinic(),
  private.guard_appointment(),
  private.guard_appointment_offer(),
  private.guard_visit()
from public, anon;

grant execute on function
  private.assert_tooth_change_visit_clinic(),
  private.guard_appointment(),
  private.guard_appointment_offer(),
  private.guard_visit()
to authenticated, service_role;
