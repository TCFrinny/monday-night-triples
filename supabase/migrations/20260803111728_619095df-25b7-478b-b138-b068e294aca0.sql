CREATE OR REPLACE VIEW public.v_game_context AS
SELECT g.id AS game_id,
    g.lineup_id,
    g.game_number,
    g.scratch_score,
    g.is_blind,
    l.bowler_id,
    l.team_id,
    l.participation,
    l.match_id,
    m.week_id,
    m.status AS match_status,
    w.season_id,
    w.week_number,
    w.third,
    m.lane_pair,
    m.is_bye,
    l.applicable_average
   FROM bowler_games g
     JOIN match_lineups l ON l.id = g.lineup_id
     JOIN matches m ON m.id = l.match_id
     JOIN weeks w ON w.id = m.week_id;

CREATE TABLE public.lane_stats_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  scope text NOT NULL,
  lane_pair text NOT NULL,
  lane_sort integer NOT NULL DEFAULT 0,
  games integer NOT NULL DEFAULT 0,
  pinfall integer NOT NULL DEFAULT 0,
  average numeric NOT NULL DEFAULT 0,
  poa numeric NOT NULL DEFAULT 0,
  high_scratch_game integer NOT NULL DEFAULT 0,
  frames integer NOT NULL DEFAULT 0,
  strikes integer NOT NULL DEFAULT 0,
  spares integer NOT NULL DEFAULT 0,
  ten_boxes integer NOT NULL DEFAULT 0,
  opens integer NOT NULL DEFAULT 0,
  spare_attempts integer NOT NULL DEFAULT 0,
  first_ball_pins integer NOT NULL DEFAULT 0,
  first_ball_count integer NOT NULL DEFAULT 0,
  first_ball_avg numeric NOT NULL DEFAULT 0,
  pins_lost integer NOT NULL DEFAULT 0,
  pins_lost_per_game numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, scope, lane_pair)
);

GRANT SELECT ON public.lane_stats_cache TO anon;
GRANT SELECT ON public.lane_stats_cache TO authenticated;
GRANT ALL ON public.lane_stats_cache TO service_role;

ALTER TABLE public.lane_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lane stats are publicly readable"
  ON public.lane_stats_cache FOR SELECT USING (true);

CREATE POLICY "Admins manage lane stats"
  ON public.lane_stats_cache FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.refresh_lane_aggregates_impl(p_season_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s text;
  v_third int;
  v_week int;
BEGIN
  DELETE FROM public.lane_stats_cache WHERE season_id = p_season_id;

  FOR s, v_third, v_week IN
    SELECT 'full', NULL::int, NULL::int
    UNION ALL
    SELECT 'third_' || gs, gs, NULL::int FROM generate_series(1, 3) gs
    UNION ALL
    SELECT DISTINCT 'week_' || w.week_number, NULL::int, w.week_number
    FROM public.weeks w
    JOIN public.matches m ON m.week_id = w.id AND m.status = 'final' AND m.is_bye = false
    WHERE w.season_id = p_season_id
  LOOP
    WITH g AS (
      SELECT gc.*
      FROM public.v_game_context gc
      WHERE gc.season_id = p_season_id
        AND gc.match_status = 'final'
        AND gc.is_bye = false
        AND gc.is_blind = false
        AND gc.lane_pair IS NOT NULL
        AND btrim(gc.lane_pair) <> ''
        AND (v_third IS NULL OR gc.third = v_third)
        AND (v_week IS NULL OR gc.week_number = v_week)
    ), gs AS (
      SELECT lane_pair,
             COUNT(*) AS games,
             SUM(scratch_score) AS pinfall,
             MAX(scratch_score) AS high_scratch_game,
             SUM(scratch_score - applicable_average) AS poa_sum
      FROM g GROUP BY lane_pair
    ), fs AS (
      SELECT g.lane_pair,
             COUNT(f.id) AS frames,
             COUNT(*) FILTER (WHERE f.outcome = 'strike') AS strikes,
             COUNT(*) FILTER (WHERE f.outcome = 'spare') AS spares,
             COUNT(*) FILTER (WHERE f.outcome = 'ten_box') AS ten_boxes,
             COUNT(*) FILTER (WHERE f.outcome = 'open') AS opens,
             COUNT(*) FILTER (WHERE f.outcome NOT IN ('strike','incomplete')) AS spare_attempts,
             COALESCE(SUM(f.first_ball_pins), 0) AS fb_pins,
             COUNT(f.first_ball_pins) AS fb_count,
             COALESCE(SUM(
               CASE WHEN f.outcome IN ('strike','spare','ten_box','incomplete') THEN 0
                    ELSE GREATEST(0, 10 - COALESCE((SELECT SUM(b.pins) FROM public.balls b WHERE b.frame_id = f.id), 0))
               END), 0) AS pins_lost
      FROM g
      JOIN public.frames f ON f.game_id = g.game_id
      WHERE f.outcome <> 'incomplete'
      GROUP BY g.lane_pair
    )
    INSERT INTO public.lane_stats_cache
      (season_id, scope, lane_pair, lane_sort, games, pinfall, average, poa, high_scratch_game,
       frames, strikes, spares, ten_boxes, opens, spare_attempts,
       first_ball_pins, first_ball_count, first_ball_avg, pins_lost, pins_lost_per_game)
    SELECT p_season_id, s, gs.lane_pair,
           COALESCE(NULLIF(regexp_replace(gs.lane_pair, '^[^0-9]*([0-9]+).*$', '\1'), '')::int, 0),
           gs.games, gs.pinfall,
           ROUND(gs.pinfall::numeric / gs.games, 2),
           ROUND(gs.poa_sum::numeric / gs.games, 2),
           gs.high_scratch_game,
           COALESCE(fs.frames, 0), COALESCE(fs.strikes, 0), COALESCE(fs.spares, 0),
           COALESCE(fs.ten_boxes, 0), COALESCE(fs.opens, 0), COALESCE(fs.spare_attempts, 0),
           COALESCE(fs.fb_pins, 0), COALESCE(fs.fb_count, 0),
           CASE WHEN COALESCE(fs.fb_count, 0) > 0
                THEN ROUND(fs.fb_pins::numeric / fs.fb_count, 2) ELSE 0 END,
           COALESCE(fs.pins_lost, 0),
           ROUND(COALESCE(fs.pins_lost, 0)::numeric / gs.games, 2)
    FROM gs LEFT JOIN fs ON fs.lane_pair = gs.lane_pair
    WHERE gs.games > 0;
  END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION public.refresh_season_aggregates(p_season_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  PERFORM public.refresh_season_aggregates_impl(p_season_id);
  PERFORM public.refresh_lane_aggregates_impl(p_season_id);
END; $function$;