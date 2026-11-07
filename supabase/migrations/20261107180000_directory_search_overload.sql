-- Remove the old four-argument overload. The five-argument function added for
-- near-me search has a default for max_distance_km, so it also accepts calls
-- with four arguments and makes PostgREST unable to choose a function.
drop function if exists public.search_clinics(
  text,
  text,
  double precision,
  double precision
);

notify pgrst, 'reload schema';
