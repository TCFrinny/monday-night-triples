DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.seasons LOOP
    PERFORM public.refresh_lane_aggregates_impl(r.id);
  END LOOP;
END $$;