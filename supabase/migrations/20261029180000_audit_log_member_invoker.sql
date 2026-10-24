-- audit_log_for_member ran as security definer, so the API treated it as unrestricted.
-- The view now runs as the caller and follows audit_log row security.
-- Reception may read rows. authenticated has no SELECT on the payload columns.
-- private.audit_log_member_payload redacts those columns for the view.

create or replace function private.audit_log_member_payload(p_id uuid)
returns table (
  old_data jsonb,
  new_data jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table text;
  v_old jsonb;
  v_new jsonb;
  v_clinic uuid;
begin
  select
    log.table_name,
    log.old_data,
    log.new_data,
    log.clinic_id
  into v_table, v_old, v_new, v_clinic
  from public.audit_log as log
  where log.id = p_id;

  old_data := null;
  new_data := null;

  if not found
    or v_clinic is distinct from public.current_clinic_id()
    or not (public.is_owner() or public.is_dentist() or public.is_reception())
  then
    return next;
    return;
  end if;

  if public.is_owner() or public.is_dentist() then
    old_data := v_old;
    new_data := v_new;
  elsif v_table in ('patients', 'patient_contacts', 'appointments') then
    old_data := v_old - 'jmbg';
    new_data := v_new - 'jmbg';
  end if;

  return next;
end;
$$;

comment on function private.audit_log_member_payload(uuid) is
  'Redacted audit payloads for one row in the caller clinic. Owners and dentists get the full jsonb. Reception gets patients, contacts, and appointments without jmbg. Anyone else, and every other table, gets null.';

revoke all on function private.audit_log_member_payload(uuid)
  from public, anon, authenticated, service_role;

grant execute on function private.audit_log_member_payload(uuid)
  to authenticated, service_role;

create or replace view public.audit_log_for_member as
select
  log.id,
  log.clinic_id,
  log.table_name,
  log.record_id,
  log.action,
  payload.old_data,
  payload.new_data,
  log.actor_user_id,
  log.created_at
from public.audit_log as log
cross join lateral private.audit_log_member_payload(log.id) as payload
where log.clinic_id = public.current_clinic_id()
  and (public.is_owner() or public.is_dentist() or public.is_reception());

alter view public.audit_log_for_member
  set (security_barrier = true, security_invoker = true);

comment on view public.audit_log_for_member is
  'Member trail for the current clinic. security_invoker so audit_log row security applies. Reception reads appointments, contacts, and patients without jmbg. Anamnesis, alerts, teeth, visits, and files keep their payloads hidden from reception.';

revoke all on table public.audit_log_for_member from public, anon;

grant select on table public.audit_log_for_member to authenticated;
grant select on table public.audit_log_for_member to service_role;

revoke select on table public.audit_log from authenticated;

grant select (
  id,
  clinic_id,
  table_name,
  record_id,
  action,
  actor_user_id,
  created_at
) on table public.audit_log to authenticated;

alter policy audit_log_select
  on public.audit_log
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist() or public.is_reception())
  );

comment on policy audit_log_select on public.audit_log is
  'Members of the current clinic may read audit metadata. Payload columns are not granted; audit_log_for_member redacts them.';

comment on column public.audit_log.old_data is
  'Previous row as jsonb. authenticated has no SELECT. Members read the redacted value from audit_log_for_member.';

comment on column public.audit_log.new_data is
  'New row as jsonb. authenticated has no SELECT. Members read the redacted value from audit_log_for_member.';

notify pgrst, 'reload schema';
