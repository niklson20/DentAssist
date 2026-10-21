-- Test seed (1.11). Not a migration: db:reset refuses production ref
-- iirzzaykgskjouzzvdrd before this file can run, and db:migrate does not apply it.
-- Passwords are not stored in git. Each account gets a throwaway bcrypt hash.
--
-- One owner, one dentist, and one receptionist belong to Ordinacija Centar.
-- An account can belong to only one clinic, so Ordinacija Sever has no members.
-- The platform admin is not a clinic member.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  is_super_admin,
  is_sso_user,
  is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'vlasnik@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'stomatolog@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'recepcija@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'platforma@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false,
    false
  );

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  created_at,
  updated_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '{"sub":"10000000-0000-4000-8000-000000000001","email":"vlasnik@example.com"}'::jsonb,
    'email',
    '10000000-0000-4000-8000-000000000001',
    now(),
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '{"sub":"10000000-0000-4000-8000-000000000002","email":"stomatolog@example.com"}'::jsonb,
    'email',
    '10000000-0000-4000-8000-000000000002',
    now(),
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    '{"sub":"10000000-0000-4000-8000-000000000003","email":"recepcija@example.com"}'::jsonb,
    'email',
    '10000000-0000-4000-8000-000000000003',
    now(),
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000004',
    '{"sub":"10000000-0000-4000-8000-000000000004","email":"platforma@example.com"}'::jsonb,
    'email',
    '10000000-0000-4000-8000-000000000004',
    now(),
    now()
  );

insert into public.clinics (
  id,
  name,
  slug,
  city,
  address,
  latitude,
  longitude,
  phone,
  description,
  slot_minutes,
  buffer_minutes,
  default_duration_min,
  min_notice_minutes,
  max_ahead_days,
  online_booking_enabled,
  status
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'Ordinacija Centar',
    'ordinacija-centar',
    'Beograd',
    'Knez Mihailova 1',
    44.8176,
    20.4569,
    '+381112345678',
    'Test ordinacija.',
    15,
    0,
    30,
    60,
    60,
    false,
    'active'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Ordinacija Sever',
    'ordinacija-sever',
    'Novi Sad',
    'Zmaj Jovina 1',
    45.2671,
    19.8335,
    '+381212345678',
    'Test ordinacija.',
    30,
    5,
    30,
    120,
    30,
    false,
    'active'
  );

insert into public.clinic_members (
  id,
  clinic_id,
  user_id,
  role,
  sees_patients,
  listed_online,
  first_name,
  last_name
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '10000000-0000-4000-8000-000000000001',
    'owner',
    true,
    true,
    'Ana',
    'Petrović'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '10000000-0000-4000-8000-000000000002',
    'dentist',
    true,
    true,
    'Marko',
    'Jovanović'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    '10000000-0000-4000-8000-000000000003',
    'reception',
    false,
    false,
    'Jelena',
    'Ilić'
  );

insert into public.platform_admins (user_id)
values ('10000000-0000-4000-8000-000000000004');
