CREATE OR REPLACE FUNCTION public.team_frame_scope_counts(p_season_id uuid, p_third integer, p_week integer)
RETURNS TABLE(team_id uuid, team_frames bigint)
LANGUAGE sql STABLE SET search_path = public AS $sql$
 WITH actual_games AS (
   SELECT gc.team_id, gc.match_id, gc.game_number, gc.game_id,
          (SELECT MIN(ff.frame_number) FROM public.v_frame_flags ff WHERE ff.game_id=gc.game_id AND ff.any_blind) AS first_blind_frame
   FROM public.v_game_context gc
   WHERE gc.season_id = p_season_id AND gc.match_status = 'final' AND NOT gc.is_bye
     AND NOT gc.is_blind
     AND (p_third IS NULL OR gc.third = p_third)
     AND (p_week IS NULL OR gc.week_number = p_week)
 ), numbered_frames AS (
   SELECT a.team_id, a.match_id, a.game_number, n.frame_number,
          COUNT(DISTINCT a.game_id) AS actual_bowlers,
          COUNT(DISTINCT a.game_id) FILTER (
            WHERE f.outcome IN ('strike', 'spare') AND NOT f.any_blind
              AND (a.first_blind_frame IS NULL OR n.frame_number < a.first_blind_frame)
          ) AS actual_marks
   FROM actual_games a
   CROSS JOIN generate_series(1,10) AS n(frame_number)
   LEFT JOIN public.v_frame_flags f ON f.game_id = a.game_id AND f.frame_number = n.frame_number
   GROUP BY a.team_id, a.match_id, a.game_number, n.frame_number
 )
 SELECT team_id, COUNT(*) FILTER (WHERE actual_bowlers >= 1 AND actual_marks = actual_bowlers)
 FROM numbered_frames GROUP BY team_id;
$sql$;
COMMENT ON COLUMN public.team_stats_cache.team_frames IS 'Team Frames: same-numbered strike/spare frames for every actual bowler, before any first B frame, in finalized non-bye games; full-game blinds excluded; at least one actual required.';