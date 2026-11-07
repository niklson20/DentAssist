create extension if not exists pg_cron;

-- Re-registering the named job updates it instead of creating duplicates.
select cron.schedule(
  'expire-booking-requests',
  '*/5 * * * *',
  'select public.expire_booking_requests();'
);
