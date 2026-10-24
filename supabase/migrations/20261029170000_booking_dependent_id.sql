-- Child chart link on staff accept (3.E3).
-- The owner session cannot select patient_dependents.
-- This returns one dependent id for a request that member may accept.
-- No name or other dependent field leaves the function.
-- Reception, another clinic, and an adult request return null.

create or replace function public.booking_dependent_id(p_request_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_request public.booking_requests%rowtype;
  v_role text;
  v_member_id uuid;
  v_dependent_id uuid;
begin
  if auth.uid() is null or p_request_id is null then
    return null;
  end if;

  select request.*
  into v_request
  from public.booking_requests as request
  where request.id = p_request_id;

  if not found then
    return null;
  end if;

  if not v_request.for_child then
    return null;
  end if;

  select member.role, member.id
  into v_role, v_member_id
  from public.clinic_members as member
  where member.user_id = auth.uid()
    and member.clinic_id = v_request.clinic_id;

  if not found then
    return null;
  end if;

  if not (
    v_role = 'owner'
    or (v_role = 'dentist' and v_member_id = v_request.dentist_id)
  ) then
    return null;
  end if;

  select dependent.id
  into v_dependent_id
  from public.patient_dependents as dependent
  where dependent.account_id = v_request.account_id
    and dependent.date_of_birth = v_request.patient_date_of_birth
    and lower(dependent.first_name) = lower(v_request.patient_first_name)
    and lower(dependent.last_name) = lower(v_request.patient_last_name)
    and dependent.relationship = v_request.contact_relationship
  order by dependent.created_at
  limit 1;

  return v_dependent_id;
end;
$$;

comment on function public.booking_dependent_id(uuid) is
  'Dependent id for a child booking the caller may accept. Owner or that dentist only. No name is returned.';

revoke all on function public.booking_dependent_id(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.booking_dependent_id(uuid) to authenticated;
