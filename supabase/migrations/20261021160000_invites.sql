-- Invites (1.2): clinic invites, staff invites, and clinic access requests.
-- Raw tokens and raw codes are not stored. anon has no SELECT.

create or replace function private.lock_clinic_email(target_email text)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('clinic-email:' || lower(btrim(target_email)), 0)
  );
end;
$$;

create or replace function private.normalize_clinic_invite()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email = btrim(new.email);
  perform private.lock_clinic_email(new.email);
  return new;
end;
$$;

create or replace function private.assert_staff_invite_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email = btrim(new.email);
  new.first_name = btrim(new.first_name);
  new.last_name = btrim(new.last_name);

  if tg_op = 'UPDATE' and new.clinic_id is distinct from old.clinic_id then
    raise exception 'staff invite clinic is immutable';
  end if;

  if tg_op = 'INSERT' or new.created_by is distinct from old.created_by then
    if not exists (
      select 1
      from public.clinic_members as member
      where member.id = new.created_by
        and member.clinic_id = new.clinic_id
        and member.role = 'owner'
    ) then
      raise exception 'staff invite must be created by the owner of that clinic';
    end if;
  end if;

  return new;
end;
$$;

-- Security definer so the open-invite check sees rows the caller cannot select.
create or replace function private.guard_clinic_access_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email = btrim(new.email);
  new.city = btrim(new.city);
  perform private.lock_clinic_email(new.email);

  if tg_op = 'INSERT' or new.status = 'pending' then
    if exists (
      select 1
      from public.clinic_invites as invite
      where lower(invite.email) = lower(new.email)
        and invite.used_at is null
        and invite.expires_at > now()
        and invite.attempt_count < 5
    ) then
      raise exception 'an unused clinic invite already exists for this email';
    end if;
  end if;

  return new;
end;
$$;

create table public.clinic_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null,
  code_hash text not null,
  attempt_count integer not null default 0,
  send_count integer not null default 0,
  last_sent_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  clinic_id uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint clinic_invites_token_hash_key unique (token_hash),
  constraint clinic_invites_email_check check (char_length(btrim(email)) > 0),
  constraint clinic_invites_token_hash_hmac check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint clinic_invites_code_hash_argon2id check (
    code_hash ~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/_-]+={0,2}\$[A-Za-z0-9+/_-]+={0,2}$'
    and char_length(code_hash) <= 300
  ),
  constraint clinic_invites_attempt_count_check check (attempt_count between 0 and 5),
  constraint clinic_invites_send_count_check check (send_count >= 0),
  constraint clinic_invites_used_clinic_check check (
    (
      used_at is null
      and clinic_id is null
    )
    or (
      used_at is not null
      and clinic_id is not null
    )
  ),
  constraint clinic_invites_clinic_id_fkey
    foreign key (clinic_id) references public.clinics (id) on delete cascade,
  constraint clinic_invites_created_by_fkey
    foreign key (created_by) references public.platform_admins (user_id) on delete restrict
);

comment on table public.clinic_invites is
  'Platform invite for a new clinic. Raw token and raw code are not stored.';
comment on column public.clinic_invites.token_hash is
  'Lowercase hex HMAC-SHA-256 of the link token. Hidden from authenticated SELECT.';
comment on column public.clinic_invites.code_hash is
  'Argon2id hash of the 6-digit code. Hidden from authenticated SELECT.';
comment on column public.clinic_invites.attempt_count is
  'Wrong code attempts. Five disables the invite.';
comment on column public.clinic_invites.send_count is
  'How many times the invite was sent. Resend rate is enforced by the application.';
comment on column public.clinic_invites.expires_at is
  'Invite deadline. Default is 7 days from insert.';
comment on column public.clinic_invites.clinic_id is
  'Null until the invite is used.';
comment on column public.clinic_invites.created_by is
  'Platform admin who created the invite.';

create index clinic_invites_email_idx on public.clinic_invites (lower(email));
create index clinic_invites_clinic_id_idx on public.clinic_invites (clinic_id);
create index clinic_invites_created_by_idx on public.clinic_invites (created_by);

create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  email text not null,
  role text not null,
  first_name text not null,
  last_name text not null,
  token_hash text not null,
  code_hash text not null,
  attempt_count integer not null default 0,
  send_count integer not null default 0,
  last_sent_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint staff_invites_token_hash_key unique (token_hash),
  constraint staff_invites_email_check check (char_length(btrim(email)) > 0),
  constraint staff_invites_role_check check (role in ('dentist', 'reception')),
  constraint staff_invites_names_check check (
    char_length(btrim(first_name)) > 0
    and char_length(btrim(last_name)) > 0
  ),
  constraint staff_invites_token_hash_hmac check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint staff_invites_code_hash_argon2id check (
    code_hash ~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/_-]+={0,2}\$[A-Za-z0-9+/_-]+={0,2}$'
    and char_length(code_hash) <= 300
  ),
  constraint staff_invites_attempt_count_check check (attempt_count between 0 and 5),
  constraint staff_invites_send_count_check check (send_count >= 0),
  constraint staff_invites_clinic_id_fkey
    foreign key (clinic_id) references public.clinics (id) on delete cascade,
  constraint staff_invites_created_by_fkey
    foreign key (created_by) references public.clinic_members (id) on delete cascade
);

comment on table public.staff_invites is
  'Owner invite for a dentist or receptionist. Raw token and raw code are not stored.';
comment on column public.staff_invites.token_hash is
  'Lowercase hex HMAC-SHA-256 of the link token. Hidden from authenticated SELECT.';
comment on column public.staff_invites.code_hash is
  'Argon2id hash of the 6-digit code. Hidden from authenticated SELECT.';
comment on column public.staff_invites.attempt_count is
  'Wrong code attempts. Five disables the invite.';
comment on column public.staff_invites.send_count is
  'How many times the invite was sent. Resend rate is enforced by the application.';
comment on column public.staff_invites.expires_at is
  'Invite deadline. Default is 7 days from insert.';
comment on column public.staff_invites.role is
  'dentist or reception. Owner is not invited through this table.';

create index staff_invites_clinic_id_idx on public.staff_invites (clinic_id);
create index staff_invites_created_by_idx on public.staff_invites (created_by);
create index staff_invites_email_idx on public.staff_invites (clinic_id, lower(email));

create table public.clinic_access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  city text not null,
  status text not null default 'pending',
  clinic_invite_id uuid,
  dismissed_at timestamptz,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_access_requests_email_check check (char_length(btrim(email)) > 0),
  constraint clinic_access_requests_city_check check (char_length(btrim(city)) > 0),
  constraint clinic_access_requests_status_check check (
    status in ('pending', 'invited', 'dismissed')
  ),
  constraint clinic_access_requests_ip_hash_hmac check (ip_hash ~ '^[0-9a-f]{64}$'),
  constraint clinic_access_requests_dismissed_check check (
    (
      status = 'dismissed'
      and dismissed_at is not null
    )
    or (
      status <> 'dismissed'
      and dismissed_at is null
    )
  ),
  constraint clinic_access_requests_invite_link_check check (
    (
      status = 'invited'
      and clinic_invite_id is not null
    )
    or (
      status <> 'invited'
      and clinic_invite_id is null
    )
  ),
  constraint clinic_access_requests_clinic_invite_id_fkey
    foreign key (clinic_invite_id)
    references public.clinic_invites (id)
    on delete restrict
);

comment on table public.clinic_access_requests is
  'Request from /za-ordinacije before a clinic exists. Only the platform reads and changes it.';
comment on column public.clinic_access_requests.city is
  'Typed city. Not a foreign key.';
comment on column public.clinic_access_requests.clinic_invite_id is
  'Set when the platform sends a clinic invite.';
comment on column public.clinic_access_requests.ip_hash is
  'Lowercase hex HMAC-SHA-256 of the client address. The raw address is not stored.';

create unique index clinic_access_requests_pending_email_key
  on public.clinic_access_requests (lower(email))
  where status = 'pending';

create index clinic_access_requests_clinic_invite_id_idx
  on public.clinic_access_requests (clinic_invite_id);

create trigger clinic_invites_normalize
  before insert or update on public.clinic_invites
  for each row
  execute function private.normalize_clinic_invite();

create trigger staff_invites_owner
  before insert or update on public.staff_invites
  for each row
  execute function private.assert_staff_invite_owner();

create trigger clinic_access_requests_guard
  before insert or update on public.clinic_access_requests
  for each row
  execute function private.guard_clinic_access_request();

create trigger clinic_access_requests_set_updated_at
  before update on public.clinic_access_requests
  for each row
  execute function private.set_updated_at();

revoke all on table
  public.clinic_invites,
  public.staff_invites,
  public.clinic_access_requests
from public, anon, authenticated;

grant select (
  id, email, attempt_count, send_count, last_sent_at, expires_at,
  used_at, clinic_id, created_by, created_at
), insert, update on table public.clinic_invites to authenticated;

grant select (
  id, clinic_id, email, role, first_name, last_name,
  attempt_count, send_count, last_sent_at, expires_at,
  used_at, created_by, created_at
), insert, update on table public.staff_invites to authenticated;

grant select, insert, update on table public.clinic_access_requests to authenticated;

grant select, insert, update, delete on table
  public.clinic_invites,
  public.staff_invites,
  public.clinic_access_requests
to service_role;

alter table public.clinic_invites enable row level security;
alter table public.staff_invites enable row level security;
alter table public.clinic_access_requests enable row level security;

create policy clinic_invites_select
  on public.clinic_invites
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or (
      clinic_id = public.current_clinic_id()
      and public.is_owner()
    )
  );

create policy clinic_invites_insert
  on public.clinic_invites
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy clinic_invites_update
  on public.clinic_invites
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy staff_invites_select
  on public.staff_invites
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or (
      clinic_id = public.current_clinic_id()
      and public.is_owner()
    )
  );

create policy staff_invites_insert
  on public.staff_invites
  for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or (
      clinic_id = public.current_clinic_id()
      and public.is_owner()
    )
  );

create policy staff_invites_update
  on public.staff_invites
  for update
  to authenticated
  using (
    public.is_platform_admin()
    or (
      clinic_id = public.current_clinic_id()
      and public.is_owner()
    )
  )
  with check (
    public.is_platform_admin()
    or (
      clinic_id = public.current_clinic_id()
      and public.is_owner()
    )
  );

create policy clinic_access_requests_select
  on public.clinic_access_requests
  for select
  to authenticated
  using (public.is_platform_admin());

create policy clinic_access_requests_insert
  on public.clinic_access_requests
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy clinic_access_requests_update
  on public.clinic_access_requests
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on function
  private.lock_clinic_email(text),
  private.normalize_clinic_invite(),
  private.assert_staff_invite_owner(),
  private.guard_clinic_access_request()
from public, anon;

grant execute on function
  private.lock_clinic_email(text),
  private.normalize_clinic_invite(),
  private.assert_staff_invite_owner(),
  private.guard_clinic_access_request()
to authenticated, service_role;
