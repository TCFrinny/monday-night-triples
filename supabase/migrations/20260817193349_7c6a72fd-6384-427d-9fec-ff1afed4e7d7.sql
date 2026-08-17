CREATE OR REPLACE FUNCTION public.teams_refresh_caches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT season_id FROM changed_teams LOOP
    PERFORM public.refresh_season_aggregates_impl(r.season_id);
    PERFORM public.refresh_lane_aggregates_impl(r.season_id);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS teams_refresh_caches_ins ON public.teams;
CREATE TRIGGER teams_refresh_caches_ins
AFTER INSERT ON public.teams
REFERENCING NEW TABLE AS changed_teams
FOR EACH STATEMENT EXECUTE FUNCTION public.teams_refresh_caches();

DROP TRIGGER IF EXISTS teams_refresh_caches_del ON public.teams;
CREATE TRIGGER teams_refresh_caches_del
AFTER DELETE ON public.teams
REFERENCING OLD TABLE AS changed_teams
FOR EACH STATEMENT EXECUTE FUNCTION public.teams_refresh_caches();

DO $$
DECLARE sid uuid;
BEGIN
  FOR sid IN SELECT id FROM public.seasons LOOP
    PERFORM public.refresh_season_aggregates_impl(sid);
    PERFORM public.refresh_lane_aggregates_impl(sid);
  END LOOP;
END $$;