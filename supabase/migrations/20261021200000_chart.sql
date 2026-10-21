-- Chart records (1.4): current tooth state, tooth history, patient files,
-- and the clinic audit log.
-- anon has no SELECT. Reception does not read teeth, files, or clinical
-- payloads. visit_id has no foreign key yet: visits arrive in a later migration.
-- Appointments, visits, and booking requests attach private.audit_row()
-- in the migration that creates them.

create or replace function private.tooth_surfaces_allowed(status text, surfaces jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when status in ('caries', 'filling') then
      surfaces is null
      or (
        jsonb_typeof(surfaces) = 'array'
        and jsonb_array_length(surfaces) between 1 and 5
        and not exists (
          select 1
          from jsonb_array_elements_text(surfaces) as surface(value)
          group by value
          having count(*) > 1
            or value not in (
              'occlusal',
              'lingual',
              'vestibular',
              'mesial',
              'distal'
            )
        )
      )
    else surfaces is null
  end;
$$;

create or replace function private.normalize_tooth_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized jsonb;
begin
  new.fdi_code = btrim(new.fdi_code);
  new.status = btrim(new.status);

  if new.surfaces is null or jsonb_typeof(new.surfaces) = 'null' then
    new.surfaces = null;
  elsif jsonb_typeof(new.surfaces) = 'array' then
    select jsonb_agg(to_jsonb(surface.value) order by surface.value)
    into normalized
    from (
      select distinct value
      from jsonb_array_elements_text(new.surfaces) as surface(value)
    ) as surface;

    if normalized is null or normalized = '[]'::jsonb then
      new.surfaces = null;
    else
      new.surfaces = normalized;
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.patient_id is distinct from old.patient_id
    or new.clinic_id is distinct from old.clinic_id
    or new.fdi_code is distinct from old.fdi_code
  ) then
    raise exception 'tooth identity is immutable';
  end if;

  return new;
end;
$$;

create or replace function private.record_tooth_state_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_id uuid;
begin
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

create or replace function private.protect_patient_file()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  extension text;
begin
  if tg_op = 'DELETE' then
    -- A direct delete locks after 24 hours. Cascade from the chart stays allowed.
    if pg_trigger_depth() = 1 and now() >= old.created_at + interval '24 hours' then
      raise exception 'patient file is locked';
    end if;
    return old;
  end if;

  new.title = btrim(new.title);
  new.category = btrim(new.category);
  new.mime_type = btrim(new.mime_type);

  extension = case new.mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'application/pdf' then 'pdf'
    else null
  end;

  if extension is null then
    raise exception 'patient file mime is not allowed';
  end if;

  if tg_op = 'INSERT' then
    new.created_at = now();
  end if;

  new.storage_path =
    new.clinic_id::text || '/' || new.patient_id::text || '/' || new.id::text || '.' || extension;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.patient_id is distinct from old.patient_id
    or new.clinic_id is distinct from old.clinic_id
    or new.mime_type is distinct from old.mime_type
    or new.size_bytes is distinct from old.size_bytes
    or new.storage_path is distinct from old.storage_path
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'patient file content is immutable';
  end if;

  if tg_op = 'UPDATE'
    and now() >= old.created_at + interval '24 hours'
    and (
      new.title is distinct from old.title
      or new.category is distinct from old.category
      or new.captured_on is distinct from old.captured_on
    )
  then
    raise exception 'patient file is locked';
  end if;

  return new;
end;
$$;

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_old jsonb;
  payload_new jsonb;
  source jsonb;
  row_clinic uuid;
  row_id uuid;
begin
  if tg_op = 'DELETE' then
    payload_old = to_jsonb(old);
    payload_new = null;
    source = payload_old;
  elsif tg_op = 'UPDATE' then
    payload_old = to_jsonb(old);
    payload_new = to_jsonb(new);
    source = payload_new;
  else
    payload_old = null;
    payload_new = to_jsonb(new);
    source = payload_new;
  end if;

  row_clinic = nullif(source ->> 'clinic_id', '')::uuid;
  row_id = nullif(source ->> 'id', '')::uuid;
  if row_id is null then
    row_id = nullif(source ->> 'patient_id', '')::uuid;
  end if;

  if row_clinic is null or row_id is null then
    raise exception 'audit row requires clinic_id and id';
  end if;

  if tg_op = 'UPDATE' and payload_old = payload_new then
    return new;
  end if;

  insert into public.audit_log (
    clinic_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    actor_user_id
  ) values (
    row_clinic,
    tg_table_name,
    row_id,
    lower(tg_op),
    payload_old,
    payload_new,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create table public.tooth_states (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  clinic_id uuid not null,
  fdi_code text not null,
  status text not null,
  surfaces jsonb,
  constraint tooth_states_id_clinic_key unique (id, clinic_id),
  constraint tooth_states_patient_fdi_key unique (patient_id, fdi_code),
  constraint tooth_states_patient_clinic_fkey
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade,
  constraint tooth_states_fdi_check check (
    fdi_code ~ '^[1-4][1-8]$'
    or fdi_code ~ '^[5-8][1-5]$'
  ),
  constraint tooth_states_status_check check (
    status in (
      'healthy',
      'unerupted',
      'caries',
      'filling',
      'crown',
      'root_canal',
      'missing',
      'implant',
      'to_extract',
      'fracture'
    )
  ),
  constraint tooth_states_surfaces_check check (
    private.tooth_surfaces_allowed(status, surfaces)
  )
);

comment on table public.tooth_states is
  'Current state of one FDI tooth on a chart. History is written by a trigger.';
comment on column public.tooth_states.fdi_code is
  'Permanent 11-18, 21-28, 31-38, 41-48 or primary 51-55, 61-65, 71-75, 81-85.';
comment on column public.tooth_states.surfaces is
  'Null, or a set of occlusal, lingual, vestibular, mesial, distal. Only for caries and filling.';

create index tooth_states_clinic_patient_idx
  on public.tooth_states (clinic_id, patient_id);

create table public.tooth_state_changes (
  id uuid primary key default gen_random_uuid(),
  tooth_state_id uuid not null,
  clinic_id uuid not null,
  old_status text,
  new_status text not null,
  old_surfaces jsonb,
  new_surfaces jsonb,
  visit_id uuid,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  constraint tooth_state_changes_tooth_clinic_fkey
    foreign key (tooth_state_id, clinic_id)
    references public.tooth_states (id, clinic_id)
    on delete cascade,
  constraint tooth_state_changes_changed_by_fkey
    foreign key (changed_by)
    references public.clinic_members (id)
    on delete set null,
  constraint tooth_state_changes_old_status_check check (
    old_status is null
    or old_status in (
      'healthy',
      'unerupted',
      'caries',
      'filling',
      'crown',
      'root_canal',
      'missing',
      'implant',
      'to_extract',
      'fracture'
    )
  ),
  constraint tooth_state_changes_new_status_check check (
    new_status in (
      'healthy',
      'unerupted',
      'caries',
      'filling',
      'crown',
      'root_canal',
      'missing',
      'implant',
      'to_extract',
      'fracture'
    )
  ),
  constraint tooth_state_changes_old_surfaces_check check (
    (old_status is null and old_surfaces is null)
    or (
      old_status is not null
      and private.tooth_surfaces_allowed(old_status, old_surfaces)
    )
  ),
  constraint tooth_state_changes_new_surfaces_check check (
    private.tooth_surfaces_allowed(new_status, new_surfaces)
  )
);

comment on table public.tooth_state_changes is
  'Append-only tooth history. The application does not insert these rows.';
comment on column public.tooth_state_changes.visit_id is
  'Visit this change belongs to. The foreign key is added with the visits table.';
comment on column public.tooth_state_changes.changed_by is
  'Clinic member signed in when the tooth state changed. Null when there is no session.';

create index tooth_state_changes_tooth_idx
  on public.tooth_state_changes (tooth_state_id, changed_at);

create index tooth_state_changes_clinic_idx
  on public.tooth_state_changes (clinic_id);

create table public.patient_files (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  clinic_id uuid not null,
  title text not null,
  category text not null,
  captured_on date,
  storage_path text not null,
  mime_type text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now(),
  constraint patient_files_patient_clinic_fkey
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade,
  constraint patient_files_title_check check (char_length(btrim(title)) > 0),
  constraint patient_files_category_check check (
    category in ('xray', 'photo', 'report', 'other')
  ),
  constraint patient_files_mime_check check (
    mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    )
  ),
  constraint patient_files_size_check check (
    size_bytes > 0
    and size_bytes <= 10485760
  ),
  constraint patient_files_path_check check (
    storage_path = clinic_id::text || '/' || patient_id::text || '/' || id::text || '.' ||
      case mime_type
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        when 'image/webp' then 'webp'
        when 'application/pdf' then 'pdf'
      end
  )
);

comment on table public.patient_files is
  'File metadata for one chart. Title, category, and capture date lock 24 hours after created_at. Content never changes.';
comment on column public.patient_files.captured_on is
  'Date the image or document was taken. Null when the clinic has not recorded it.';
comment on column public.patient_files.storage_path is
  'Object key {clinic_id}/{patient_id}/{file_id}.{ext}. JPEG uses jpg.';
comment on column public.patient_files.size_bytes is
  'At most 10 MB (10485760 bytes).';

create index patient_files_clinic_patient_idx
  on public.patient_files (clinic_id, patient_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint audit_log_action_check check (action in ('insert', 'update', 'delete')),
  constraint audit_log_table_name_check check (char_length(btrim(table_name)) > 0)
);

comment on table public.audit_log is
  'Append-only clinic trail. Members read audit_log_for_member, which redacts clinical payloads for reception.';
comment on column public.audit_log.record_id is
  'Row id, or patient_id when the source table has no id.';
comment on column public.audit_log.actor_user_id is
  'auth.uid() at the time of the change. Null when there is no session.';

create index audit_log_clinic_created_idx
  on public.audit_log (clinic_id, created_at);

create index audit_log_record_idx
  on public.audit_log (clinic_id, table_name, record_id);

create trigger tooth_states_normalize
  before insert or update on public.tooth_states
  for each row
  execute function private.normalize_tooth_state();

create trigger tooth_states_record_change
  after insert or update on public.tooth_states
  for each row
  execute function private.record_tooth_state_change();

create trigger tooth_states_audit
  after insert or update or delete on public.tooth_states
  for each row
  execute function private.audit_row();

create trigger patient_files_protect
  before insert or update or delete on public.patient_files
  for each row
  execute function private.protect_patient_file();

create trigger patient_files_audit
  after insert or update or delete on public.patient_files
  for each row
  execute function private.audit_row();

create trigger patients_audit
  after insert or update or delete on public.patients
  for each row
  execute function private.audit_row();

create trigger patient_contacts_audit
  after insert or update or delete on public.patient_contacts
  for each row
  execute function private.audit_row();

create trigger patient_anamnesis_audit
  after insert or update or delete on public.patient_anamnesis
  for each row
  execute function private.audit_row();

create trigger patient_alerts_audit
  after insert or update or delete on public.patient_alerts
  for each row
  execute function private.audit_row();

create view public.audit_log_for_member
with (security_barrier = true, security_invoker = false) as
select
  id,
  clinic_id,
  table_name,
  record_id,
  action,
  case
    when public.is_owner() or public.is_dentist() then old_data
    when public.is_reception()
      and table_name in ('patients', 'patient_contacts', 'appointments')
      then old_data - 'jmbg'
    else null
  end as old_data,
  case
    when public.is_owner() or public.is_dentist() then new_data
    when public.is_reception()
      and table_name in ('patients', 'patient_contacts', 'appointments')
      then new_data - 'jmbg'
    else null
  end as new_data,
  actor_user_id,
  created_at
from public.audit_log
where clinic_id = public.current_clinic_id()
  and (public.is_owner() or public.is_dentist() or public.is_reception());

comment on view public.audit_log_for_member is
  'Member trail for the current clinic. Reception reads appointments, contacts, and patients without jmbg. Anamnesis, alerts, teeth, visits, and files keep their payloads hidden from reception.';

revoke all on table
  public.tooth_states,
  public.tooth_state_changes,
  public.patient_files,
  public.audit_log,
  public.audit_log_for_member
from public, anon, authenticated;

grant select, insert, update, delete on table public.tooth_states to authenticated;

grant select on table public.tooth_state_changes to authenticated;

grant select, insert, update, delete on table public.patient_files to authenticated;

grant select on table public.audit_log to authenticated;

grant select on table public.audit_log_for_member to authenticated;

grant select, insert, update, delete on table
  public.tooth_states,
  public.tooth_state_changes,
  public.patient_files,
  public.audit_log,
  public.audit_log_for_member
to service_role;

alter table public.tooth_states enable row level security;
alter table public.tooth_state_changes enable row level security;
alter table public.patient_files enable row level security;
alter table public.audit_log enable row level security;

create policy tooth_states_clinical
  on public.tooth_states
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

create policy tooth_state_changes_select
  on public.tooth_state_changes
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  );

create policy patient_files_clinical
  on public.patient_files
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

create policy audit_log_select
  on public.audit_log
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (public.is_owner() or public.is_dentist())
  );

revoke all on function
  private.tooth_surfaces_allowed(text, jsonb),
  private.normalize_tooth_state(),
  private.record_tooth_state_change(),
  private.protect_patient_file(),
  private.audit_row()
from public, anon;

grant execute on function
  private.tooth_surfaces_allowed(text, jsonb),
  private.normalize_tooth_state(),
  private.record_tooth_state_change(),
  private.protect_patient_file(),
  private.audit_row()
to authenticated, service_role;
