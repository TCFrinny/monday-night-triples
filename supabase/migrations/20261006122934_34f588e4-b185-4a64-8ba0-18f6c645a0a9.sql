-- Mid-game withdrawal (hybrid blind-ball) support. Additive only; existing rows default to false.
ALTER TABLE public.balls ADD COLUMN IF NOT EXISTS is_blind boolean NOT NULL DEFAULT false;
ALTER TABLE public.bowler_games ADD COLUMN IF NOT EXISTS is_withdrawn boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.v_game_context AS
 SELECT g.id AS game_id, g.lineup_id, g.game_number, g.scratch_score, g.is_blind,
    l.bowler_id, l.team_id, l.participation, l.match_id, m.week_id, m.status AS match_status,
    w.season_id, w.week_number, w.third, m.lane_pair, m.is_bye, l.applicable_average,
    g.is_withdrawn
   FROM bowler_games g
     JOIN match_lineups l ON l.id = g.lineup_id
     JOIN matches m ON m.id = l.match_id
     JOIN weeks w ON w.id = m.week_id;

CREATE OR REPLACE VIEW public.v_frame_flags WITH (security_invoker = true) AS
 SELECT f.*,
        COALESCE(bf.any_blind, false) AS any_blind,
        COALESCE(bf.fb_blind, false) AS fb_blind
   FROM public.frames f
   LEFT JOIN LATERAL (
     SELECT bool_or(b.is_blind) AS any_blind,
            bool_or(b.is_blind) FILTER (WHERE b.ball_number = 1) AS fb_blind
     FROM public.balls b WHERE b.frame_id = f.id
   ) bf ON true;
REVOKE ALL ON public.v_frame_flags FROM anon, authenticated;
GRANT SELECT ON public.v_frame_flags TO service_role;

CREATE OR REPLACE VIEW public.v_bowler_game_events AS
 SELECT gc.game_id AS event_id, gc.season_id, gc.week_number, gc.third, gc.bowler_id,
    b.full_name, b.slug, b.is_sub, gc.scratch_score AS score
   FROM v_game_context gc JOIN bowlers b ON b.id = gc.bowler_id
  WHERE gc.match_status = 'final'::match_status AND gc.is_bye = false AND gc.is_blind = false
    AND gc.is_withdrawn = false AND gc.bowler_id IS NOT NULL;

CREATE OR REPLACE VIEW public.v_bowler_set_events AS
 SELECT gc.lineup_id AS event_id, gc.season_id, gc.week_number, gc.third, gc.bowler_id,
    b.full_name, b.slug, b.is_sub, sum(gc.scratch_score)::integer AS score
   FROM v_game_context gc JOIN bowlers b ON b.id = gc.bowler_id
  WHERE gc.match_status = 'final'::match_status AND gc.is_bye = false AND gc.is_blind = false
    AND gc.is_withdrawn = false AND gc.bowler_id IS NOT NULL
  GROUP BY gc.lineup_id, gc.season_id, gc.week_number, gc.third, gc.bowler_id, b.full_name, b.slug, b.is_sub
 HAVING count(*) = 3;

CREATE OR REPLACE FUNCTION public.refresh_season_aggregates_impl(p_season_id uuid)
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
  DELETE FROM public.team_standings_cache WHERE season_id = p_season_id;
  DELETE FROM public.bowler_stats_cache WHERE season_id = p_season_id;
  DELETE FROM public.team_stats_cache WHERE season_id = p_season_id;

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
    IF v_week IS NULL THEN
      WITH tm AS (
        SELECT m.id AS match_id, w.third, m.team_a_id AS team_id, m.points_a AS points,
               m.scratch_total_a AS scratch, m.hdcp_total_a AS hdcp
        FROM public.matches m JOIN public.weeks w ON w.id = m.week_id
        WHERE w.season_id = p_season_id AND m.status = 'final' AND m.is_bye = false
          AND (v_third IS NULL OR w.third = v_third)
        UNION ALL
        SELECT m.id, w.third, m.team_b_id, m.points_b, m.scratch_total_b, m.hdcp_total_b
        FROM public.matches m JOIN public.weeks w ON w.id = m.week_id
        WHERE w.season_id = p_season_id AND m.status = 'final' AND m.is_bye = false
          AND m.team_b_id IS NOT NULL
          AND (v_third IS NULL OR w.third = v_third)
      ), agg AS (
        SELECT t.id AS team_id,
               COALESCE(SUM(tm.points),0) AS points,
               COALESCE(SUM(tm.hdcp),0) AS hdcp,
               COALESCE(SUM(tm.scratch),0) AS scratch,
               COUNT(tm.match_id) AS played
        FROM public.teams t
        LEFT JOIN tm ON tm.team_id = t.id
        WHERE t.season_id = p_season_id
        GROUP BY t.id
      )
      INSERT INTO public.team_standings_cache
        (season_id, team_id, scope, points, hdcp_pinfall, scratch_pinfall, matches_played, rank)
      SELECT p_season_id, team_id, s, points, hdcp, scratch, played,
             RANK() OVER (ORDER BY points DESC, hdcp DESC, scratch DESC)
      FROM agg;
    END IF;

    WITH tm AS (
      SELECT m.id AS match_id, m.team_a_id AS team_id, m.points_a AS points,
             m.scratch_total_a AS scratch, m.hdcp_total_a AS hdcp
      FROM public.matches m JOIN public.weeks w ON w.id = m.week_id
      WHERE w.season_id = p_season_id AND m.status = 'final' AND m.is_bye = false
        AND (v_third IS NULL OR w.third = v_third)
        AND (v_week IS NULL OR w.week_number = v_week)
      UNION ALL
      SELECT m.id, m.team_b_id, m.points_b, m.scratch_total_b, m.hdcp_total_b
      FROM public.matches m JOIN public.weeks w ON w.id = m.week_id
      WHERE w.season_id = p_season_id AND m.status = 'final' AND m.is_bye = false
        AND m.team_b_id IS NOT NULL
        AND (v_third IS NULL OR w.third = v_third)
        AND (v_week IS NULL OR w.week_number = v_week)
    ), mstats AS (
      SELECT team_id, COUNT(*) AS matches, SUM(points) AS points,
             SUM(scratch) AS scratch_pinfall, SUM(hdcp) AS hdcp_pinfall,
             MAX(scratch) AS high_scratch_set, MAX(hdcp) AS high_hdcp_set
      FROM tm GROUP BY team_id
    ), teamgame AS (
      SELECT gc.team_id, gc.match_id, gc.game_number, SUM(gc.scratch_score) AS scratch,
             SUM(gc.scratch_score)
               + MAX(CASE WHEN m.handicap_team_id = gc.team_id THEN m.handicap_pins ELSE 0 END) AS hdcp
      FROM public.v_game_context gc
      JOIN public.matches m ON m.id = gc.match_id
      WHERE gc.season_id = p_season_id AND gc.match_status = 'final'
        AND (v_third IS NULL OR gc.third = v_third)
        AND (v_week IS NULL OR gc.week_number = v_week)
      GROUP BY gc.team_id, gc.match_id, gc.game_number
    ), gstats AS (
      SELECT team_id, MAX(scratch) AS high_scratch_game, MAX(hdcp) AS high_hdcp_game,
             COUNT(*) AS team_games,
             ROUND(COALESCE(STDDEV_POP(scratch),0)::numeric, 2) AS score_stddev
      FROM teamgame GROUP BY team_id
    ), rolled AS (
      SELECT gc.* FROM public.v_game_context gc
      WHERE gc.season_id = p_season_id AND gc.match_status = 'final' AND gc.is_blind = false
        AND (v_third IS NULL OR gc.third = v_third)
        AND (v_week IS NULL OR gc.week_number = v_week)
    ), tgs AS (
      SELECT r.team_id, r.match_id, r.game_number, r.game_id, r.scratch_score,
             MAX(f.cumulative_score) FILTER (WHERE f.frame_number = 3) AS c3,
             MAX(f.cumulative_score) FILTER (WHERE f.frame_number = 5) AS c5,
             MAX(f.cumulative_score) FILTER (WHERE f.frame_number = 7) AS c7
      FROM rolled r
      JOIN public.frames f ON f.game_id = r.game_id
      GROUP BY r.team_id, r.match_id, r.game_number, r.game_id, r.scratch_score
      HAVING COUNT(*) = 10
         AND COUNT(*) FILTER (WHERE f.outcome = 'incomplete') = 0
         AND COUNT(*) FILTER (WHERE f.frame_number IN (3,5,7) AND f.cumulative_score IS NOT NULL) = 3
    ), tgexpected AS (
      SELECT team_id, match_id, game_number, COUNT(*) AS rolled_games
      FROM rolled GROUP BY team_id, match_id, game_number
    ), tgseg AS (
      SELECT tgs.team_id, tgs.match_id, tgs.game_number,
             SUM(tgs.c5) AS f5,
             SUM(tgs.scratch_score - tgs.c5) AS l5,
             SUM(tgs.c3) AS bo,
             SUM(tgs.scratch_score - tgs.c7) AS bf
      FROM tgs
      JOIN tgexpected e ON e.team_id = tgs.team_id AND e.match_id = tgs.match_id
                       AND e.game_number = tgs.game_number
      GROUP BY tgs.team_id, tgs.match_id, tgs.game_number, e.rolled_games
      HAVING COUNT(*) = MAX(e.rolled_games)
    ), tsegagg AS (
      SELECT team_id,
             ROUND(AVG(f5)::numeric, 2) AS first5_avg,
             ROUND(AVG(l5)::numeric, 2) AS last5_avg,
             ROUND(AVG(bo)::numeric, 2) AS big_opening_avg,
             ROUND(AVG(bf)::numeric, 2) AS big_finish_avg
      FROM tgseg GROUP BY team_id
    ), fstats AS (
      SELECT gc.team_id,
             COUNT(f.id) FILTER (WHERE f.outcome <> 'incomplete') AS frames,
             COUNT(*) FILTER (WHERE f.outcome = 'strike') AS strikes,
             COUNT(*) FILTER (WHERE f.outcome = 'spare') AS spares,
             COUNT(*) FILTER (WHERE f.outcome = 'ten_box') AS ten_boxes,
             COUNT(*) FILTER (WHERE f.outcome = 'open') AS opens,
             COUNT(*) FILTER (WHERE f.outcome <> 'strike' AND f.outcome <> 'incomplete') AS spare_attempts,
             COALESCE(SUM(f.first_ball_pins),0) AS fb_pins,
             COUNT(f.first_ball_pins) AS fb_count,
             COUNT(*) FILTER (WHERE f.first_ball_pins >= 8) AS fb8,
             COUNT(*) FILTER (WHERE f.first_ball_pins >= 9) AS fb9,
             COUNT(*) FILTER (WHERE f.is_split) AS splits,
             COUNT(*) FILTER (WHERE f.is_split AND f.outcome = 'spare') AS split_conv,
             COUNT(*) FILTER (WHERE f.frame_number IN (9,10) AND f.outcome IN ('strike','spare')) AS clutch,
             COUNT(*) FILTER (WHERE f.frame_number IN (9,10) AND f.outcome <> 'incomplete') AS clutch_frames,
             COALESCE(SUM(
               CASE WHEN f.outcome IN ('strike','spare','ten_box','incomplete') THEN 0
                    ELSE GREATEST(0, 10 - COALESCE((SELECT SUM(b.pins) FROM public.balls b WHERE b.frame_id = f.id), 0))
               END), 0) AS pins_lost
      FROM (SELECT ff.id, ff.game_id, ff.frame_number,
                   CASE WHEN ff.any_blind THEN 'incomplete'::public.frame_outcome ELSE ff.outcome END AS outcome,
                   ff.cumulative_score,
                   CASE WHEN ff.fb_blind THEN NULL ELSE ff.first_ball_pins END AS first_ball_pins,
                   (ff.is_split AND NOT ff.fb_blind) AS is_split
            FROM public.v_frame_flags ff) f
      JOIN public.v_game_context gc ON gc.game_id = f.game_id
      WHERE gc.season_id = p_season_id AND gc.match_status = 'final' AND gc.is_blind = false
        AND (v_third IS NULL OR gc.third = v_third)
        AND (v_week IS NULL OR gc.week_number = v_week)
      GROUP BY gc.team_id
    )
    INSERT INTO public.team_stats_cache
      (season_id, team_id, scope, matches, points, points_possible, scratch_pinfall, hdcp_pinfall,
       scratch_avg, hdcp_avg, high_scratch_game, high_hdcp_game, high_scratch_set, high_hdcp_set,
       frames, strikes, spares, ten_boxes, opens, spare_attempts,
       first_ball_pins, first_ball_count, first_ball_eight_plus, first_ball_nine_plus,
       splits, split_conversions,
       pins_lost, pins_lost_per_game, team_games, score_stddev,
       first5_avg, last5_avg, big_opening_avg, big_finish_avg, clutch_marks, clutch_frames)
    SELECT p_season_id, t.id, s,
           COALESCE(ms.matches,0), COALESCE(ms.points,0), COALESCE(ms.matches,0) * 7,
           COALESCE(ms.scratch_pinfall,0), COALESCE(ms.hdcp_pinfall,0),
           CASE WHEN COALESCE(ms.matches,0) > 0 THEN ROUND(ms.scratch_pinfall::numeric / (ms.matches * 3), 1) ELSE 0 END,
           CASE WHEN COALESCE(ms.matches,0) > 0 THEN ROUND(ms.hdcp_pinfall::numeric / (ms.matches * 3), 1) ELSE 0 END,
           COALESCE(gs.high_scratch_game,0), COALESCE(gs.high_hdcp_game,0),
           COALESCE(ms.high_scratch_set,0), COALESCE(ms.high_hdcp_set,0),
           COALESCE(fs.frames,0), COALESCE(fs.strikes,0), COALESCE(fs.spares,0), COALESCE(fs.ten_boxes,0),
           COALESCE(fs.opens,0), COALESCE(fs.spare_attempts,0),
           COALESCE(fs.fb_pins,0), COALESCE(fs.fb_count,0), COALESCE(fs.fb8,0), COALESCE(fs.fb9,0),
           COALESCE(fs.splits,0), COALESCE(fs.split_conv,0),
           COALESCE(fs.pins_lost,0),
           CASE WHEN COALESCE(gs.team_games,0) > 0
                THEN ROUND(COALESCE(fs.pins_lost,0)::numeric / gs.team_games, 2) ELSE 0 END,
           COALESCE(gs.team_games,0), COALESCE(gs.score_stddev,0),
           COALESCE(tsa.first5_avg,0), COALESCE(tsa.last5_avg,0),
           COALESCE(tsa.big_opening_avg,0), COALESCE(tsa.big_finish_avg,0),
           COALESCE(fs.clutch,0), COALESCE(fs.clutch_frames,0)
    FROM public.teams t
    LEFT JOIN mstats ms ON ms.team_id = t.id
    LEFT JOIN gstats gs ON gs.team_id = t.id
    LEFT JOIN tsegagg tsa ON tsa.team_id = t.id
    LEFT JOIN fstats fs ON fs.team_id = t.id
    WHERE t.season_id = p_season_id
      AND (v_week IS NULL OR COALESCE(ms.matches,0) > 0);

    WITH g AS (
      SELECT gc.* FROM public.v_game_context gc
      WHERE gc.season_id = p_season_id AND gc.match_status = 'final'
        AND gc.is_blind = false AND gc.bowler_id IS NOT NULL
        AND (v_third IS NULL OR gc.third = v_third)
        AND (v_week IS NULL OR gc.week_number = v_week)
    ), gs AS (
      SELECT bowler_id, COUNT(*) AS games, SUM(scratch_score) AS pinfall,
             MAX(scratch_score) AS high_game, MIN(scratch_score) AS low_game
      FROM g WHERE NOT g.is_withdrawn GROUP BY bowler_id
    ), sets AS (
      SELECT bowler_id, lineup_id, SUM(scratch_score) AS set_score, COUNT(*) AS n
      FROM g WHERE NOT g.is_withdrawn GROUP BY bowler_id, lineup_id
    ), ss AS (
      SELECT bowler_id, COUNT(*) FILTER (WHERE n = 3) AS sets,
             MAX(set_score) FILTER (WHERE n = 3) AS high_set,
             MIN(set_score) FILTER (WHERE n = 3) AS low_set
      FROM sets GROUP BY bowler_id
    ), fr AS (
      SELECT g.bowler_id, f.*, g.week_number, g.game_id AS gid, g.is_withdrawn AS g_withdrawn
      FROM (SELECT ff.id, ff.game_id, ff.frame_number,
                   CASE WHEN ff.any_blind THEN 'incomplete'::public.frame_outcome ELSE ff.outcome END AS outcome,
                   ff.cumulative_score,
                   CASE WHEN ff.fb_blind THEN NULL ELSE ff.first_ball_pins END AS first_ball_pins,
                   (ff.is_split AND NOT ff.fb_blind) AS is_split
            FROM public.v_frame_flags ff) f JOIN g ON g.game_id = f.game_id
    ), fs AS (
      SELECT bowler_id,
             COUNT(*) FILTER (WHERE outcome <> 'incomplete') AS frames,
             COUNT(*) FILTER (WHERE outcome = 'strike') AS strikes,
             COUNT(*) FILTER (WHERE outcome = 'spare') AS spares,
             COUNT(*) FILTER (WHERE outcome = 'ten_box') AS ten_boxes,
             COUNT(*) FILTER (WHERE outcome = 'open') AS opens,
             COUNT(*) FILTER (WHERE outcome NOT IN ('strike','incomplete')) AS spare_attempts,
             COUNT(*) FILTER (WHERE outcome IN ('strike','spare')) AS clean_frames,
             COUNT(*) FILTER (WHERE frame_number IN (9,10) AND outcome IN ('strike','spare')) AS clutch,
             COUNT(*) FILTER (WHERE frame_number IN (9,10) AND outcome <> 'incomplete') AS clutch_frames,
             COALESCE(SUM(
               CASE WHEN outcome IN ('strike','spare','ten_box','incomplete') THEN 0
                    ELSE GREATEST(0, 10 - COALESCE((SELECT SUM(b.pins) FROM public.balls b WHERE b.frame_id = fr.id), 0))
               END), 0) AS pins_lost,
             COALESCE(SUM(
               CASE WHEN g_withdrawn OR outcome IN ('strike','spare','ten_box','incomplete') THEN 0
                    ELSE GREATEST(0, 10 - COALESCE((SELECT SUM(b.pins) FROM public.balls b WHERE b.frame_id = fr.id), 0))
               END), 0) AS pins_lost_elig,
             COALESCE(SUM(first_ball_pins),0) AS fb_pins,
             COUNT(first_ball_pins) AS fb_count,
             COUNT(*) FILTER (WHERE first_ball_pins >= 8) AS fb8,
             COUNT(*) FILTER (WHERE first_ball_pins >= 9) AS fb9,
             COUNT(*) FILTER (WHERE is_split) AS splits,
             COUNT(*) FILTER (WHERE is_split AND outcome = 'spare') AS split_conv,
             COUNT(*) FILTER (WHERE is_split AND outcome = 'ten_box') AS split_tb,
             COUNT(*) FILTER (WHERE is_split AND outcome = 'open') AS split_open
      FROM fr GROUP BY bowler_id
    ), dist AS (
      SELECT bowler_id, jsonb_object_agg(pins::text, c) AS d
      FROM (SELECT bowler_id, first_ball_pins AS pins, COUNT(*) AS c
            FROM fr WHERE first_ball_pins IS NOT NULL
            GROUP BY bowler_id, first_ball_pins) x
      GROUP BY bowler_id
    ), cg AS (
      SELECT bowler_id, COUNT(*) AS clean_games FROM (
        SELECT bowler_id, gid, COUNT(*) AS n,
               COUNT(*) FILTER (WHERE outcome IN ('strike','spare')) AS clean
        FROM fr GROUP BY bowler_id, gid
      ) y WHERE n = 10 AND clean = 10 GROUP BY bowler_id
    ), seg AS (
      SELECT g.bowler_id, g.game_id, g.scratch_score,
             MAX(f.cumulative_score) FILTER (WHERE f.frame_number = 3) AS c3,
             MAX(f.cumulative_score) FILTER (WHERE f.frame_number = 5) AS c5,
             MAX(f.cumulative_score) FILTER (WHERE f.frame_number = 7) AS c7
      FROM g
      JOIN public.frames f ON f.game_id = g.game_id
      WHERE NOT g.is_withdrawn
      GROUP BY g.bowler_id, g.game_id, g.scratch_score
      HAVING COUNT(*) = 10
         AND COUNT(*) FILTER (WHERE f.outcome = 'incomplete') = 0
         AND COUNT(*) FILTER (WHERE f.frame_number IN (3,5,7) AND f.cumulative_score IS NOT NULL) = 3
    ), segagg AS (
      SELECT bowler_id, COUNT(*) AS complete_games,
             ROUND(AVG(c5)::numeric, 2) AS first5_avg,
             ROUND(AVG(scratch_score - c5)::numeric, 2) AS last5_avg,
             ROUND(AVG(c3)::numeric, 2) AS big_opening_avg,
             ROUND(AVG(scratch_score - c7)::numeric, 2) AS big_finish_avg,
             ROUND(COALESCE(STDDEV_POP(scratch_score),0)::numeric, 2) AS score_stddev
      FROM seg GROUP BY bowler_id
    ), seq AS (
      SELECT bowler_id, outcome,
             ROW_NUMBER() OVER (PARTITION BY bowler_id ORDER BY week_number, gid, frame_number) AS rn
      FROM fr
    ), strk AS (
      SELECT bowler_id, MAX(len) AS longest FROM (
        SELECT bowler_id, COUNT(*) AS len FROM (
          SELECT bowler_id, rn - ROW_NUMBER() OVER (PARTITION BY bowler_id ORDER BY rn) AS grp
          FROM seq WHERE outcome = 'strike'
        ) z GROUP BY bowler_id, grp
      ) zz GROUP BY bowler_id
    ), mrk AS (
      SELECT bowler_id, MAX(len) AS longest FROM (
        SELECT bowler_id, COUNT(*) AS len FROM (
          SELECT bowler_id, rn - ROW_NUMBER() OVER (PARTITION BY bowler_id ORDER BY rn) AS grp
          FROM seq WHERE outcome IN ('strike','spare')
        ) z GROUP BY bowler_id, grp
      ) zz GROUP BY bowler_id
    )
    INSERT INTO public.bowler_stats_cache
      (season_id, bowler_id, scope, games, sets, pinfall, average, high_game, low_game,
       high_set, low_set, frames, strikes, spares, ten_boxes, opens, spare_attempts,
       clean_frames, clean_games, first_ball_pins, first_ball_count, first_ball_eight_plus,
       first_ball_nine_plus, first_ball_dist, splits, split_conversions, split_ten_boxes,
       split_opens, longest_strike_streak, longest_mark_streak,
       pins_lost, pins_lost_per_game, complete_games, score_stddev,
       first5_avg, last5_avg, big_opening_avg, big_finish_avg, clutch_marks, clutch_frames)
    SELECT p_season_id, b.id, s,
           COALESCE(gs.games,0), COALESCE(ss.sets,0), COALESCE(gs.pinfall,0),
           CASE WHEN COALESCE(gs.games,0) > 0 THEN ROUND(gs.pinfall::numeric / gs.games, 2) ELSE 0 END,
           COALESCE(gs.high_game,0), COALESCE(gs.low_game,0),
           COALESCE(ss.high_set,0), COALESCE(ss.low_set,0),
           COALESCE(fs.frames,0), COALESCE(fs.strikes,0), COALESCE(fs.spares,0),
           COALESCE(fs.ten_boxes,0), COALESCE(fs.opens,0), COALESCE(fs.spare_attempts,0),
           COALESCE(fs.clean_frames,0), COALESCE(cg.clean_games,0),
           COALESCE(fs.fb_pins,0), COALESCE(fs.fb_count,0), COALESCE(fs.fb8,0), COALESCE(fs.fb9,0),
           COALESCE(dist.d, '{}'::jsonb),
           COALESCE(fs.splits,0), COALESCE(fs.split_conv,0), COALESCE(fs.split_tb,0),
           COALESCE(fs.split_open,0),
           COALESCE(strk.longest,0), COALESCE(mrk.longest,0),
           COALESCE(fs.pins_lost,0),
           CASE WHEN COALESCE(gs.games,0) > 0
                THEN ROUND(COALESCE(fs.pins_lost_elig,0)::numeric / gs.games, 2) ELSE 0 END,
           COALESCE(sa.complete_games,0), COALESCE(sa.score_stddev,0),
           COALESCE(sa.first5_avg,0), COALESCE(sa.last5_avg,0),
           COALESCE(sa.big_opening_avg,0), COALESCE(sa.big_finish_avg,0),
           COALESCE(fs.clutch,0), COALESCE(fs.clutch_frames,0)
    FROM public.bowlers b
    LEFT JOIN gs ON gs.bowler_id = b.id
    LEFT JOIN ss ON ss.bowler_id = b.id
    LEFT JOIN fs ON fs.bowler_id = b.id
    LEFT JOIN dist ON dist.bowler_id = b.id
    LEFT JOIN cg ON cg.bowler_id = b.id
    LEFT JOIN segagg sa ON sa.bowler_id = b.id
    LEFT JOIN strk ON strk.bowler_id = b.id
    LEFT JOIN mrk ON mrk.bowler_id = b.id
    WHERE b.season_id = p_season_id
      AND (v_week IS NULL OR COALESCE(gs.games,0) > 0);
  END LOOP;
END; $function$;

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
             MAX(scratch_score) FILTER (WHERE NOT is_withdrawn) AS high_scratch_game,
             SUM(scratch_score - applicable_average) AS poa_sum
      FROM g GROUP BY lane_pair
    ), fs AS (
      SELECT g.lane_pair,
             COUNT(f.id) FILTER (WHERE f.outcome <> 'incomplete') AS frames,
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
      JOIN (SELECT ff.id, ff.game_id, ff.frame_number,
                   CASE WHEN ff.any_blind THEN 'incomplete'::public.frame_outcome ELSE ff.outcome END AS outcome,
                   ff.cumulative_score,
                   CASE WHEN ff.fb_blind THEN NULL ELSE ff.first_ball_pins END AS first_ball_pins,
                   (ff.is_split AND NOT ff.fb_blind) AS is_split
            FROM public.v_frame_flags ff) f ON f.game_id = g.game_id
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
           COALESCE(gs.high_scratch_game, 0),
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

CREATE OR REPLACE FUNCTION public.singles_side_scores(p_week_id uuid, p_bowler uuid)
 RETURNS TABLE(actual_bowler_id uuid, applicable_average numeric, is_sub boolean, is_blind boolean, g1 integer, g2 integer, g3 integer, games integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l record;
BEGIN
  SELECT ml.* INTO l
  FROM public.match_lineups ml
  JOIN public.matches m ON m.id = ml.match_id
  WHERE m.week_id = p_week_id
    AND m.status = 'final'
    AND m.is_bye = false
    AND (ml.absent_bowler_id = p_bowler OR (ml.absent_bowler_id IS NULL AND ml.bowler_id = p_bowler))
  ORDER BY (CASE WHEN ml.bowler_id = p_bowler THEN 0 ELSE 1 END)
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT COALESCE(l.bowler_id, p_bowler),
         l.applicable_average,
         (l.participation = 'sub' AND l.bowler_id IS DISTINCT FROM p_bowler),
         (l.participation = 'blind' OR COALESCE(bool_or(bg.is_withdrawn), false)),
         COALESCE(MAX(bg.scratch_score) FILTER (WHERE bg.game_number = 1), 0)::int,
         COALESCE(MAX(bg.scratch_score) FILTER (WHERE bg.game_number = 2), 0)::int,
         COALESCE(MAX(bg.scratch_score) FILTER (WHERE bg.game_number = 3), 0)::int,
         COUNT(bg.id)::int
  FROM public.bowler_games bg
  WHERE bg.lineup_id = l.id;
END;
$function$;