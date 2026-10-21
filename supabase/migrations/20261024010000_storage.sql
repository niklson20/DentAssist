-- Storage buckets and policies (1.11).
-- patient-files is private. A signed URL needs SELECT, which only the owner
-- and dentist of that clinic have, and only for {clinic_id}/{patient_id}/{file_id}.{ext}.
-- Reception has no policy on patient-files.
-- clinic-logos is public to read. Only the owner may write {clinic_id}/logo.{ext}.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'patient-files',
    'patient-files',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
  ),
  (
    'clinic-logos',
    'clinic-logos',
    true,
    1048576,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  );

create or replace function private.patient_file_object_allowed(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    object_name is not null
    and (public.is_owner() or public.is_dentist())
    and (storage.foldername(object_name))[1] = public.current_clinic_id()::text
    and coalesce(array_length(storage.foldername(object_name), 1), 0) = 2
    and (storage.foldername(object_name))[2]
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and storage.filename(object_name)
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$',
    false
  );
$$;

create or replace function private.clinic_logo_object_allowed(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    public.is_owner()
    and object_name in (
      public.current_clinic_id()::text || '/logo.jpg',
      public.current_clinic_id()::text || '/logo.png',
      public.current_clinic_id()::text || '/logo.webp'
    ),
    false
  );
$$;

comment on function private.patient_file_object_allowed(text) is
  'True for an owner or dentist, and only for a chart object under their clinic_id. Reception never matches.';
comment on function private.clinic_logo_object_allowed(text) is
  'True for the owner, and only for {clinic_id}/logo.jpg, logo.png, or logo.webp.';

revoke all on function
  private.patient_file_object_allowed(text),
  private.clinic_logo_object_allowed(text)
from public, anon;

grant execute on function
  private.patient_file_object_allowed(text),
  private.clinic_logo_object_allowed(text)
to authenticated, service_role;

create policy patient_files_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'patient-files'
    and private.patient_file_object_allowed(name)
  );

create policy patient_files_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'patient-files'
    and private.patient_file_object_allowed(name)
  );

create policy patient_files_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'patient-files'
    and private.patient_file_object_allowed(name)
  )
  with check (
    bucket_id = 'patient-files'
    and private.patient_file_object_allowed(name)
  );

create policy patient_files_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'patient-files'
    and private.patient_file_object_allowed(name)
  );

create policy clinic_logos_select
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'clinic-logos');

create policy clinic_logos_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'clinic-logos'
    and private.clinic_logo_object_allowed(name)
  );

create policy clinic_logos_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'clinic-logos'
    and private.clinic_logo_object_allowed(name)
  )
  with check (
    bucket_id = 'clinic-logos'
    and private.clinic_logo_object_allowed(name)
  );

create policy clinic_logos_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'clinic-logos'
    and private.clinic_logo_object_allowed(name)
  );
