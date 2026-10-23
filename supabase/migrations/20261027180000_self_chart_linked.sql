-- Self chart link for booking (2.D5).
-- True only when the signed-in account has its own chart in this clinic.
-- A child link does not count. Acceptance stores that row with dependent_id null
-- and leaves confirmed_at null. No chart name is returned.

create or replace function public.self_chart_linked(slug text)
returns boolean
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
    return false;
  end if;

  select account.id
  into v_account_id
  from public.patient_accounts as account
  where account.user_id = auth.uid();

  if v_account_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.patient_chart_links as link
    join public.clinics as clinic
      on clinic.id = link.clinic_id
    where link.account_id = v_account_id
      and link.dependent_id is null
      and lower(clinic.slug) = v_slug
  );
end;
$$;

comment on function public.self_chart_linked(text) is
  'True when the signed-in account is linked to their own chart in this clinic. No name is returned.';

revoke all on function public.self_chart_linked(text)
  from public, anon, authenticated, service_role;

grant execute on function public.self_chart_linked(text) to authenticated;
