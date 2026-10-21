-- Booking requests, links, and reminders (1.6).
-- An online request requires a confirmed patient account. There is no
-- appointment code. anon has no SELECT. Reception does not read these tables.
-- A dentist accepts only a request assigned to that member; the owner may
-- accept any request in the clinic. Raw link tokens are not stored.

alter table public.appointments
  add constraint appointments_id_clinic_key unique (id, clinic_id);

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

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  dentist_id uuid not null,
  account_id uuid not null references public.patient_accounts (id) on delete restrict,
  booker_email text,
  for_child boolean not null,
  patient_first_name text,
  patient_last_name text,
  patient_date_of_birth date,
  patient_phone text,
  contact_relationship text,
  contact_first_name text,
  contact_last_name text,
  contact_phone text,
  reason text,
  suggested_patient_id uuid,
  patient_id uuid,
  appointment_id uuid,
  status text not null,
  patient_note text,
  expires_at timestamptz not null,
  pii_purged_at timestamptz,
  created_at timestamptz not null default now(),
  constraint booking_requests_id_clinic_key unique (id, clinic_id),
  constraint booking_requests_dentist_clinic_fkey
    foreign key (dentist_id, clinic_id)
    references public.clinic_members (id, clinic_id)
    on delete restrict,
  constraint booking_requests_suggested_patient_clinic_fkey
    foreign key (suggested_patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete restrict,
  constraint booking_requests_patient_clinic_fkey
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete restrict,
  constraint booking_requests_appointment_clinic_fkey
    foreign key (appointment_id, clinic_id)
    references public.appointments (id, clinic_id)
    on delete restrict,
  constraint booking_requests_status_check check (
    status in (
      'pending',
      'accepted',
      'rejected',
      'expired',
      'declined_by_patient'
    )
  ),
  constraint booking_requests_accepted_patient_check check (
    status <> 'accepted' or patient_id is not null
  ),
  constraint booking_requests_identity_check check (
    case
      when pii_purged_at is null then
        booker_email is not null
        and patient_first_name is not null
        and patient_last_name is not null
        and patient_date_of_birth is not null
        and char_length(btrim(booker_email)) > 0
        and char_length(btrim(patient_first_name)) > 0
        and char_length(btrim(patient_last_name)) > 0
        and (
          (
            not for_child
            and contact_relationship is null
            and contact_first_name is null
            and contact_last_name is null
            and contact_phone is null
          )
          or (
            for_child
            and patient_phone is null
            and contact_relationship is not null
            and contact_first_name is not null
            and contact_last_name is not null
            and contact_phone is not null
            and contact_relationship in (
              'mother',
              'father',
              'guardian',
              'grandmother',
              'grandfather',
              'other_relative'
            )
            and char_length(btrim(contact_first_name)) > 0
            and char_length(btrim(contact_last_name)) > 0
            and char_length(btrim(contact_phone)) > 0
          )
        )
      else
        booker_email is null
        and patient_first_name is null
        and patient_last_name is null
        and patient_date_of_birth is null
        and patient_phone is null
        and contact_relationship is null
        and contact_first_name is null
        and contact_last_name is null
        and contact_phone is null
    end
  )
);

comment on table public.booking_requests is
  'Online request from a confirmed patient account. No appointment code is stored. Identity columns are cleared after purge; the status remains.';
comment on column public.booking_requests.account_id is
  'Patient account that made the request. Required. Updates are rejected.';
comment on column public.booking_requests.booker_email is
  'Email of that account. Null after the identity purge.';
comment on column public.booking_requests.patient_phone is
  'Phone of the adult. Null for a child, whose phone is on the contact columns, and null after the identity purge.';
comment on column public.booking_requests.contact_relationship is
  'Null when the appointment is for the account holder.';
comment on column public.booking_requests.suggested_patient_id is
  'Optional chart match. Same clinic.';
comment on column public.booking_requests.patient_id is
  'Chart written when the request is accepted. Same clinic. Then immutable.';
comment on column public.booking_requests.appointment_id is
  'Appointment that holds the requested slot. Same clinic and dentist.';
comment on column public.booking_requests.patient_note is
  'Optional clinic message when the request is rejected.';
comment on column public.booking_requests.expires_at is
  'Earlier of 24 working hours of the dentist and the appointment start. Calculated outside this table.';
comment on column public.booking_requests.pii_purged_at is
  'Set when the copied identity is removed. The status stays.';

create unique index booking_requests_appointment_id_key
  on public.booking_requests (appointment_id)
  where appointment_id is not null;

create index booking_requests_clinic_status_idx
  on public.booking_requests (clinic_id, status);

create index booking_requests_account_id_idx
  on public.booking_requests (account_id);

create index booking_requests_dentist_id_idx
  on public.booking_requests (dentist_id);

create index booking_requests_patient_id_idx
  on public.booking_requests (patient_id)
  where patient_id is not null;

create index booking_requests_suggested_patient_id_idx
  on public.booking_requests (suggested_patient_id)
  where suggested_patient_id is not null;

create index booking_requests_pending_expires_idx
  on public.booking_requests (expires_at)
  where status = 'pending';

create trigger booking_requests_guard
  before insert or update on public.booking_requests
  for each row
  execute function private.guard_booking_request();

create trigger booking_requests_audit
  after insert or update or delete on public.booking_requests
  for each row
  execute function private.audit_row();

alter table public.appointments
  add constraint appointments_booking_request_clinic_fkey
  foreign key (booking_request_id, clinic_id)
  references public.booking_requests (id, clinic_id)
  on delete restrict;

comment on column public.appointments.booking_request_id is
  'Request that produced this row. Same clinic. Null for a staff appointment.';

alter table public.appointment_offers
  add constraint appointment_offers_booking_request_id_fkey
  foreign key (booking_request_id)
  references public.booking_requests (id)
  on delete restrict;

comment on column public.appointment_offers.booking_request_id is
  'Request these slots answer.';

create or replace function private.assert_appointment_request_dentist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booking_request_id is not null and not exists (
    select 1
    from public.booking_requests as request
    where request.id = new.booking_request_id
      and request.clinic_id = new.clinic_id
      and request.dentist_id = new.dentist_id
  ) then
    raise exception 'appointment request must be the same clinic and dentist';
  end if;

  return new;
end;
$$;

create trigger appointments_request_dentist
  before insert or update of booking_request_id, clinic_id, dentist_id
  on public.appointments
  for each row
  execute function private.assert_appointment_request_dentist();

create or replace function private.guard_booking_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.purpose := btrim(new.purpose);
  new.token_hash := btrim(new.token_hash);

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.clinic_id is distinct from old.clinic_id
    or new.booking_request_id is distinct from old.booking_request_id
    or new.purpose is distinct from old.purpose
    or new.token_hash is distinct from old.token_hash
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'booking link identity is immutable';
  end if;

  if tg_op = 'UPDATE'
    and old.revoked_at is not null
    and new.revoked_at is distinct from old.revoked_at
  then
    raise exception 'revoked booking link stays revoked';
  end if;

  return new;
end;
$$;

create table public.booking_links (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  booking_request_id uuid not null,
  purpose text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint booking_links_request_clinic_fkey
    foreign key (booking_request_id, clinic_id)
    references public.booking_requests (id, clinic_id)
    on delete cascade,
  constraint booking_links_purpose_check check (purpose in ('offer', 'manage')),
  constraint booking_links_token_hash_key unique (token_hash),
  constraint booking_links_token_hash_hmac check (token_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.booking_links is
  'One active link per purpose and request. A new mail of the same purpose revokes the previous link. The raw 32-byte token is not stored.';
comment on column public.booking_links.purpose is
  'offer stays until the patient chooses, declines, or the request expires. manage is created when the appointment becomes scheduled.';
comment on column public.booking_links.token_hash is
  'HMAC-SHA-256 of the raw token. Hidden from authenticated SELECT.';
comment on column public.booking_links.revoked_at is
  'Null while the link is active.';

create unique index booking_links_active_purpose_key
  on public.booking_links (booking_request_id, purpose)
  where revoked_at is null;

create index booking_links_request_id_idx
  on public.booking_links (booking_request_id);

create trigger booking_links_guard
  before insert or update on public.booking_links
  for each row
  execute function private.guard_booking_link();

create or replace function private.guard_appointment_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'appointment reminder cannot change';
  end if;

  new.kind := btrim(new.kind);

  return new;
end;
$$;

create table public.appointment_reminders (
  appointment_id uuid not null,
  clinic_id uuid not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (appointment_id, kind),
  constraint appointment_reminders_appointment_clinic_fkey
    foreign key (appointment_id, clinic_id)
    references public.appointments (id, clinic_id)
    on delete cascade,
  constraint appointment_reminders_kind_check check (kind in ('24h', '2h'))
);

comment on table public.appointment_reminders is
  'One sent reminder per appointment and kind. The same reminder is not sent twice.';
comment on column public.appointment_reminders.kind is
  '24h or 2h.';
comment on column public.appointment_reminders.sent_at is
  'When this reminder was sent. The row is not updated.';

create index appointment_reminders_clinic_id_idx
  on public.appointment_reminders (clinic_id);

create trigger appointment_reminders_guard
  before insert or update on public.appointment_reminders
  for each row
  execute function private.guard_appointment_reminder();

-- Default privileges on hosted Supabase grant anon every new public table.
-- Revoke that, then grant only the authenticated commands policies allow.
-- A table-level SELECT covers every column, so token_hash is omitted from
-- the column grant instead.

revoke all on table
  public.booking_requests,
  public.booking_links,
  public.appointment_reminders
from public, anon, authenticated;

grant select, insert, update, delete on table public.booking_requests to authenticated;

grant select (
  id, clinic_id, booking_request_id, purpose, expires_at, revoked_at, created_at
), insert, update, delete on table public.booking_links to authenticated;

grant select on table public.appointment_reminders to authenticated;

grant select, insert, update, delete on table
  public.booking_requests,
  public.booking_links,
  public.appointment_reminders
to service_role;

alter table public.booking_requests enable row level security;
alter table public.booking_links enable row level security;
alter table public.appointment_reminders enable row level security;

create policy booking_requests_clinical
  on public.booking_requests
  for all
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  )
  with check (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  );

create policy booking_links_clinical
  on public.booking_links
  for all
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  )
  with check (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  );

create policy appointment_reminders_clinical
  on public.appointment_reminders
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  );

revoke all on function
  private.guard_booking_request(),
  private.assert_appointment_request_dentist(),
  private.guard_booking_link(),
  private.guard_appointment_reminder()
from public, anon;

grant execute on function
  private.guard_booking_request(),
  private.assert_appointment_request_dentist(),
  private.guard_booking_link(),
  private.guard_appointment_reminder()
to authenticated, service_role;
