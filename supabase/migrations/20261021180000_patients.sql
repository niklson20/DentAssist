-- Patients (1.3): charts, contacts, email claims, anamnesis, and alerts.
-- Reception reads patients_for_reception, which omits jmbg.
-- Owners and dentists read jmbg through patient_jmbg(). anon has no SELECT.
-- appointment_id has no foreign key yet: appointments arrive in a later migration.

create or replace function private.normalize_patient()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.first_name = btrim(new.first_name);
  new.last_name = btrim(new.last_name);
  new.slug = btrim(new.slug);

  if new.email is not null then
    new.email = nullif(btrim(new.email), '');
  end if;

  if new.phone is not null then
    new.phone = nullif(btrim(new.phone), '');
  end if;

  if new.address is not null then
    new.address = nullif(btrim(new.address), '');
  end if;

  if new.note is not null then
    new.note = nullif(btrim(new.note), '');
  end if;

  if new.jmbg is not null then
    new.jmbg = nullif(btrim(new.jmbg), '');
  end if;

  if new.sex is not null then
    new.sex = nullif(btrim(new.sex), '');
  end if;

  return new;
end;
$$;

create or replace function private.protect_patient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.slug is distinct from old.slug then
    raise exception 'patient slug is immutable';
  end if;

  if tg_op = 'UPDATE' and new.clinic_id is distinct from old.clinic_id then
    raise exception 'patient clinic is immutable';
  end if;

  if auth.uid() is not null and not public.is_owner() and (
    (tg_op = 'INSERT' and new.merged_into_id is not null)
    or (tg_op = 'UPDATE' and new.merged_into_id is distinct from old.merged_into_id)
  ) then
    raise exception 'only the owner may merge patients';
  end if;

  if public.is_reception() and (
    (tg_op = 'INSERT' and new.jmbg is not null)
    or (tg_op = 'UPDATE' and new.jmbg is distinct from old.jmbg)
  ) then
    raise exception 'reception cannot change jmbg';
  end if;

  return new;
end;
$$;

create or replace function private.normalize_patient_contact()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.relationship = btrim(new.relationship);
  new.first_name = btrim(new.first_name);
  new.last_name = btrim(new.last_name);

  if new.phone is not null then
    new.phone = nullif(btrim(new.phone), '');
  end if;

  if new.email is not null then
    new.email = nullif(btrim(new.email), '');
  end if;

  if tg_op = 'UPDATE' and (
    new.patient_id is distinct from old.patient_id
    or new.clinic_id is distinct from old.clinic_id
  ) then
    raise exception 'patient contact chart is immutable';
  end if;

  return new;
end;
$$;

create or replace function private.normalize_patient_email_claim()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email = btrim(new.email);
  new.status = btrim(new.status);

  if tg_op = 'UPDATE' and (
    new.patient_id is distinct from old.patient_id
    or new.clinic_id is distinct from old.clinic_id
    or new.appointment_id is distinct from old.appointment_id
  ) then
    raise exception 'email claim link is immutable';
  end if;

  return new;
end;
$$;

create or replace function private.normalize_patient_anamnesis()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.chronic_conditions is not null then
    new.chronic_conditions = nullif(btrim(new.chronic_conditions), '');
  end if;

  if new.medications is not null then
    new.medications = nullif(btrim(new.medications), '');
  end if;

  if new.allergies is not null then
    new.allergies = nullif(btrim(new.allergies), '');
  end if;

  if new.pregnancy is not null then
    new.pregnancy = nullif(btrim(new.pregnancy), '');
  end if;

  if tg_op = 'UPDATE' and (
    new.patient_id is distinct from old.patient_id
    or new.clinic_id is distinct from old.clinic_id
  ) then
    raise exception 'anamnesis chart is immutable';
  end if;

  return new;
end;
$$;

create or replace function private.normalize_patient_alert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.code = btrim(new.code);
  new.note = btrim(new.note);

  if tg_op = 'UPDATE' and (
    new.patient_id is distinct from old.patient_id
    or new.clinic_id is distinct from old.clinic_id
  ) then
    raise exception 'alert chart is immutable';
  end if;

  return new;
end;
$$;

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  slug text not null,
  email text,
  email_declined boolean not null default false,
  phone text,
  date_of_birth date,
  sex text,
  address text,
  jmbg text,
  note text,
  merged_into_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_id_clinic_key unique (id, clinic_id),
  constraint patients_clinic_slug_key unique (clinic_id, slug),
  constraint patients_names_check check (
    char_length(btrim(first_name)) > 0
    and char_length(btrim(last_name)) > 0
  ),
  constraint patients_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint patients_sex_check check (sex is null or sex in ('male', 'female')),
  constraint patients_jmbg_check check (jmbg is null or jmbg ~ '^[0-9]{13}$'),
  constraint patients_email_declined_check check (not email_declined or email is null),
  constraint patients_merged_not_self_check check (merged_into_id is distinct from id),
  constraint patients_merged_into_fkey
    foreign key (merged_into_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete no action
    deferrable initially deferred
);

comment on table public.patients is
  'Chart inside one clinic. A merged chart stays in the table and points at merged_into_id.';
comment on column public.patients.slug is
  'Stable chart URL segment inside the clinic. Updates are rejected.';
comment on column public.patients.email is
  'Email of this patient, not of a parent. Unique per clinic when set.';
comment on column public.patients.email_declined is
  'True after the patient says they have no email. Then email stays null.';
comment on column public.patients.jmbg is
  'Optional 13-digit identifier. Hidden from authenticated SELECT. Owners and dentists use patient_jmbg().';
comment on column public.patients.merged_into_id is
  'Chart that absorbed this one. Same clinic. Only the owner sets it. The source row is kept.';

create unique index patients_clinic_email_key
  on public.patients (clinic_id, lower(email))
  where email is not null;

create index patients_merged_into_id_idx
  on public.patients (merged_into_id)
  where merged_into_id is not null;

create table public.patient_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  clinic_id uuid not null,
  relationship text not null,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  confirmed_at timestamptz,
  constraint patient_contacts_patient_clinic_fkey
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade,
  constraint patient_contacts_relationship_check check (
    relationship in (
      'mother',
      'father',
      'guardian',
      'grandmother',
      'grandfather',
      'other_relative'
    )
  ),
  constraint patient_contacts_names_check check (
    char_length(btrim(first_name)) > 0
    and char_length(btrim(last_name)) > 0
  )
);

comment on table public.patient_contacts is
  'Parent or relative of a chart. id is the primary key; the spec has no natural key.';
comment on column public.patient_contacts.confirmed_at is
  'Null until the clinic confirms this contact on arrival.';
comment on column public.patient_contacts.email is
  'Contact email. This is not copied into patients.email.';

create index patient_contacts_clinic_patient_idx
  on public.patient_contacts (clinic_id, patient_id);

create table public.patient_email_claims (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  clinic_id uuid not null,
  appointment_id uuid not null,
  email text not null,
  status text not null default 'pending',
  resolved_by uuid,
  resolved_at timestamptz,
  constraint patient_email_claims_patient_clinic_fkey
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade,
  constraint patient_email_claims_resolved_by_fkey
    foreign key (resolved_by, clinic_id)
    references public.clinic_members (id, clinic_id)
    on delete no action
    deferrable initially deferred,
  constraint patient_email_claims_email_check check (char_length(btrim(email)) > 0),
  constraint patient_email_claims_status_check check (
    status in ('pending', 'confirmed', 'rejected')
  ),
  constraint patient_email_claims_resolution_check check (
    (
      status = 'pending'
      and resolved_by is null
      and resolved_at is null
    )
    or (
      status in ('confirmed', 'rejected')
      and resolved_by is not null
      and resolved_at is not null
    )
  )
);

comment on table public.patient_email_claims is
  'Email waiting for confirmation on arrival. It is not written to patients.email while pending.';
comment on column public.patient_email_claims.appointment_id is
  'Appointment this claim belongs to. The foreign key is added with the appointments table.';
comment on column public.patient_email_claims.resolved_by is
  'Clinic member who confirmed or rejected the claim.';

create index patient_email_claims_clinic_patient_idx
  on public.patient_email_claims (clinic_id, patient_id);

create index patient_email_claims_appointment_id_idx
  on public.patient_email_claims (appointment_id);

create index patient_email_claims_resolved_by_idx
  on public.patient_email_claims (resolved_by);

create table public.patient_anamnesis (
  patient_id uuid primary key,
  clinic_id uuid not null,
  chronic_conditions text,
  medications text,
  allergies text,
  pregnancy text,
  constraint patient_anamnesis_patient_clinic_fkey
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade
);

comment on table public.patient_anamnesis is
  'At most one anamnesis row per chart. All text columns are optional.';

create index patient_anamnesis_clinic_id_idx
  on public.patient_anamnesis (clinic_id);

create table public.patient_alerts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  clinic_id uuid not null,
  code text not null,
  note text not null,
  constraint patient_alerts_patient_clinic_fkey
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade,
  constraint patient_alerts_code_check check (
    code in ('drug_allergy', 'pregnancy', 'coagulation', 'other')
  ),
  constraint patient_alerts_note_check check (char_length(btrim(note)) > 0)
);

comment on table public.patient_alerts is
  'Short warning on a chart. id is the primary key; the spec has no natural key.';
comment on column public.patient_alerts.note is
  'Required short text shown with the warning.';

create index patient_alerts_clinic_patient_idx
  on public.patient_alerts (clinic_id, patient_id);

create trigger patients_normalize
  before insert or update on public.patients
  for each row
  execute function private.normalize_patient();

create trigger patients_protect
  before insert or update on public.patients
  for each row
  execute function private.protect_patient();

create trigger patients_set_updated_at
  before update on public.patients
  for each row
  execute function private.set_updated_at();

create trigger patient_contacts_normalize
  before insert or update on public.patient_contacts
  for each row
  execute function private.normalize_patient_contact();

create trigger patient_email_claims_normalize
  before insert or update on public.patient_email_claims
  for each row
  execute function private.normalize_patient_email_claim();

create trigger patient_anamnesis_normalize
  before insert or update on public.patient_anamnesis
  for each row
  execute function private.normalize_patient_anamnesis();

create trigger patient_alerts_normalize
  before insert or update on public.patient_alerts
  for each row
  execute function private.normalize_patient_alert();

create view public.patients_for_reception
with (security_invoker = true, security_barrier = true) as
select
  id,
  clinic_id,
  first_name,
  last_name,
  slug,
  email,
  email_declined,
  phone,
  date_of_birth,
  sex,
  address,
  note,
  merged_into_id,
  created_at,
  updated_at
from public.patients;

comment on view public.patients_for_reception is
  'Reception chart list. Omits jmbg. security_invoker so patients row security applies.';

create or replace function public.patient_jmbg(target_patient_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select patients.jmbg
  from public.patients
  where patients.id = target_patient_id
    and patients.clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist());
$$;

comment on function public.patient_jmbg(uuid) is
  'JMBG for the owner or dentist of that clinic. Reception and other clinics get null.';

revoke all on table
  public.patients,
  public.patient_contacts,
  public.patient_email_claims,
  public.patient_anamnesis,
  public.patient_alerts,
  public.patients_for_reception
from public, anon, authenticated;

grant select (
  id,
  clinic_id,
  first_name,
  last_name,
  slug,
  email,
  email_declined,
  phone,
  date_of_birth,
  sex,
  address,
  note,
  merged_into_id,
  created_at,
  updated_at
), insert (
  id,
  clinic_id,
  first_name,
  last_name,
  slug,
  email,
  email_declined,
  phone,
  date_of_birth,
  sex,
  address,
  jmbg,
  note,
  merged_into_id
), update (
  first_name,
  last_name,
  email,
  email_declined,
  phone,
  date_of_birth,
  sex,
  address,
  jmbg,
  note,
  merged_into_id
) on table public.patients to authenticated;

grant select on table public.patients_for_reception to authenticated;

grant select, insert, update, delete on table public.patient_contacts to authenticated;

grant select, insert, update, delete on table
  public.patient_email_claims,
  public.patient_anamnesis,
  public.patient_alerts
to authenticated;

grant select, insert, update, delete on table
  public.patients,
  public.patient_contacts,
  public.patient_email_claims,
  public.patient_anamnesis,
  public.patient_alerts,
  public.patients_for_reception
to service_role;

alter table public.patients enable row level security;
alter table public.patient_contacts enable row level security;
alter table public.patient_email_claims enable row level security;
alter table public.patient_anamnesis enable row level security;
alter table public.patient_alerts enable row level security;

create policy patients_select
  on public.patients
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist() or public.is_reception())
  );

create policy patients_insert
  on public.patients
  for insert
  to authenticated
  with check (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist() or public.is_reception())
  );

create policy patients_update
  on public.patients
  for update
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist() or public.is_reception())
  )
  with check (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist() or public.is_reception())
  );

create policy patient_contacts_staff
  on public.patient_contacts
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

create policy patient_email_claims_clinical
  on public.patient_email_claims
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

create policy patient_anamnesis_clinical
  on public.patient_anamnesis
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

create policy patient_alerts_clinical
  on public.patient_alerts
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

revoke all on function public.patient_jmbg(uuid) from public, anon;

grant execute on function public.patient_jmbg(uuid) to authenticated, service_role;

revoke all on function
  private.normalize_patient(),
  private.protect_patient(),
  private.normalize_patient_contact(),
  private.normalize_patient_email_claim(),
  private.normalize_patient_anamnesis(),
  private.normalize_patient_alert()
from public, anon;

grant execute on function
  private.normalize_patient(),
  private.protect_patient(),
  private.normalize_patient_contact(),
  private.normalize_patient_email_claim(),
  private.normalize_patient_anamnesis(),
  private.normalize_patient_alert()
to authenticated, service_role;
