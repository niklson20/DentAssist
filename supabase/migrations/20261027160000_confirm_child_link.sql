-- Child link confirmation (2.D12).
-- An unconfirmed invite never returns the child name.
-- confirm_child_link adds the child to the account, then returns the name.
-- Parent email stays on the contact. This migration does not write patients.email.
-- Reception cannot read or create these invites. authenticated cannot update them,
-- so confirmed_at is set only inside confirm_child_link.
-- Both functions are security definer, search_path = public, authenticated only.

create or replace function public.preview_child_link(p_slug text, p_token_hash text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite_email text;
  v_expires timestamptz;
  v_confirmed timestamptz;
  v_clinic_slug text;
begin
  if auth.uid() is null
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_slug is null
    or char_length(btrim(p_slug)) = 0
    or char_length(btrim(p_slug)) > 80
  then
    return 'missing';
  end if;

  select account.email
  into v_email
  from public.patient_accounts as account
  where account.user_id = auth.uid();

  if not found then
    return 'missing';
  end if;

  select invite.email, invite.expires_at, invite.confirmed_at, clinic.slug
  into v_invite_email, v_expires, v_confirmed, v_clinic_slug
  from public.patient_link_invites as invite
  join public.clinics as clinic on clinic.id = invite.clinic_id
  where invite.token_hash = p_token_hash;

  if not found or v_clinic_slug is distinct from lower(btrim(p_slug)) then
    return 'missing';
  end if;

  if lower(v_invite_email) is distinct from lower(v_email) then
    return 'mismatch';
  end if;

  if v_confirmed is not null then
    return 'used';
  end if;

  if v_expires <= now() then
    return 'expired';
  end if;

  return 'open';
end;
$$;

comment on function public.preview_child_link(text, text) is
  'Status of a child-chart invite for the signed-in patient. A status word only: the child name is not selected.';

create or replace function public.confirm_child_link(p_slug text, p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_account public.patient_accounts%rowtype;
  v_invite public.patient_link_invites%rowtype;
  v_patient public.patients%rowtype;
  v_clinic_slug text;
  v_relationship text;
  v_dependent_id uuid;
  v_first text;
  v_last text;
  v_birth date;
  v_link_id uuid;
  v_link_account uuid;
  v_link_dependent uuid;
  v_link_confirmed timestamptz;
begin
  if auth.uid() is null
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_slug is null
    or char_length(btrim(p_slug)) = 0
    or char_length(btrim(p_slug)) > 80
  then
    return jsonb_build_object('status', 'missing');
  end if;

  select *
  into v_account
  from public.patient_accounts as account
  where account.user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  select *
  into v_invite
  from public.patient_link_invites as invite
  where invite.token_hash = p_token_hash
  for update;

  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  select clinic.slug
  into v_clinic_slug
  from public.clinics as clinic
  where clinic.id = v_invite.clinic_id;

  if v_clinic_slug is distinct from lower(btrim(p_slug)) then
    return jsonb_build_object('status', 'missing');
  end if;

  if lower(v_invite.email) is distinct from lower(v_account.email) then
    return jsonb_build_object('status', 'mismatch');
  end if;

  if v_invite.confirmed_at is not null then
    return jsonb_build_object('status', 'used');
  end if;

  if v_invite.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  select *
  into v_patient
  from public.patients as patient
  where patient.id = v_invite.patient_id
    and patient.clinic_id = v_invite.clinic_id
  for update;

  if not found then
    return jsonb_build_object('status', 'incomplete');
  end if;

  if v_patient.merged_into_id is not null or v_patient.date_of_birth is null then
    return jsonb_build_object('status', 'incomplete');
  end if;

  select link.id, link.account_id, link.dependent_id, link.confirmed_at
  into v_link_id, v_link_account, v_link_dependent, v_link_confirmed
  from public.patient_chart_links as link
  where link.clinic_id = v_patient.clinic_id
    and link.patient_id = v_patient.id
  for update;

  if v_link_id is not null then
    if v_link_account is distinct from v_account.id or v_link_dependent is null then
      return jsonb_build_object('status', 'incomplete');
    end if;

    select
      dependent.id,
      dependent.first_name,
      dependent.last_name,
      dependent.date_of_birth,
      dependent.relationship
    into v_dependent_id, v_first, v_last, v_birth, v_relationship
    from public.patient_dependents as dependent
    where dependent.id = v_link_dependent
      and dependent.account_id = v_account.id;

    if not found then
      return jsonb_build_object('status', 'incomplete');
    end if;

    if lower(btrim(v_first)) is distinct from lower(btrim(v_patient.first_name))
      or lower(btrim(v_last)) is distinct from lower(btrim(v_patient.last_name))
      or v_birth is distinct from v_patient.date_of_birth
    then
      return jsonb_build_object('status', 'incomplete');
    end if;
  else
    select
      dependent.id,
      dependent.first_name,
      dependent.last_name,
      dependent.date_of_birth,
      dependent.relationship
    into v_dependent_id, v_first, v_last, v_birth, v_relationship
    from public.patient_dependents as dependent
    where dependent.account_id = v_account.id
      and lower(btrim(dependent.first_name)) = lower(btrim(v_patient.first_name))
      and lower(btrim(dependent.last_name)) = lower(btrim(v_patient.last_name))
      and dependent.date_of_birth = v_patient.date_of_birth
    order by dependent.created_at, dependent.id
    limit 1;

    if not found then
      select contact.relationship
      into v_relationship
      from public.patient_contacts as contact
      where contact.patient_id = v_patient.id
        and contact.clinic_id = v_patient.clinic_id
        and contact.email is not null
        and lower(btrim(contact.email)) = lower(v_invite.email)
      order by contact.confirmed_at desc nulls last, contact.id
      limit 1;

      if not found then
        return jsonb_build_object('status', 'incomplete');
      end if;

      insert into public.patient_dependents (
        account_id,
        first_name,
        last_name,
        date_of_birth,
        relationship
      ) values (
        v_account.id,
        v_patient.first_name,
        v_patient.last_name,
        v_patient.date_of_birth,
        v_relationship
      )
      returning id, first_name, last_name, date_of_birth
      into v_dependent_id, v_first, v_last, v_birth;
    end if;

    insert into public.patient_chart_links (
      clinic_id,
      patient_id,
      account_id,
      dependent_id,
      confirmed_at
    ) values (
      v_patient.clinic_id,
      v_patient.id,
      v_account.id,
      v_dependent_id,
      now()
    );
  end if;

  if v_link_id is not null and v_link_confirmed is null then
    update public.patient_chart_links
    set confirmed_at = now()
    where id = v_link_id;
  end if;

  update public.patient_link_invites
  set confirmed_at = now()
  where id = v_invite.id;

  return jsonb_build_object(
    'status', 'ok',
    'first_name', v_first,
    'last_name', v_last,
    'date_of_birth', v_birth,
    'relationship', v_relationship
  );
end;
$$;

comment on function public.confirm_child_link(text, text) is
  'Confirms a child-chart invite. Adds the child to the account, then returns the name. Other statuses return no name.';

revoke all on function public.preview_child_link(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_child_link(text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.preview_child_link(text, text) to authenticated;
grant execute on function public.confirm_child_link(text, text) to authenticated;

revoke update on table public.patient_link_invites from authenticated;
grant delete on table public.patient_link_invites to authenticated;

create policy patient_link_invites_clinical
  on public.patient_link_invites
  as restrictive
  for all
  to authenticated
  using (public.is_owner() or public.is_dentist())
  with check (public.is_owner() or public.is_dentist());

comment on policy patient_link_invites_clinical on public.patient_link_invites is
  'Only an owner or dentist of that clinic may read, create, or delete a parent link. Reception cannot.';

notify pgrst, 'reload schema';
