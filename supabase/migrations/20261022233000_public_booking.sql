-- Public writes (1.9): request_clinic_access and create_booking.
-- create_booking is not granted to anon. A call without a signed-in,
-- confirmed patient account raises and inserts nothing.
-- The requested chair is held as pending_confirmation. A taken slot,
-- a third pending request for the same email, or a third pending
-- request for the same chart inserts nothing.
-- Names and a child's relationship are read from the account and
-- patient_dependents. phone and date_of_birth are written onto the
-- account only when that column is still null. reason is the only
-- free text. The contact argument is not stored.

create or replace function private.normalize_phone(input text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  value text := regexp_replace(coalesce(input, ''), '[[:space:]/–—-]', '', 'g');
begin
  if value = '' then
    return null;
  end if;

  if left(value, 2) = '00' then
    value := '+' || substr(value, 3);
  elsif left(value, 1) = '0' then
    value := '+381' || substr(value, 2);
  end if;

  if value !~ '^\+381[1-9][0-9]{7,9}$' then
    return null;
  end if;

  return value;
end;
$$;

comment on function private.normalize_phone(text) is
  'Serbian phone stored as +381. Blank and invalid input return null.';

-- Fifteen full years. A 29 February birthday falls on 1 March when the
-- fifteenth year is not a leap year.
create or replace function private.has_turned_15(date_of_birth date, on_date date)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  anniversary_year integer;
  anniversary date;
begin
  if date_of_birth is null or on_date is null then
    return false;
  end if;

  anniversary_year := extract(year from date_of_birth)::integer + 15;

  if extract(month from date_of_birth)::integer = 2
    and extract(day from date_of_birth)::integer = 29
    and not (
      (anniversary_year % 4 = 0 and anniversary_year % 100 <> 0)
      or anniversary_year % 400 = 0
    )
  then
    anniversary := make_date(anniversary_year, 3, 1);
  else
    anniversary := make_date(
      anniversary_year,
      extract(month from date_of_birth)::integer,
      extract(day from date_of_birth)::integer
    );
  end if;

  return on_date >= anniversary;
end;
$$;

comment on function private.has_turned_15(date, date) is
  'True on the Belgrade calendar day of the fifteenth birthday and after.';

-- Twenty-four elapsed hours counted only on days that dentist is open
-- and not covered by one block from opens_at through closes_at.
-- The result is never later than the appointment start.
create or replace function private.booking_expires_at(
  dentist_id uuid,
  clinic_id uuid,
  created_at timestamptz,
  starts_at timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  remaining interval := interval '24 hours';
  cursor_at timestamptz := created_at;
  limit_at timestamptz := starts_at;
  iso_date date;
  next_at timestamptz;
  day_closed boolean;
  opens_at time;
  closes_at time;
  room interval;
  guard integer := 0;
begin
  if cursor_at is null or limit_at is null or limit_at <= cursor_at then
    return limit_at;
  end if;

  while remaining > interval '0' and guard < 800 loop
    guard := guard + 1;

    if cursor_at >= limit_at then
      return limit_at;
    end if;

    iso_date := (timezone('Europe/Belgrade', cursor_at))::date;
    next_at := ((iso_date + 1)::timestamp at time zone 'Europe/Belgrade');

    if next_at <= cursor_at then
      return limit_at;
    end if;

    select working_hours.is_closed, working_hours.opens_at, working_hours.closes_at
    into day_closed, opens_at, closes_at
    from public.working_hours
    where working_hours.clinic_member_id = booking_expires_at.dentist_id
      and working_hours.clinic_id = booking_expires_at.clinic_id
      and working_hours.iso_dow = extract(isodow from iso_date)::smallint;

    if not found
      or day_closed
      or opens_at is null
      or closes_at is null
      or closes_at <= opens_at
      or exists (
        select 1
        from public.blocked_periods as block
        where block.clinic_member_id = booking_expires_at.dentist_id
          and block.clinic_id = booking_expires_at.clinic_id
          and block.ends_at > block.starts_at
          and block.starts_at <= ((iso_date + opens_at) at time zone 'Europe/Belgrade')
          and block.ends_at >= ((iso_date + closes_at) at time zone 'Europe/Belgrade')
      )
    then
      cursor_at := next_at;
      continue;
    end if;

    room := least(next_at, limit_at) - cursor_at;

    if room >= remaining then
      return cursor_at + remaining;
    end if;

    remaining := remaining - room;
    cursor_at := next_at;
  end loop;

  return limit_at;
end;
$$;

comment on function private.booking_expires_at(uuid, uuid, timestamptz, timestamptz) is
  'Request deadline: 24 open hours of that dentist, and not after the appointment start.';

create or replace function public.request_clinic_access(
  email text,
  city text,
  ip_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := btrim(email);
  v_city text := btrim(city);
  v_ip_hash text := lower(btrim(ip_hash));
  v_id uuid;
begin
  if v_email is null or v_email = '' or v_city is null or v_city = '' then
    raise exception 'email and city are required';
  end if;

  if v_ip_hash is null or v_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ip_hash must be a 64-character hex HMAC-SHA-256';
  end if;

  perform private.lock_clinic_email(v_email);

  if exists (
    select 1
    from public.clinic_access_requests as request
    where lower(request.email) = lower(v_email)
      and request.status = 'pending'
  ) then
    raise exception 'a pending clinic access request already exists for this email';
  end if;

  insert into public.clinic_access_requests (email, city, ip_hash)
  values (v_email, v_city, v_ip_hash)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.request_clinic_access(text, text, text) is
  'Stores one clinic-access request. Rejects a duplicate pending email and an unused clinic invite. anon only.';

create or replace function public.create_booking(
  slug text,
  dentist_id uuid,
  starts_at timestamptz,
  for_child boolean,
  dependent_id uuid,
  phone text,
  date_of_birth date,
  contact text,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_slug text := btrim(slug);
  v_dentist_id uuid := dentist_id;
  v_starts_at timestamptz := starts_at;
  v_for_child boolean := for_child;
  v_dependent_id uuid := dependent_id;
  v_contact text := nullif(btrim(contact), '');
  v_phone text;
  v_dob date := date_of_birth;
  v_reason text := nullif(btrim(reason), '');
  v_account_id uuid;
  v_email text;
  v_first_name text;
  v_last_name text;
  v_account_phone text;
  v_account_dob date;
  v_confirmed_at timestamptz;
  v_patient_first text;
  v_patient_last text;
  v_patient_dob date;
  v_patient_phone text;
  v_contact_relationship text;
  v_contact_first text;
  v_contact_last text;
  v_contact_phone text;
  v_clinic_id uuid;
  v_duration smallint;
  v_type_id uuid;
  v_ends_at timestamptz;
  v_day date;
  v_today date := (timezone('Europe/Belgrade', now()))::date;
  v_patient_id uuid;
  v_link_dependent uuid;
  v_created_at timestamptz;
  v_expires_at timestamptz;
  v_appointment_id uuid;
  v_request_id uuid;
begin
  -- v_contact is accepted and then ignored. Names and relationship are not
  -- taken from the caller.
  v_contact := null;

  if auth.uid() is null then
    raise exception 'create_booking requires a signed-in account';
  end if;

  if v_slug is null or v_slug = '' or v_dentist_id is null or v_starts_at is null then
    raise exception 'slug, dentist and start are required';
  end if;

  if v_for_child is null then
    raise exception 'for_child is required';
  end if;

  select account.id
  into v_account_id
  from public.patient_accounts as account
  where account.user_id = auth.uid();

  if not found then
    raise exception 'create_booking requires a patient account';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('booking-account:' || v_account_id::text, 0)
  );

  select
    account.email,
    account.first_name,
    account.last_name,
    account.phone,
    account.date_of_birth,
    account.email_confirmed_at
  into
    v_email,
    v_first_name,
    v_last_name,
    v_account_phone,
    v_account_dob,
    v_confirmed_at
  from public.patient_accounts as account
  where account.id = v_account_id;

  if v_confirmed_at is null then
    raise exception 'create_booking requires a confirmed email';
  end if;

  if phone is not null and btrim(phone) <> '' then
    v_phone := private.normalize_phone(phone);
    if v_phone is null then
      raise exception 'phone is not a valid Serbian number';
    end if;
  end if;

  if v_for_child then
    if v_dependent_id is null then
      raise exception 'a child booking requires a dependent';
    end if;

    select
      dependent.first_name,
      dependent.last_name,
      dependent.date_of_birth,
      dependent.relationship
    into
      v_patient_first,
      v_patient_last,
      v_patient_dob,
      v_contact_relationship
    from public.patient_dependents as dependent
    where dependent.id = v_dependent_id
      and dependent.account_id = v_account_id;

    if not found then
      raise exception 'dependent does not belong to this account';
    end if;

    if private.has_turned_15(v_patient_dob, v_today) then
      raise exception 'a person who has turned 15 books for themselves';
    end if;

    v_contact_first := v_first_name;
    v_contact_last := v_last_name;
    v_patient_phone := null;
    v_link_dependent := v_dependent_id;
  else
    if v_dependent_id is not null then
      raise exception 'dependent_id is only for a child booking';
    end if;

    v_patient_first := v_first_name;
    v_patient_last := v_last_name;
    v_patient_dob := coalesce(v_account_dob, v_dob);
    v_link_dependent := null;

    if v_patient_dob is null then
      raise exception 'date of birth is required';
    end if;

    if not private.has_turned_15(v_patient_dob, v_today) then
      raise exception 'a person under 15 books through a parent account';
    end if;
  end if;

  select
    clinic.id,
    clinic.default_duration_min,
    clinic.default_appointment_type_id
  into v_clinic_id, v_duration, v_type_id
  from public.clinics as clinic
  where clinic.slug = v_slug
    and clinic.status = 'active'
    and clinic.setup_completed_at is not null
    and clinic.online_booking_enabled;

  if not found then
    raise exception 'clinic is not open for booking';
  end if;

  if v_duration is null
    or v_type_id is null
    or not exists (
      select 1
      from public.appointment_types as appointment_type
      where appointment_type.id = v_type_id
        and appointment_type.clinic_id = v_clinic_id
        and appointment_type.active
    )
  then
    raise exception 'clinic has no default appointment type';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('booking-dentist:' || v_dentist_id::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'booking-email:' || v_clinic_id::text || ':' || lower(v_email),
      0
    )
  );

  v_day := (timezone('Europe/Belgrade', v_starts_at))::date;
  v_ends_at := v_starts_at + make_interval(mins => v_duration::integer);

  if not exists (
    select 1
    from public.get_available_slots(v_slug, v_dentist_id, v_day) as slot
    where slot.starts_at = v_starts_at
  ) then
    raise exception 'slot is not available';
  end if;

  if (
    select count(*)
    from public.booking_requests as request
    where request.clinic_id = v_clinic_id
      and request.status = 'pending'
      and lower(request.booker_email) = lower(v_email)
  ) >= 2 then
    raise exception 'this email already has two pending requests in this clinic';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('booking-chart:' || link.patient_id::text, 0)
  )
  from public.patient_chart_links as link
  where link.clinic_id = v_clinic_id
    and link.account_id = v_account_id
    and link.dependent_id is not distinct from v_link_dependent
  order by link.patient_id;

  if exists (
    select 1
    from public.patient_chart_links as link
    where link.clinic_id = v_clinic_id
      and link.account_id = v_account_id
      and link.dependent_id is not distinct from v_link_dependent
      and (
        select count(*)
        from public.booking_requests as request
        where request.clinic_id = v_clinic_id
          and request.status = 'pending'
          and request.patient_id = link.patient_id
      ) >= 2
  ) then
    raise exception 'this chart already has two pending requests in this clinic';
  end if;

  select link.patient_id
  into v_patient_id
  from public.patient_chart_links as link
  where link.clinic_id = v_clinic_id
    and link.account_id = v_account_id
    and link.dependent_id is not distinct from v_link_dependent
  order by link.created_at desc
  limit 1;

  if v_account_phone is null and v_phone is not null then
    update public.patient_accounts as account
    set phone = v_phone
    where account.id = v_account_id
      and account.phone is null;
    v_account_phone := v_phone;
  end if;

  if not v_for_child and v_account_dob is null and v_dob is not null then
    update public.patient_accounts as account
    set date_of_birth = v_dob
    where account.id = v_account_id
      and account.date_of_birth is null;
  end if;

  if v_for_child then
    v_contact_phone := coalesce(v_account_phone, v_phone);
    if v_contact_phone is null then
      raise exception 'phone is required';
    end if;
  else
    v_patient_phone := coalesce(v_account_phone, v_phone);
    if v_patient_phone is null then
      raise exception 'phone is required';
    end if;
  end if;

  v_created_at := now();
  v_expires_at := private.booking_expires_at(
    v_dentist_id,
    v_clinic_id,
    v_created_at,
    v_starts_at
  );
  v_appointment_id := extensions.gen_random_uuid();
  v_request_id := extensions.gen_random_uuid();

  insert into public.appointments (
    id,
    clinic_id,
    dentist_id,
    patient_id,
    booking_request_id,
    starts_at,
    ends_at,
    appointment_type_id,
    status,
    source,
    created_at
  ) values (
    v_appointment_id,
    v_clinic_id,
    v_dentist_id,
    null,
    null,
    v_starts_at,
    v_ends_at,
    v_type_id,
    'pending_confirmation',
    'patient',
    v_created_at
  );

  insert into public.booking_requests (
    id,
    clinic_id,
    dentist_id,
    account_id,
    booker_email,
    for_child,
    patient_first_name,
    patient_last_name,
    patient_date_of_birth,
    patient_phone,
    contact_relationship,
    contact_first_name,
    contact_last_name,
    contact_phone,
    reason,
    patient_id,
    appointment_id,
    status,
    expires_at,
    created_at
  ) values (
    v_request_id,
    v_clinic_id,
    v_dentist_id,
    v_account_id,
    v_email,
    v_for_child,
    v_patient_first,
    v_patient_last,
    v_patient_dob,
    v_patient_phone,
    v_contact_relationship,
    v_contact_first,
    v_contact_last,
    v_contact_phone,
    v_reason,
    v_patient_id,
    v_appointment_id,
    'pending',
    v_expires_at,
    v_created_at
  );

  update public.appointments
  set booking_request_id = v_request_id
  where id = v_appointment_id;

  return v_request_id;
end;
$$;

comment on function public.create_booking(text, uuid, timestamptz, boolean, uuid, text, date, text, text) is
  'Creates a pending request and holds the chair as pending_confirmation. Signed-in confirmed patient accounts only. anon has no execute.';

revoke all on function private.normalize_phone(text)
  from public, anon, authenticated, service_role;
revoke all on function private.has_turned_15(date, date)
  from public, anon, authenticated, service_role;
revoke all on function private.booking_expires_at(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;

revoke all on function public.request_clinic_access(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_booking(text, uuid, timestamptz, boolean, uuid, text, date, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.request_clinic_access(text, text, text) to anon;
grant execute on function public.create_booking(text, uuid, timestamptz, boolean, uuid, text, date, text, text)
  to authenticated;
