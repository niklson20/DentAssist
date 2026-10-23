-- Offer page (2.D8).
-- A signed-out caller learns the clinic slug so the page can open login.
-- Slot times are returned only when the signed-in account is the request account
-- and that account email is the request email. Another account gets no slots.

create or replace function public.preview_booking_offer(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hash text := lower(btrim(p_token_hash));
  v_link public.booking_links%rowtype;
  v_request public.booking_requests%rowtype;
  v_account_id uuid;
  v_email text;
  v_confirmed_at timestamptz;
  v_slug text;
  v_clinic_name text;
  v_phone text;
  v_offers jsonb;
  v_same_account boolean;
begin
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select link.*
  into v_link
  from public.booking_links as link
  where link.token_hash = v_hash
    and link.purpose = 'offer';

  if v_link.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select clinic.slug, clinic.name, clinic.phone
  into v_slug, v_clinic_name, v_phone
  from public.clinics as clinic
  where clinic.id = v_link.clinic_id;

  if v_slug is null or v_phone is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select request.*
  into v_request
  from public.booking_requests as request
  where request.id = v_link.booking_request_id
    and request.clinic_id = v_link.clinic_id;

  if auth.uid() is not null then
    select account.id, account.email, account.email_confirmed_at
    into v_account_id, v_email, v_confirmed_at
    from public.patient_accounts as account
    where account.user_id = auth.uid();
  end if;

  v_same_account :=
    v_account_id is not null
    and v_confirmed_at is not null
    and v_request.id is not null
    and v_request.account_id = v_account_id
    and lower(v_request.booker_email) = lower(v_email);

  if v_link.revoked_at is not null
    or v_link.expires_at <= now()
    or v_request.id is null
    or v_request.status is distinct from 'pending'
    or v_request.expires_at <= now()
  then
    if v_same_account and v_request.status = 'accepted' then
      return jsonb_build_object(
        'status', 'accepted',
        'slug', v_slug,
        'clinic_name', v_clinic_name
      );
    end if;

    if v_same_account and v_request.status = 'declined_by_patient' then
      return jsonb_build_object(
        'status', 'declined',
        'slug', v_slug,
        'clinic_name', v_clinic_name
      );
    end if;

    return jsonb_build_object(
      'status', 'invalid',
      'slug', v_slug,
      'phone', v_phone
    );
  end if;

  if auth.uid() is null or v_account_id is null then
    return jsonb_build_object(
      'status', 'signed_out',
      'slug', v_slug
    );
  end if;

  if v_confirmed_at is null then
    return jsonb_build_object(
      'status', 'unconfirmed',
      'slug', v_slug
    );
  end if;

  if not v_same_account then
    return jsonb_build_object(
      'status', 'mismatch',
      'slug', v_slug,
      'phone', v_phone
    );
  end if;

  select coalesce(
    (
      select jsonb_agg(slot.offer order by slot.position)
      from (
        select
          offer.position,
          jsonb_build_object(
            'id', appointment.id,
            'starts_at', appointment.starts_at,
            'ends_at', appointment.ends_at,
            'dentist_first_name', member.first_name,
            'dentist_last_name', member.last_name
          ) as offer
        from public.appointment_offers as offer
        join public.appointments as appointment
          on appointment.id = offer.appointment_id
        join public.clinic_members as member
          on member.id = appointment.dentist_id
         and member.clinic_id = appointment.clinic_id
        where offer.booking_request_id = v_request.id
          and offer.position between 1 and 3
          and appointment.status = 'offered'
          and appointment.booking_request_id = v_request.id
          and appointment.clinic_id = v_request.clinic_id
        order by offer.position
        limit 3
      ) as slot
    ),
    '[]'::jsonb
  )
  into v_offers;

  return jsonb_build_object(
    'status', 'ready',
    'slug', v_slug,
    'clinic_name', v_clinic_name,
    'phone', v_phone,
    'offers', v_offers
  );
end;
$$;

comment on function public.preview_booking_offer(text) is
  'Offer slots for the signed-in patient whose email is the booking request email. A different account and a signed-out caller do not receive slots.';

revoke all on function public.preview_booking_offer(text)
  from public, anon, authenticated, service_role;

grant execute on function public.preview_booking_offer(text) to anon, authenticated;
