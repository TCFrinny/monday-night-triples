ALTER VIEW public.v_game_context SET (security_invoker = on);

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_season_aggregates(p_season_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s text;
  scopes text[] := ARRAY['full','third_1','third_2','third_3'];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM public.team_standings_cache WHERE season_id = p_season_id;
  DELETE FROM public.bowler_stats_cache WHERE season_id = p_season_id;
  DELETE FROM public.team_stats_cache WHERE season_id = p_season_id;

  FOREACH s IN ARRAY scopes LOOP
    WITH tm AS (
      SELECT m.id AS match_id, w.third, m.team_a_id AS team_id, m.points_a AS points,
             m.scratch_total_a AS scratch, m.hdcp_total_a AS hdcp
      FROM public.matches m JOIN public.weeks w ON w.id = m.week_id
      WHERE w.season_id = p_season_id AND m.status = 'final' AND m.is_bye = false
        AND (s = 'full' OR w.third = substring(s from 7)::int)
      UNION ALL
      SELECT m.id, w.third, m.team_b_id, m.points_b, m.scratch_total_b, m.hdcp_total_b
      FROM public.matches m JOIN public.weeks w ON w.id = m.week_id
      WHERE w.season_id = p_season_id AND m.status = 'final' AND m.is_bye = false
        AND m.team_b_id IS NOT NULL
        AND (s = 'full' OR w.third = substring(s from 7)::int)
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

    WITH tm AS (
      SELECT m.id AS match_id, m.team_a_id AS team_id, m.points_a AS points,
             m.scratch_total_a AS scratch, m.hdcp_total_a AS hdcp
      FROM public.matches m JOIN public.weeks w ON w.id = m.week_id
      WHERE w.season_id = p_season_id AND m.status = 'final' AND m.is_bye = false
        AND (s = 'full' OR w.third = substring(s from 7)::int)
      UNION ALL
      SELECT m.id, m.team_b_id, m.points_b, m.scratch_total_b, m.hdcp_total_b
      FROM public.matches m JOIN public.weeks w ON w.id = m.week_id
      WHERE w.season_id = p_season_id AND m.status = 'final' AND m.is_bye = false
        AND m.team_b_id IS NOT NULL
        AND (s = 'full' OR w.third = substring(s from 7)::int)
    ), mstats AS (
      SELECT team_id, COUNT(*) AS matches, SUM(points) AS points,
             SUM(scratch) AS scratch_pinfall, SUM(hdcp) AS hdcp_pinfall,
             MAX(scratch) AS high_scratch_set, MAX(hdcp) AS high_hdcp_set
      FROM tm GROUP BY team_id
    ), teamgame AS (
      SELECT gc.team_id, gc.match_id, gc.game_number, SUM(gc.scratch_score) AS scratch
      FROM public.v_game_context gc
      WHERE gc.season_id = p_season_id AND gc.match_status = 'final'
        AND (s = 'full' OR gc.third = substring(s from 7)::int)
      GROUP BY gc.team_id, gc.match_id, gc.game_number
    ), gstats AS (
      SELECT team_id, MAX(scratch) AS high_scratch_game FROM teamgame GROUP BY team_id
    ), fstats AS (
      SELECT gc.team_id,
             COUNT(f.id) AS frames,
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
             COUNT(*) FILTER (WHERE f.is_split AND f.outcome = 'spare') AS split_conv
      FROM public.frames f
      JOIN public.v_game_context gc ON gc.game_id = f.game_id
      WHERE gc.season_id = p_season_id AND gc.match_status = 'final' AND gc.is_blind = false
        AND (s = 'full' OR gc.third = substring(s from 7)::int)
      GROUP BY gc.team_id
    )
    INSERT INTO public.team_stats_cache
      (season_id, team_id, scope, matches, points, points_possible, scratch_pinfall, hdcp_pinfall,
       scratch_avg, hdcp_avg, high_scratch_game, high_scratch_set, high_hdcp_set,
       frames, strikes, spares, ten_boxes, opens, spare_attempts,
       first_ball_pins, first_ball_count, first_ball_eight_plus, first_ball_nine_plus,
       splits, split_conversions)
    SELECT p_season_id, t.id, s,
           COALESCE(ms.matches,0), COALESCE(ms.points,0), COALESCE(ms.matches,0) * 7,
           COALESCE(ms.scratch_pinfall,0), COALESCE(ms.hdcp_pinfall,0),
           CASE WHEN COALESCE(ms.matches,0) > 0 THEN ROUND(ms.scratch_pinfall::numeric / (ms.matches * 3), 1) ELSE 0 END,
           CASE WHEN COALESCE(ms.matches,0) > 0 THEN ROUND(ms.hdcp_pinfall::numeric / (ms.matches * 3), 1) ELSE 0 END,
           COALESCE(gs.high_scratch_game,0), COALESCE(ms.high_scratch_set,0), COALESCE(ms.high_hdcp_set,0),
           COALESCE(fs.frames,0), COALESCE(fs.strikes,0), COALESCE(fs.spares,0), COALESCE(fs.ten_boxes,0),
           COALESCE(fs.opens,0), COALESCE(fs.spare_attempts,0),
           COALESCE(fs.fb_pins,0), COALESCE(fs.fb_count,0), COALESCE(fs.fb8,0), COALESCE(fs.fb9,0),
           COALESCE(fs.splits,0), COALESCE(fs.split_conv,0)
    FROM public.teams t
    LEFT JOIN mstats ms ON ms.team_id = t.id
    LEFT JOIN gstats gs ON gs.team_id = t.id
    LEFT JOIN fstats fs ON fs.team_id = t.id
    WHERE t.season_id = p_season_id;

    WITH g AS (
      SELECT gc.* FROM public.v_game_context gc
      WHERE gc.season_id = p_season_id AND gc.match_status = 'final'
        AND gc.is_blind = false AND gc.bowler_id IS NOT NULL
        AND (s = 'full' OR gc.third = substring(s from 7)::int)
    ), gs AS (
      SELECT bowler_id, COUNT(*) AS games, SUM(scratch_score) AS pinfall,
             MAX(scratch_score) AS high_game, MIN(scratch_score) AS low_game
      FROM g GROUP BY bowler_id
    ), sets AS (
      SELECT bowler_id, lineup_id, SUM(scratch_score) AS set_score, COUNT(*) AS n
      FROM g GROUP BY bowler_id, lineup_id
    ), ss AS (
      SELECT bowler_id, COUNT(*) FILTER (WHERE n = 3) AS sets,
             MAX(set_score) FILTER (WHERE n = 3) AS high_set,
             MIN(set_score) FILTER (WHERE n = 3) AS low_set
      FROM sets GROUP BY bowler_id
    ), fr AS (
      SELECT g.bowler_id, f.*, g.week_number, g.game_id AS gid
      FROM public.frames f JOIN g ON g.game_id = f.game_id
    ), fs AS (
      SELECT bowler_id,
             COUNT(*) AS frames,
             COUNT(*) FILTER (WHERE outcome = 'strike') AS strikes,
             COUNT(*) FILTER (WHERE outcome = 'spare') AS spares,
             COUNT(*) FILTER (WHERE outcome = 'ten_box') AS ten_boxes,
             COUNT(*) FILTER (WHERE outcome = 'open') AS opens,
             COUNT(*) FILTER (WHERE outcome NOT IN ('strike','incomplete')) AS spare_attempts,
             COUNT(*) FILTER (WHERE outcome IN ('strike','spare')) AS clean_frames,
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
       split_opens, longest_strike_streak, longest_mark_streak)
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
           COALESCE(strk.longest,0), COALESCE(mrk.longest,0)
    FROM public.bowlers b
    LEFT JOIN gs ON gs.bowler_id = b.id
    LEFT JOIN ss ON ss.bowler_id = b.id
    LEFT JOIN fs ON fs.bowler_id = b.id
    LEFT JOIN dist ON dist.bowler_id = b.id
    LEFT JOIN cg ON cg.bowler_id = b.id
    LEFT JOIN strk ON strk.bowler_id = b.id
    LEFT JOIN mrk ON mrk.bowler_id = b.id
    WHERE b.season_id = p_season_id;
  END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.refresh_season_aggregates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_season_aggregates(uuid) TO authenticated, service_role;