ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS game_lane_pairs jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.valid_game_lane_pairs(p jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT jsonb_typeof(p) = 'object' AND NOT EXISTS (
    SELECT 1 FROM jsonb_each(p) e
    WHERE e.key NOT IN ('1','2','3')
       OR jsonb_typeof(e.value) <> 'string'
       OR (e.value #>> '{}') !~ '^[0-9]+-[0-9]+$'
       OR split_part(e.value #>> '{}', '-', 2)::int <> split_part(e.value #>> '{}', '-', 1)::int + 1
       OR split_part(e.value #>> '{}', '-', 1)::int < 1
  );
$$;

ALTER TABLE public.matches ADD CONSTRAINT matches_game_lane_pairs_valid CHECK (public.valid_game_lane_pairs(game_lane_pairs));

CREATE OR REPLACE VIEW public.v_game_context AS
 SELECT g.id AS game_id, g.lineup_id, g.game_number, g.scratch_score, g.is_blind,
    l.bowler_id, l.team_id, l.participation, l.match_id, m.week_id,
    m.status AS match_status, w.season_id, w.week_number, w.third,
    COALESCE(m.game_lane_pairs ->> g.game_number::text, m.lane_pair) AS lane_pair,
    m.is_bye, l.applicable_average, g.is_withdrawn
   FROM bowler_games g
     JOIN match_lineups l ON l.id = g.lineup_id
     JOIN matches m ON m.id = l.match_id
     JOIN weeks w ON w.id = m.week_id;

CREATE OR REPLACE FUNCTION public.matches_lane_pair_refresh()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old_season uuid; v_new_season uuid;
BEGIN
  IF NEW.lane_pair IS NOT DISTINCT FROM OLD.lane_pair
     AND NEW.game_lane_pairs IS NOT DISTINCT FROM OLD.game_lane_pairs THEN
    RETURN NEW;
  END IF;
  SELECT w.season_id INTO v_new_season FROM public.weeks w WHERE w.id = NEW.week_id;
  SELECT w.season_id INTO v_old_season FROM public.weeks w WHERE w.id = OLD.week_id;
  IF v_new_season IS NOT NULL THEN PERFORM public.refresh_lane_aggregates_impl(v_new_season); END IF;
  IF v_old_season IS NOT NULL AND v_old_season IS DISTINCT FROM v_new_season THEN
    PERFORM public.refresh_lane_aggregates_impl(v_old_season);
  END IF;
  RETURN NEW;
END;
$function$;