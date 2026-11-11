-- Hard-delete the newest tooth_state_changes row and restore tooth_states
-- without appending history. Ordinary status/surface saves still go through
-- private.record_tooth_state_change(); authenticated has no DELETE on history.

create or replace function private.record_tooth_state_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_id uuid;
begin
  if current_setting('app.skip_tooth_history', true) = '1' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.status is not distinct from old.status
    and new.surfaces is not distinct from old.surfaces
  then
    return new;
  end if;

  select members.id
  into member_id
  from public.clinic_members as members
  where members.user_id = auth.uid()
    and members.clinic_id = new.clinic_id;

  insert into public.tooth_state_changes (
    tooth_state_id,
    clinic_id,
    old_status,
    new_status,
    old_surfaces,
    new_surfaces,
    visit_id,
    changed_by,
    changed_at
  ) values (
    new.id,
    new.clinic_id,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    case when tg_op = 'UPDATE' then old.surfaces else null end,
    new.surfaces,
    null,
    member_id,
    now()
  );

  return new;
end;
$$;

create or replace function public.revert_tooth_change(p_change_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_change public.tooth_state_changes%rowtype;
  v_state public.tooth_states%rowtype;
  v_merged uuid;
  v_latest_id uuid;
  v_prev_status text;
  v_prev_surfaces jsonb;
begin
  if auth.uid() is null
    or p_change_id is null
    or not (public.is_owner() or public.is_dentist())
  then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select *
  into v_change
  from public.tooth_state_changes as change
  where change.id = p_change_id
  for update;

  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  if v_change.clinic_id is distinct from public.current_clinic_id() then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select *
  into v_state
  from public.tooth_states as state
  where state.id = v_change.tooth_state_id
  for update;

  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  if v_state.clinic_id is distinct from public.current_clinic_id() then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select patient.merged_into_id
  into v_merged
  from public.patients as patient
  where patient.id = v_state.patient_id
    and patient.clinic_id = v_state.clinic_id;

  if not found or v_merged is not null then
    return jsonb_build_object('status', 'missing');
  end if;

  select change.id
  into v_latest_id
  from public.tooth_state_changes as change
  where change.tooth_state_id = v_change.tooth_state_id
  order by change.changed_at desc, change.id desc
  limit 1;

  if v_latest_id is distinct from v_change.id then
    return jsonb_build_object('status', 'not_latest');
  end if;

  if v_change.old_status is null then
    v_prev_status := 'healthy';
    v_prev_surfaces := null;
  else
    v_prev_status := v_change.old_status;
    v_prev_surfaces := v_change.old_surfaces;
  end if;

  perform set_config('app.skip_tooth_history', '1', true);

  update public.tooth_states
  set
    status = v_prev_status,
    surfaces = v_prev_surfaces
  where id = v_state.id;

  delete from public.tooth_state_changes
  where id = v_change.id;

  return jsonb_build_object('status', 'ok');
exception
  when others then
    return jsonb_build_object('status', 'unavailable');
end;
$$;

comment on function public.revert_tooth_change(uuid) is
  'Restores tooth_states from the newest tooth_state_changes row and deletes that history row without appending a new one. Owner/dentist only.';

revoke all on function public.revert_tooth_change(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.revert_tooth_change(uuid)
  to authenticated;
