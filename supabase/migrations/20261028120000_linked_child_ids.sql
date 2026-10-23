-- Child chart links for booking (2.D6).
-- Dependent ids of the signed-in account that are linked to a chart in this clinic.
-- Another clinic's link is absent. No patient name or patient id is returned.

create or replace function public.linked_child_ids(slug text)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := lower(btrim(slug));
  v_account_id uuid;
begin
  if auth.uid() is null
    or v_slug is null
    or v_slug = ''
    or char_length(v_slug) > 200
    or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  then
    return array[]::uuid[];
  end if;

  select account.id
  into v_account_id
  from public.patient_accounts as account
  where account.user_id = auth.uid();

  if v_account_id is null then
    return array[]::uuid[];
  end if;

  return coalesce(
    (
      select array_agg(distinct link.dependent_id)
      from public.patient_chart_links as link
      join public.clinics as clinic
        on clinic.id = link.clinic_id
      where link.account_id = v_account_id
        and link.dependent_id is not null
        and lower(clinic.slug) = v_slug
    ),
    array[]::uuid[]
  );
end;
$$;

comment on function public.linked_child_ids(text) is
  'Dependent ids linked to a chart in this clinic for the signed-in account. No name is returned.';

revoke all on function public.linked_child_ids(text)
  from public, anon, authenticated, service_role;

grant execute on function public.linked_child_ids(text) to authenticated;
