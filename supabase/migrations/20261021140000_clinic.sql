-- Clinic core (1.1): platform admins, clinics, members, devices,
-- appointment types, working hours, and blocked periods.
-- The anonymous role has no SELECT. Legal columns, PIN hashes, and device
-- secrets are omitted from authenticated SELECT.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

comment on schema private is
  'Trigger helpers. Not part of the Data API schemas.';

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.platform_admins is
  'Inserted manually, outside the application. No authenticated policies.';

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  city text not null,
  address text not null,
  latitude double precision,
  longitude double precision,
  phone text not null,
  logo_path text,
  description text,
  tax_id text,
  registration_number text,
  license_number text,
  slot_minutes smallint not null,
  buffer_minutes smallint not null,
  default_duration_min smallint not null,
  min_notice_minutes integer not null,
  max_ahead_days integer not null,
  online_booking_enabled boolean not null default false,
  default_appointment_type_id uuid,
  setup_completed_at timestamptz,
  terms_accepted_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinics_slug_key unique (slug),
  constraint clinics_required_text_check check (
    char_length(btrim(name)) > 0
    and char_length(btrim(slug)) > 0
    and char_length(btrim(city)) > 0
    and char_length(btrim(address)) > 0
    and char_length(btrim(phone)) > 0
  ),
  constraint clinics_description_length_check check (
    description is null or char_length(description) <= 500
  ),
  constraint clinics_coordinates_check check (
    (
      latitude is null
      and longitude is null
    )
    or (
      latitude is not null
      and longitude is not null
      and latitude between -90 and 90
      and longitude between -180 and 180
    )
  ),
  constraint clinics_slot_minutes_check check (slot_minutes in (15, 30)),
  constraint clinics_buffer_minutes_check check (buffer_minutes in (0, 5, 10, 15)),
  constraint clinics_default_duration_check check (
    default_duration_min between 15 and 120
    and default_duration_min % slot_minutes = 0
  ),
  constraint clinics_notice_check check (min_notice_minutes >= 0),
  constraint clinics_horizon_check check (max_ahead_days >= 0),
  constraint clinics_status_check check (status in ('active', 'disabled'))
);

comment on column public.clinics.slug is 'Stable public URL segment. Updates are rejected.';
comment on column public.clinics.default_appointment_type_id is
  'Active appointment type of this clinic, or null until the first type exists.';
comment on column public.clinics.tax_id is
  'Hidden from authenticated SELECT. Owners and platform admins use clinic_legal_fields().';
comment on column public.clinics.registration_number is
  'Hidden from authenticated SELECT. Owners and platform admins use clinic_legal_fields().';
comment on column public.clinics.license_number is
  'Hidden from authenticated SELECT. Owners and platform admins use clinic_legal_fields().';

create table public.clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  sees_patients boolean not null,
  listed_online boolean not null,
  first_name text not null,
  last_name text not null,
  unavailable boolean not null default false,
  pin_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_members_user_id_key unique (user_id),
  constraint clinic_members_clinic_user_key unique (clinic_id, user_id),
  constraint clinic_members_id_clinic_key unique (id, clinic_id),
  constraint clinic_members_role_check check (role in ('owner', 'dentist', 'reception')),
  constraint clinic_members_sees_patients_check check (
    (role = 'dentist' and sees_patients)
    or (role = 'reception' and not sees_patients)
    or role = 'owner'
  ),
  constraint clinic_members_names_check check (
    char_length(btrim(first_name)) > 0
    and char_length(btrim(last_name)) > 0
  )
);

comment on column public.clinic_members.pin_hash is
  'Hash of the 6-digit PIN. Hidden from authenticated SELECT.';
comment on column public.clinic_members.user_id is
  'Unique across every clinic: one membership per account.';

create table public.clinic_devices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  label text not null,
  enrolled_by uuid not null references public.clinic_members (id) on delete cascade,
  secret_hash text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint clinic_devices_label_check check (char_length(btrim(label)) > 0),
  constraint clinic_devices_secret_hash_hmac check (secret_hash ~ '^[0-9a-f]{64}$')
);

comment on column public.clinic_devices.secret_hash is
  'Lowercase hex HMAC-SHA-256 of the clinic_device cookie secret. Hidden from authenticated SELECT.';

create index clinic_devices_clinic_id_idx on public.clinic_devices (clinic_id);
create index clinic_devices_enrolled_by_idx on public.clinic_devices (enrolled_by);

create table public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_types_name_check check (char_length(btrim(name)) > 0)
);

create index appointment_types_clinic_id_idx
  on public.appointment_types (clinic_id, sort_order);

alter table public.clinics
  add constraint clinics_default_appointment_type_id_fkey
  foreign key (default_appointment_type_id)
  references public.appointment_types (id)
  on delete set null;

create index clinics_default_appointment_type_id_idx
  on public.clinics (default_appointment_type_id);

create table public.working_hours (
  clinic_id uuid not null,
  clinic_member_id uuid not null,
  iso_dow smallint not null,
  is_closed boolean not null,
  opens_at time,
  closes_at time,
  break_starts_at time,
  break_ends_at time,
  primary key (clinic_member_id, iso_dow),
  constraint working_hours_member_clinic_fkey
    foreign key (clinic_member_id, clinic_id)
    references public.clinic_members (id, clinic_id)
    on delete cascade,
  constraint working_hours_iso_dow_check check (iso_dow between 1 and 7),
  constraint working_hours_schedule_check check (
    (
      is_closed
      and opens_at is null
      and closes_at is null
      and break_starts_at is null
      and break_ends_at is null
    )
    or (
      not is_closed
      and opens_at is not null
      and closes_at is not null
      and opens_at < closes_at
      and (
        (
          break_starts_at is null
          and break_ends_at is null
        )
        or (
          break_starts_at is not null
          and break_ends_at is not null
          and break_starts_at < break_ends_at
          and opens_at <= break_starts_at
          and break_ends_at <= closes_at
        )
      )
    )
  )
);

create index working_hours_clinic_id_idx on public.working_hours (clinic_id);

comment on column public.working_hours.iso_dow is 'ISO day of week. Monday is 1.';

create table public.blocked_periods (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  clinic_member_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  constraint blocked_periods_member_clinic_fkey
    foreign key (clinic_member_id, clinic_id)
    references public.clinic_members (id, clinic_id)
    on delete cascade,
  constraint blocked_periods_range_check check (ends_at > starts_at)
);

create index blocked_periods_member_clinic_idx
  on public.blocked_periods (clinic_member_id, clinic_id);
create index blocked_periods_member_starts_idx
  on public.blocked_periods (clinic_member_id, starts_at);

comment on table public.blocked_periods is
  'id is the primary key; the spec has no natural key. Online booking skips these rows.';

create index clinic_members_clinic_id_idx on public.clinic_members (clinic_id);

create or replace function private.enforce_clinic_default_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.default_appointment_type_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.appointment_types as appointment_type
    where appointment_type.id = new.default_appointment_type_id
      and appointment_type.clinic_id = new.id
      and appointment_type.active
  ) then
    raise exception 'default appointment type must be an active type of this clinic';
  end if;

  return new;
end;
$$;

create or replace function private.protect_clinic_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.slug is distinct from old.slug then
    raise exception 'clinic slug is immutable';
  end if;

  if tg_op = 'UPDATE'
    and auth.uid() is not null
    and not (public.is_owner() or public.is_platform_admin()) then
    if new.tax_id is distinct from old.tax_id
      or new.registration_number is distinct from old.registration_number
      or new.license_number is distinct from old.license_number
      or new.status is distinct from old.status then
      raise exception 'only the owner may change legal data or clinic status';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.protect_appointment_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.clinic_id is distinct from old.clinic_id then
    raise exception 'appointment type clinic is immutable';
  end if;

  if old.active and not new.active and exists (
    select 1
    from public.clinics
    where default_appointment_type_id = new.id
  ) then
    raise exception 'cannot deactivate the default appointment type';
  end if;

  return new;
end;
$$;

create or replace function private.assert_schedule_member_sees_patients()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.clinic_members as member
    where member.id = new.clinic_member_id
      and member.clinic_id = new.clinic_id
      and member.sees_patients
      and member.role in ('owner', 'dentist')
  ) then
    raise exception 'schedule rows require a dentist or an owner who sees patients';
  end if;

  return new;
end;
$$;

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
  ) then
    raise exception 'a member with working hours or blocked periods must see patients';
  end if;

  return new;
end;
$$;

create or replace function private.assert_device_enrolled_by_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.clinic_members as member
    where member.id = new.enrolled_by
      and member.clinic_id = new.clinic_id
  ) then
    raise exception 'enrolled_by must be a member of the device clinic';
  end if;

  return new;
end;
$$;

-- Role helpers are created before clinic triggers that call them.
-- They are security definer so policies can read membership without recursion.
-- RLS is intentionally not forced: the function owner must bypass it.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  );
$$;

create or replace function public.current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinic_id
  from public.clinic_members
  where user_id = auth.uid();
$$;

create or replace function public.current_member_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.clinic_members
  where user_id = auth.uid();
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members
    where user_id = auth.uid()
      and role = 'owner'
  );
$$;

create or replace function public.is_dentist()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members
    where user_id = auth.uid()
      and role = 'dentist'
  );
$$;

create or replace function public.is_reception()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members
    where user_id = auth.uid()
      and role = 'reception'
  );
$$;

create or replace function public.clinic_legal_fields(target_clinic_id uuid)
returns table (
  tax_id text,
  registration_number text,
  license_number text
)
language sql
stable
security definer
set search_path = public
as $$
  select clinics.tax_id, clinics.registration_number, clinics.license_number
  from public.clinics
  where clinics.id = target_clinic_id
    and (
      public.is_platform_admin()
      or (
        clinics.id = public.current_clinic_id()
        and public.is_owner()
      )
    );
$$;

create trigger clinics_enforce_default_type
  before insert or update on public.clinics
  for each row
  execute function private.enforce_clinic_default_type();

create trigger clinics_protect_row
  before update on public.clinics
  for each row
  execute function private.protect_clinic_row();

create trigger clinics_set_updated_at
  before update on public.clinics
  for each row
  execute function private.set_updated_at();

create trigger clinic_members_prevent_hiding_schedule
  before update on public.clinic_members
  for each row
  execute function private.prevent_hiding_scheduled_member();

create trigger clinic_members_set_updated_at
  before update on public.clinic_members
  for each row
  execute function private.set_updated_at();

create trigger appointment_types_protect
  before update on public.appointment_types
  for each row
  execute function private.protect_appointment_type();

create trigger appointment_types_set_updated_at
  before update on public.appointment_types
  for each row
  execute function private.set_updated_at();

create trigger working_hours_member_sees_patients
  before insert or update on public.working_hours
  for each row
  execute function private.assert_schedule_member_sees_patients();

create trigger blocked_periods_member_sees_patients
  before insert or update on public.blocked_periods
  for each row
  execute function private.assert_schedule_member_sees_patients();

create trigger clinic_devices_enrolled_by_member
  before insert or update on public.clinic_devices
  for each row
  execute function private.assert_device_enrolled_by_member();

-- Default privileges on hosted Supabase grant anon every new public table.
-- Revoke that, then grant only the authenticated commands policies allow.

revoke all on table
  public.platform_admins,
  public.clinics,
  public.clinic_members,
  public.clinic_devices,
  public.appointment_types,
  public.working_hours,
  public.blocked_periods
from public, anon, authenticated;

-- Column grants, not a table-level SELECT: a table grant covers every column,
-- and revoking one column does not punch a hole in it.
grant select (
  id, name, slug, city, address, latitude, longitude, phone, logo_path, description,
  slot_minutes, buffer_minutes, default_duration_min, min_notice_minutes, max_ahead_days,
  online_booking_enabled, default_appointment_type_id, setup_completed_at, terms_accepted_at,
  status, created_at, updated_at
), insert, update on table public.clinics to authenticated;

grant select (
  id, clinic_id, user_id, role, sees_patients, listed_online,
  first_name, last_name, unavailable, created_at, updated_at
), insert, update, delete on table public.clinic_members to authenticated;

grant select (
  id, clinic_id, label, enrolled_by, revoked_at, created_at
), insert, update, delete on table public.clinic_devices to authenticated;

grant select, insert, update, delete on table public.appointment_types to authenticated;
grant select, insert, update, delete on table public.working_hours to authenticated;
grant select, insert, update, delete on table public.blocked_periods to authenticated;

grant select, insert, update, delete on table
  public.platform_admins,
  public.clinics,
  public.clinic_members,
  public.clinic_devices,
  public.appointment_types,
  public.working_hours,
  public.blocked_periods
to service_role;

alter table public.platform_admins enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
alter table public.clinic_devices enable row level security;
alter table public.appointment_types enable row level security;
alter table public.working_hours enable row level security;
alter table public.blocked_periods enable row level security;

create policy clinics_select
  on public.clinics
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or (
      id = public.current_clinic_id()
      and (public.is_owner() or public.is_dentist())
    )
  );

create policy clinics_insert
  on public.clinics
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy clinics_update
  on public.clinics
  for update
  to authenticated
  using (
    id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  )
  with check (
    id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  );

create policy clinic_members_select
  on public.clinic_members
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or (
      clinic_id = public.current_clinic_id()
      and (public.is_owner() or public.is_dentist())
    )
  );

create policy clinic_members_insert
  on public.clinic_members
  for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or (
      clinic_id = public.current_clinic_id()
      and (public.is_owner() or public.is_dentist())
    )
  );

create policy clinic_members_update
  on public.clinic_members
  for update
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  )
  with check (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  );

create policy clinic_members_delete
  on public.clinic_members
  for delete
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  );

create policy clinic_devices_staff
  on public.clinic_devices
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

create policy appointment_types_staff
  on public.appointment_types
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

create policy working_hours_staff
  on public.working_hours
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

create policy blocked_periods_staff
  on public.blocked_periods
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

revoke all on function
  public.is_platform_admin(),
  public.current_clinic_id(),
  public.current_member_role(),
  public.is_owner(),
  public.is_dentist(),
  public.is_reception(),
  public.clinic_legal_fields(uuid)
from public, anon;

grant execute on function
  public.is_platform_admin(),
  public.current_clinic_id(),
  public.current_member_role(),
  public.is_owner(),
  public.is_dentist(),
  public.is_reception(),
  public.clinic_legal_fields(uuid)
to authenticated, service_role;

revoke all on function
  private.set_updated_at(),
  private.enforce_clinic_default_type(),
  private.protect_clinic_row(),
  private.protect_appointment_type(),
  private.assert_schedule_member_sees_patients(),
  private.prevent_hiding_scheduled_member(),
  private.assert_device_enrolled_by_member()
from public, anon;

grant execute on function
  private.set_updated_at(),
  private.enforce_clinic_default_type(),
  private.protect_clinic_row(),
  private.protect_appointment_type(),
  private.assert_schedule_member_sees_patients(),
  private.prevent_hiding_scheduled_member(),
  private.assert_device_enrolled_by_member()
to authenticated, service_role;
