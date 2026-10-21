-- Available slots (1.8).
-- Signed-in accounts only. anon cannot execute this function.
-- One start is free when it sits on the clinic step in Europe/Belgrade,
-- inside working hours, clear of the break, clear of a block, inside the
-- notice and the horizon, and clear of an occupying appointment plus the
-- buffer. Cancelled appointments do not hold the chair. The buffer is the
-- gap after the earlier of the two appointments. Duration is the clinic
-- default. A hidden or unavailable dentist, or a clinic that is not on the
-- public page, yields no starts.

create or replace function public.get_available_slots(
  slug text,
  dentist_id uuid,
  day date
)
returns table (starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := btrim(slug);
  v_dentist_id uuid := dentist_id;
  v_day date := day;
  v_today date;
  v_clinic_id uuid;
  v_step_minutes smallint;
  v_buffer_minutes smallint;
  v_duration_minutes smallint;
  v_notice_minutes integer;
  v_horizon_days integer;
  v_opens_at time;
  v_closes_at time;
  v_break_starts_at time;
  v_break_ends_at time;
  v_open_seconds integer;
  v_step_seconds integer;
  v_first_seconds integer;
  v_first_local timestamp;
  v_last_local timestamp;
begin
  if auth.uid() is null
    or v_slug is null
    or v_slug = ''
    or v_dentist_id is null
    or v_day is null
  then
    return;
  end if;

  v_today := (timezone('Europe/Belgrade', now()))::date;

  if v_day < v_today then
    return;
  end if;

  select
    clinics.id,
    clinics.slot_minutes,
    clinics.buffer_minutes,
    clinics.default_duration_min,
    clinics.min_notice_minutes,
    clinics.max_ahead_days
  into
    v_clinic_id,
    v_step_minutes,
    v_buffer_minutes,
    v_duration_minutes,
    v_notice_minutes,
    v_horizon_days
  from public.clinics
  where clinics.slug = v_slug
    and clinics.status = 'active'
    and clinics.setup_completed_at is not null
    and clinics.online_booking_enabled;

  if v_clinic_id is null or v_day > v_today + v_horizon_days then
    return;
  end if;

  if v_step_minutes is null
    or v_step_minutes <= 0
    or v_duration_minutes is null
    or v_duration_minutes < v_step_minutes
    or v_duration_minutes > 120
    or v_duration_minutes % v_step_minutes <> 0
  then
    return;
  end if;

  if not exists (
    select 1
    from public.clinic_members as member
    where member.id = v_dentist_id
      and member.clinic_id = v_clinic_id
      and member.sees_patients
      and member.listed_online
      and not member.unavailable
  ) then
    return;
  end if;

  select
    working_hours.opens_at,
    working_hours.closes_at,
    working_hours.break_starts_at,
    working_hours.break_ends_at
  into v_opens_at, v_closes_at, v_break_starts_at, v_break_ends_at
  from public.working_hours
  where working_hours.clinic_member_id = v_dentist_id
    and working_hours.clinic_id = v_clinic_id
    and working_hours.iso_dow = extract(isodow from v_day)::smallint
    and not working_hours.is_closed;

  if v_opens_at is null or v_closes_at is null or v_closes_at <= v_opens_at then
    return;
  end if;

  v_open_seconds := floor(extract(epoch from v_opens_at))::integer;
  v_step_seconds := v_step_minutes * 60;
  v_first_seconds :=
    ((v_open_seconds + v_step_seconds - 1) / v_step_seconds) * v_step_seconds;
  v_first_local := v_day + make_interval(secs => v_first_seconds);
  v_last_local :=
    v_day + v_closes_at - make_interval(mins => v_duration_minutes);

  if v_first_local > v_last_local then
    return;
  end if;

  return query
  select (gs.slot_start at time zone 'Europe/Belgrade')
  from generate_series(
    v_first_local,
    v_last_local,
    make_interval(mins => v_step_minutes::integer)
  ) as gs(slot_start)
  where (gs.slot_start at time zone 'Europe/Belgrade')
        >= now() + make_interval(mins => greatest(v_notice_minutes, 0))
    and gs.slot_start + make_interval(mins => v_duration_minutes) <= v_day + v_closes_at
    and (
      v_break_starts_at is null
      or v_break_ends_at is null
      or v_break_ends_at <= v_break_starts_at
      or not (
        gs.slot_start < v_day + v_break_ends_at
        and v_day + v_break_starts_at
            < gs.slot_start + make_interval(mins => v_duration_minutes)
      )
    )
    and not exists (
      select 1
      from public.blocked_periods as block
      where block.clinic_member_id = v_dentist_id
        and block.clinic_id = v_clinic_id
        and block.ends_at > block.starts_at
        and block.starts_at < (
          (gs.slot_start + make_interval(mins => v_duration_minutes))
          at time zone 'Europe/Belgrade'
        )
        and (gs.slot_start at time zone 'Europe/Belgrade') < block.ends_at
    )
    and not exists (
      select 1
      from public.appointments as appt
      where appt.dentist_id = v_dentist_id
        and appt.clinic_id = v_clinic_id
        and appt.status in (
          'pending_confirmation',
          'offered',
          'scheduled',
          'completed',
          'no_show'
        )
        and appt.starts_at < (
          (gs.slot_start + make_interval(mins => v_duration_minutes))
          at time zone 'Europe/Belgrade'
          + make_interval(mins => v_buffer_minutes::integer)
        )
        and (gs.slot_start at time zone 'Europe/Belgrade')
            < appt.ends_at + make_interval(mins => v_buffer_minutes::integer)
    )
  order by 1;
end;
$$;

comment on function public.get_available_slots(text, uuid, date) is
  'Free start times for one public dentist on one Belgrade day. Signed-in accounts only. anon has no execute.';

revoke all on function public.get_available_slots(text, uuid, date)
  from public, anon, authenticated, service_role;

grant execute on function public.get_available_slots(text, uuid, date) to authenticated;
