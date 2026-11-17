ALTER TABLE public.team_stats_cache ADD COLUMN team_frames integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.team_frame_scope_counts(p_season_id uuid, p_third integer, p_week integer)
RETURNS TABLE(team_id uuid, team_frames bigint)
LANGUAGE sql STABLE SET search_path = public AS $sql$
 WITH actual_games AS (
   SELECT gc.team_id, gc.match_id, gc.game_number, gc.game_id
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
          ) AS actual_marks
   FROM actual_games a
   CROSS JOIN generate_series(1,10) AS n(frame_number)
   LEFT JOIN public.v_frame_flags f ON f.game_id = a.game_id AND f.frame_number = n.frame_number
   GROUP BY a.team_id, a.match_id, a.game_number, n.frame_number
 )
 SELECT team_id, COUNT(*) FILTER (WHERE actual_bowlers >= 2 AND actual_marks = actual_bowlers)
 FROM numbered_frames GROUP BY team_id;
$sql$;
REVOKE ALL ON FUNCTION public.team_frame_scope_counts(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_frame_scope_counts(uuid, integer, integer) TO service_role;
COMMENT ON COLUMN public.team_stats_cache.team_frames IS 'Same-numbered real strike/spare frames for every actual bowler in a finalized non-bye team game; full-game blinds excluded; at least two actual bowlers required.';

DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.refresh_season_aggregates_impl(uuid)'::regprocedure) INTO definition;
 IF length(definition) - length(replace(definition, '  END LOOP;', '')) <> length('  END LOOP;') THEN
   RAISE EXCEPTION 'Expected exactly one scope loop terminator; aggregate function not changed';
 END IF;
 definition := replace(definition, '  END LOOP;', $append$
    UPDATE public.team_stats_cache cache
    SET team_frames = counts.team_frames::integer
    FROM public.team_frame_scope_counts(p_season_id, v_third, v_week) counts
    WHERE cache.season_id = p_season_id AND cache.scope = s AND cache.team_id = counts.team_id;
  END LOOP;$append$);
 EXECUTE definition;
END;
$migration$;