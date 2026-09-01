CREATE OR REPLACE FUNCTION public.matches_lane_pair_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_season uuid;
  v_new_season uuid;
BEGIN
  IF NEW.lane_pair IS NOT DISTINCT FROM OLD.lane_pair THEN
    RETURN NEW;
  END IF;

  SELECT w.season_id INTO v_new_season FROM public.weeks w WHERE w.id = NEW.week_id;
  SELECT w.season_id INTO v_old_season FROM public.weeks w WHERE w.id = OLD.week_id;

  IF v_new_season IS NOT NULL THEN
    PERFORM public.refresh_lane_aggregates_impl(v_new_season);
  END IF;
  IF v_old_season IS NOT NULL AND v_old_season IS DISTINCT FROM v_new_season THEN
    PERFORM public.refresh_lane_aggregates_impl(v_old_season);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_lane_pair_refresh_trg ON public.matches;
CREATE TRIGGER matches_lane_pair_refresh_trg
AFTER UPDATE OF lane_pair ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.matches_lane_pair_refresh();