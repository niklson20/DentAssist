-- Patient accounts (1.12): accounts, dependents, chart links, link invites,
-- and registration email challenges.
-- An account is not a clinic member and has no clinic_id.
-- anon has no SELECT. Raw link tokens and raw email codes are not stored.

create or replace function private.normalize_patient_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.first_name = btrim(new.first_name);
  new.last_name = btrim(new.last_name);
  new.email = btrim(new.email);

  if new.phone is not null then
    new.phone = nullif(btrim(new.phone), '');
  end if;

  return new;
end;
$$;

create or replace function private.protect_patient_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'patient account user is immutable';
  end if;

  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' and lower(new.email) is distinct from lower(old.email) then
      new.email_confirmed_at = null;
    elsif tg_op = 'INSERT' and new.email_confirmed_at is not null then
      raise exception 'email confirmation is set only after the code passes';
    elsif tg_op = 'UPDATE'
      and new.email_confirmed_at is distinct from old.email_confirmed_at
    then
      raise exception 'email confirmation is set only after the code passes';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.normalize_patient_dependent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.relationship = btrim(new.relationship);
  new.first_name = btrim(new.first_name);
  new.last_name = btrim(new.last_name);

  if tg_op = 'UPDATE' and new.account_id is distinct from old.account_id then
    raise exception 'patient dependent account is immutable';
  end if;

  return new;
end;
$$;

create or replace function private.protect_patient_chart_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
    new.clinic_id is distinct from old.clinic_id
    or new.patient_id is distinct from old.patient_id
    or new.account_id is distinct from old.account_id
    or new.dependent_id is distinct from old.dependent_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'patient chart link identity is immutable';
  end if;

  return new;
end;
$$;

create or replace function private.normalize_patient_link_invite()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email = btrim(new.email);
  return new;
end;
$$;

create or replace function private.protect_patient_link_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
    new.clinic_id is distinct from old.clinic_id
    or new.patient_id is distinct from old.patient_id
    or new.email is distinct from old.email
    or new.token_hash is distinct from old.token_hash
    or new.expires_at is distinct from old.expires_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'patient link invite identity is immutable';
  end if;

  if tg_op = 'UPDATE'
    and old.confirmed_at is not null
    and new.confirmed_at is distinct from old.confirmed_at
  then
    raise exception 'patient link invite confirmation is immutable';
  end if;

  if tg_op = 'INSERT' or new.created_by is distinct from old.created_by then
    if not exists (
      select 1
      from public.clinic_members as member
      where member.id = new.created_by
        and member.clinic_id = new.clinic_id
        and member.role in ('owner', 'dentist', 'reception')
    ) then
      raise exception 'patient link invite must be created by a member of that clinic';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.normalize_patient_email_challenge()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email = btrim(new.email);
  return new;
end;
$$;

create or replace function private.protect_patient_email_challenge()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
    new.email is distinct from old.email
    or new.code_hash is distinct from old.code_hash
    or new.ip_hash is distinct from old.ip_hash
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'email challenge identity is immutable';
  end if;

  if tg_op = 'UPDATE' and new.attempt_count < old.attempt_count then
    raise exception 'email challenge attempts cannot decrease';
  end if;

  if tg_op = 'UPDATE'
    and old.consumed_at is not null
    and new.consumed_at is distinct from old.consumed_at
  then
    raise exception 'email challenge consumption is immutable';
  end if;

  return new;
end;
$$;

create table public.patient_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  date_of_birth date,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_accounts_user_id_key unique (user_id),
  constraint patient_accounts_names_check check (
    char_length(btrim(first_name)) > 0
    and char_length(btrim(last_name)) > 0
  ),
  constraint patient_accounts_email_check check (char_length(btrim(email)) > 0)
);

comment on table public.patient_accounts is
  'Login account of a patient. Not a clinic member and has no clinic_id.';
comment on column public.patient_accounts.user_id is
  'One account per auth user.';
comment on column public.patient_accounts.email is
  'Unique ignoring case. This is the account email, not a chart email.';
comment on column public.patient_accounts.phone is
  'Null until the patient saves a phone for the first time.';
comment on column public.patient_accounts.date_of_birth is
  'Null until the patient saves a date of birth for the first time.';
comment on column public.patient_accounts.email_confirmed_at is
  'Null until the registration code passes. Authenticated users cannot set it.';

create unique index patient_accounts_email_key
  on public.patient_accounts (lower(email));

create table public.patient_dependents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.patient_accounts (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  relationship text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_dependents_id_account_key unique (id, account_id),
  constraint patient_dependents_names_check check (
    char_length(btrim(first_name)) > 0
    and char_length(btrim(last_name)) > 0
  ),
  constraint patient_dependents_relationship_check check (
    relationship in (
      'mother',
      'father',
      'guardian',
      'grandmother',
      'grandfather',
      'other_relative'
    )
  )
);

comment on table public.patient_dependents is
  'Child or other person booked by a patient account. relationship matches patient_contacts.';
comment on column public.patient_dependents.account_id is
  'Owning account. Updates are rejected.';

create index patient_dependents_account_id_idx
  on public.patient_dependents (account_id);

create table public.patient_chart_links (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  patient_id uuid not null,
  account_id uuid not null references public.patient_accounts (id) on delete cascade,
  dependent_id uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint patient_chart_links_clinic_patient_key unique (clinic_id, patient_id),
  constraint patient_chart_links_patient_clinic_fkey
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade,
  constraint patient_chart_links_dependent_account_fkey
    foreign key (dependent_id, account_id)
    references public.patient_dependents (id, account_id)
);

comment on table public.patient_chart_links is
  'Connects one clinic chart to a patient account. One chart has one link.';
comment on column public.patient_chart_links.dependent_id is
  'Null when the adult is linked in person. Otherwise a dependent of the same account.';
comment on column public.patient_chart_links.confirmed_at is
  'Null until the link is confirmed.';

create index patient_chart_links_account_id_idx
  on public.patient_chart_links (account_id);

create index patient_chart_links_dependent_id_idx
  on public.patient_chart_links (dependent_id)
  where dependent_id is not null;

create table public.patient_link_invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  patient_id uuid not null,
  email text not null,
  token_hash text not null,
  expires_at timestamptz not null default now() + interval '7 days',
  confirmed_at timestamptz,
  created_by uuid not null references public.clinic_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint patient_link_invites_token_hash_key unique (token_hash),
  constraint patient_link_invites_email_check check (char_length(btrim(email)) > 0),
  constraint patient_link_invites_token_hash_hmac check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint patient_link_invites_patient_clinic_fkey
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade
);

comment on table public.patient_link_invites is
  'Clinic invite that links a chart to the patient account for this email. The raw token is not stored.';
comment on column public.patient_link_invites.token_hash is
  'Lowercase hex HMAC-SHA-256 of the link token. Hidden from authenticated SELECT.';
comment on column public.patient_link_invites.expires_at is
  'Invite deadline. Default is 7 days from insert.';
comment on column public.patient_link_invites.confirmed_at is
  'Null until the invited person confirms.';
comment on column public.patient_link_invites.created_by is
  'Clinic member who created the invite.';

create index patient_link_invites_clinic_patient_idx
  on public.patient_link_invites (clinic_id, patient_id);

create index patient_link_invites_email_idx
  on public.patient_link_invites (lower(email));

create index patient_link_invites_created_by_idx
  on public.patient_link_invites (created_by);

create table public.patient_email_challenges (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  attempt_count integer not null default 0,
  ip_hash text not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint patient_email_challenges_email_check check (char_length(btrim(email)) > 0),
  constraint patient_email_challenges_code_hash_argon2id check (
    code_hash ~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/_-]+={0,2}\$[A-Za-z0-9+/_-]+={0,2}$'
    and char_length(code_hash) <= 300
  ),
  constraint patient_email_challenges_expires_check check (
    expires_at > created_at
    and expires_at <= created_at + interval '10 minutes'
  ),
  constraint patient_email_challenges_attempt_count_check check (attempt_count between 0 and 5),
  constraint patient_email_challenges_ip_hash_hmac check (ip_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.patient_email_challenges is
  'Registration email code, not a code for each appointment. Found by email, then the hash is checked. Five wrong attempts invalidate the row. anon has no SELECT.';
comment on column public.patient_email_challenges.code_hash is
  'Argon2id hash of the code. The raw code is not stored.';
comment on column public.patient_email_challenges.expires_at is
  'Code deadline. Default is 10 minutes from insert, and it cannot be later than that.';
comment on column public.patient_email_challenges.attempt_count is
  'Wrong code attempts. Five disables the challenge.';
comment on column public.patient_email_challenges.ip_hash is
  'Lowercase hex HMAC-SHA-256 of the client IP.';
comment on column public.patient_email_challenges.consumed_at is
  'Null until the code is accepted.';

create index patient_email_challenges_email_idx
  on public.patient_email_challenges (lower(email));

create trigger patient_accounts_normalize
  before insert or update on public.patient_accounts
  for each row
  execute function private.normalize_patient_account();

create trigger patient_accounts_protect
  before insert or update on public.patient_accounts
  for each row
  execute function private.protect_patient_account();

create trigger patient_accounts_set_updated_at
  before update on public.patient_accounts
  for each row
  execute function private.set_updated_at();

create trigger patient_dependents_normalize
  before insert or update on public.patient_dependents
  for each row
  execute function private.normalize_patient_dependent();

create trigger patient_dependents_set_updated_at
  before update on public.patient_dependents
  for each row
  execute function private.set_updated_at();

create trigger patient_chart_links_protect
  before update on public.patient_chart_links
  for each row
  execute function private.protect_patient_chart_link();

create trigger patient_link_invites_normalize
  before insert or update on public.patient_link_invites
  for each row
  execute function private.normalize_patient_link_invite();

create trigger patient_link_invites_protect
  before insert or update on public.patient_link_invites
  for each row
  execute function private.protect_patient_link_invite();

create trigger patient_email_challenges_normalize
  before insert or update on public.patient_email_challenges
  for each row
  execute function private.normalize_patient_email_challenge();

create trigger patient_email_challenges_protect
  before insert or update on public.patient_email_challenges
  for each row
  execute function private.protect_patient_email_challenge();

revoke all on table
  public.patient_accounts,
  public.patient_dependents,
  public.patient_chart_links,
  public.patient_link_invites,
  public.patient_email_challenges
from public, anon, authenticated;

grant select (
  id,
  user_id,
  first_name,
  last_name,
  email,
  phone,
  date_of_birth,
  email_confirmed_at,
  created_at,
  updated_at
), insert (
  id,
  user_id,
  first_name,
  last_name,
  email,
  phone,
  date_of_birth
), update (
  first_name,
  last_name,
  email,
  phone,
  date_of_birth
) on table public.patient_accounts to authenticated;

grant select, insert, update, delete on table public.patient_dependents to authenticated;

grant select, insert, update, delete on table public.patient_chart_links to authenticated;

grant select (
  id,
  clinic_id,
  patient_id,
  email,
  expires_at,
  confirmed_at,
  created_by,
  created_at
), insert, update on table public.patient_link_invites to authenticated;

grant select, insert, update, delete on table
  public.patient_accounts,
  public.patient_dependents,
  public.patient_chart_links,
  public.patient_link_invites,
  public.patient_email_challenges
to service_role;

alter table public.patient_accounts enable row level security;
alter table public.patient_dependents enable row level security;
alter table public.patient_chart_links enable row level security;
alter table public.patient_link_invites enable row level security;
alter table public.patient_email_challenges enable row level security;

create policy patient_accounts_self
  on public.patient_accounts
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy patient_dependents_self
  on public.patient_dependents
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.patient_accounts as account
      where account.id = patient_dependents.account_id
        and account.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.patient_accounts as account
      where account.id = patient_dependents.account_id
        and account.user_id = auth.uid()
    )
  );

create policy patient_chart_links_self_select
  on public.patient_chart_links
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.patient_accounts as account
      where account.id = patient_chart_links.account_id
        and account.user_id = auth.uid()
    )
  );

create policy patient_chart_links_self_update
  on public.patient_chart_links
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.patient_accounts as account
      where account.id = patient_chart_links.account_id
        and account.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.patient_accounts as account
      where account.id = patient_chart_links.account_id
        and account.user_id = auth.uid()
    )
  );

create policy patient_chart_links_staff
  on public.patient_chart_links
  for all
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (
      public.is_owner()
      or public.is_dentist()
      or public.is_reception()
    )
  )
  with check (
    clinic_id = public.current_clinic_id()
    and (
      public.is_owner()
      or public.is_dentist()
      or public.is_reception()
    )
  );

create policy patient_link_invites_staff
  on public.patient_link_invites
  for all
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and (
      public.is_owner()
      or public.is_dentist()
      or public.is_reception()
    )
  )
  with check (
    clinic_id = public.current_clinic_id()
    and (
      public.is_owner()
      or public.is_dentist()
      or public.is_reception()
    )
  );

revoke all on function
  private.normalize_patient_account(),
  private.protect_patient_account(),
  private.normalize_patient_dependent(),
  private.protect_patient_chart_link(),
  private.normalize_patient_link_invite(),
  private.protect_patient_link_invite(),
  private.normalize_patient_email_challenge(),
  private.protect_patient_email_challenge()
from public, anon;

grant execute on function
  private.normalize_patient_account(),
  private.protect_patient_account(),
  private.normalize_patient_dependent(),
  private.protect_patient_chart_link(),
  private.normalize_patient_link_invite(),
  private.protect_patient_link_invite(),
  private.normalize_patient_email_challenge(),
  private.protect_patient_email_challenge()
to authenticated, service_role;
