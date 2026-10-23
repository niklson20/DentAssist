-- Manage page (2.D9).
-- A signed-out caller learns the clinic slug so the page can open login.
-- The appointment and free starts are returned only when the signed-in account
-- is the request account and that account email is the request email.
-- Another account gets no times. Inside 24 hours of the start, the matching
-- account gets the clinic phone and no starts.

create or replace function public.preview_booking_manage(
  p_token_hash text,
  p_day date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hash text := lower(btrim(p_token_hash));
  v_link public.booking_links%rowtype;
  v_request public.booking_requests%rowtype;
  v_appointment public.appointments%rowtype;
  v_account_id uuid;
  v_email text;
  v_confirmed_at timestamptz;
  v_slug text;
  v_clinic_name text;
  v_phone text;
  v_step_minutes smallint;
  v_horizon_days integer;
  v_dentist_first text;
  v_dentist_last text;
  v_scheduled_count integer;
  v_same_account boolean;
  v_today date;
  v_appointment_day date;
  v_day date;
  v_duration interval;
  v_duration_seconds numeric;
  v_step_seconds integer;
  v_can_reschedule boolean;
  v_slots jsonb := '[]'::jsonb;
begin
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select link.*
  into v_link
  from public.booking_links as link
  where link.token_hash = v_hash
    and link.purpose = 'manage';

  if v_link.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select clinic.slug, clinic.name, clinic.phone, clinic.slot_minutes, clinic.max_ahead_days
  into v_slug, v_clinic_name, v_phone, v_step_minutes, v_horizon_days
  from public.clinics as clinic
  where clinic.id = v_link.clinic_id;

  if v_slug is null or btrim(v_slug) = '' or v_phone is null or btrim(v_phone) = '' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select request.*
  into v_request
  from public.booking_requests as request
  where request.id = v_link.booking_request_id
    and request.clinic_id = v_link.clinic_id;

  if v_request.id is null
    or v_link.revoked_at is not null
    or v_link.expires_at <= now()
  then
    return jsonb_build_object(
      'status', 'invalid',
      'slug', v_slug,
      'phone', v_phone
    );
  end if;

  select count(*)::integer
  into v_scheduled_count
  from public.appointments as appointment
  where appointment.booking_request_id = v_request.id
    and appointment.clinic_id = v_request.clinic_id
    and appointment.status = 'scheduled';

  if v_scheduled_count is distinct from 1 then
    return jsonb_build_object(
      'status', 'invalid',
      'slug', v_slug,
      'phone', v_phone
    );
  end if;

  if auth.uid() is not null then
    select account.id, account.email, account.email_confirmed_at
    into v_account_id, v_email, v_confirmed_at
    from public.patient_accounts as account
    where account.user_id = auth.uid();
  end if;

  v_same_account :=
    v_account_id is not null
    and v_confirmed_at is not null
    and v_request.account_id = v_account_id
    and lower(v_request.booker_email) = lower(v_email);

  if auth.uid() is null or v_account_id is null then
    return jsonb_build_object(
      'status', 'signed_out',
      'slug', v_slug
    );
  end if;

  if v_confirmed_at is null then
    return jsonb_build_object(
      'status', 'unconfirmed',
      'slug', v_slug
    );
  end if;

  if not v_same_account then
    return jsonb_build_object(
      'status', 'mismatch',
      'slug', v_slug,
      'phone', v_phone
    );
  end if;

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  where appointment.booking_request_id = v_request.id
    and appointment.clinic_id = v_request.clinic_id
    and appointment.status = 'scheduled';

  if v_appointment.id is null then
    return jsonb_build_object(
      'status', 'invalid',
      'slug', v_slug,
      'phone', v_phone
    );
  end if;

  select btrim(member.first_name), btrim(member.last_name)
  into v_dentist_first, v_dentist_last
  from public.clinic_members as member
  where member.id = v_appointment.dentist_id
    and member.clinic_id = v_appointment.clinic_id;

  if v_dentist_first is null or v_dentist_first = '' or v_dentist_last is null or v_dentist_last = '' then
    return jsonb_build_object(
      'status', 'invalid',
      'slug', v_slug,
      'phone', v_phone
    );
  end if;

  if v_appointment.starts_at <= now() + interval '24 hours' then
    return jsonb_build_object(
      'status', 'too_late',
      'slug', v_slug,
      'clinic_name', v_clinic_name,
      'phone', v_phone,
      'starts_at', v_appointment.starts_at,
      'ends_at', v_appointment.ends_at,
      'dentist_first_name', v_dentist_first,
      'dentist_last_name', v_dentist_last
    );
  end if;

  v_today := (timezone('Europe/Belgrade', now()))::date;
  v_horizon_days := greatest(coalesce(v_horizon_days, 0), 0);
  if p_day is null then
    v_appointment_day := (timezone('Europe/Belgrade', v_appointment.starts_at))::date;
    if v_appointment_day >= v_today and v_appointment_day <= v_today + v_horizon_days then
      v_day := v_appointment_day;
    else
      v_day := v_today;
    end if;
  else
    v_day := p_day;
  end if;

  v_can_reschedule := v_appointment.patient_reschedule_count = 0;
  v_slots := '[]'::jsonb;

  if v_can_reschedule
    and v_day >= v_today
    and v_day <= v_today + v_horizon_days
    and v_step_minutes is not null
    and v_step_minutes > 0
  then
    v_duration := v_appointment.ends_at - v_appointment.starts_at;
    v_duration_seconds := extract(epoch from v_duration);
    v_step_seconds := v_step_minutes * 60;
    if v_duration_seconds = trunc(v_duration_seconds)
      and v_duration_seconds >= v_step_minutes * 60
      and v_duration_seconds <= 120 * 60
      and mod(v_duration_seconds, (v_step_minutes * 60)::numeric) = 0
    then
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'starts_at', candidate.starts_at,
            'ends_at', candidate.starts_at + v_duration
          )
          order by candidate.starts_at
        ),
        '[]'::jsonb
      )
      into v_slots
      from (
        select (gs.slot_start at time zone 'Europe/Belgrade') as starts_at
        from public.working_hours as hours
        cross join lateral (
          select floor(extract(epoch from hours.opens_at))::integer as open_seconds
        ) as opened
        cross join lateral (
          select ((opened.open_seconds + v_step_seconds - 1) / v_step_seconds) * v_step_seconds
            as first_seconds
        ) as snapped
        cross join lateral generate_series(
          v_day + make_interval(secs => snapped.first_seconds),
          v_day + hours.closes_at - v_duration,
          make_interval(mins => v_step_minutes::integer)
        ) as gs(slot_start)
        where hours.clinic_member_id = v_appointment.dentist_id
          and hours.clinic_id = v_appointment.clinic_id
          and hours.iso_dow = extract(isodow from v_day)::smallint
          and not hours.is_closed
          and (v_day + make_interval(secs => snapped.first_seconds))
              <= (v_day + hours.closes_at - v_duration)
          and private.reschedule_slot_is_open(
            v_appointment.clinic_id,
            v_appointment.dentist_id,
            gs.slot_start at time zone 'Europe/Belgrade',
            (gs.slot_start at time zone 'Europe/Belgrade') + v_duration,
            v_appointment.id
          )
          and (gs.slot_start at time zone 'Europe/Belgrade') is distinct from v_appointment.starts_at
        order by 1
        limit 96
      ) as candidate;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'slug', v_slug,
    'clinic_name', v_clinic_name,
    'phone', v_phone,
    'starts_at', v_appointment.starts_at,
    'ends_at', v_appointment.ends_at,
    'dentist_first_name', v_dentist_first,
    'dentist_last_name', v_dentist_last,
    'can_reschedule', v_can_reschedule,
    'today', v_today,
    'max_ahead_days', v_horizon_days,
    'day', v_day,
    'slots', v_slots
  );
end;
$$;

comment on function public.preview_booking_manage(text, date) is
  'Scheduled appointment and free starts for the signed-in patient whose email is the booking request email. A different account and a signed-out caller do not receive times. No starts are returned when 24 hours or less remain.';

revoke all on function public.preview_booking_manage(text, date)
  from public, anon, authenticated, service_role;

grant execute on function public.preview_booking_manage(text, date) to anon, authenticated;
