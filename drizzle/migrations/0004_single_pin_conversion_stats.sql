ALTER TABLE public.bowler_stats_cache ADD COLUMN single_pin_attempts integer NOT NULL DEFAULT 0, ADD COLUMN single_pin_conversions integer NOT NULL DEFAULT 0;
ALTER TABLE public.team_stats_cache ADD COLUMN single_pin_attempts integer NOT NULL DEFAULT 0, ADD COLUMN single_pin_conversions integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.single_pin_scope_counts(p_season_id uuid, p_third integer, p_week integer)
RETURNS TABLE(team_id uuid, bowler_id uuid, attempts bigint, conversions bigint)
LANGUAGE sql STABLE SET search_path = public AS $sql$
 SELECT gc.team_id, gc.bowler_id, COUNT(*) AS attempts,
        COUNT(*) FILTER (WHERE b2.pins = 1 AND NOT b2.is_blind) AS conversions
 FROM public.v_game_context gc
 JOIN public.matches m ON m.id = gc.match_id
 JOIN public.frames f ON f.game_id = gc.game_id
 JOIN public.balls b1 ON b1.frame_id = f.id AND b1.ball_number = 1
 LEFT JOIN public.balls b2 ON b2.frame_id = f.id AND b2.ball_number = 2
 WHERE gc.season_id = p_season_id AND gc.match_status = 'final' AND NOT m.is_bye
   AND NOT gc.is_blind AND b1.pins = 9 AND NOT b1.is_blind
   AND (p_third IS NULL OR gc.third = p_third)
   AND (p_week IS NULL OR gc.week_number = p_week)
 GROUP BY gc.team_id, gc.bowler_id;
$sql$;
REVOKE ALL ON FUNCTION public.single_pin_scope_counts(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.single_pin_scope_counts(uuid, integer, integer) TO service_role;

-- Preserve the current aggregate implementation verbatim, appending only the
-- new counts in each existing full/third/week scope after cache insertion.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.refresh_season_aggregates_impl(uuid)'::regprocedure) INTO definition;
 IF length(definition) - length(replace(definition, '  END LOOP;', '')) <> length('  END LOOP;') THEN
   RAISE EXCEPTION 'Expected exactly one scope loop terminator; aggregate function not changed';
 END IF;
 definition := replace(definition, '  END LOOP;', $append$
    UPDATE public.bowler_stats_cache cache
    SET single_pin_attempts = counts.attempts::integer,
        single_pin_conversions = counts.conversions::integer
    FROM (
      SELECT bowler_id, SUM(attempts) AS attempts, SUM(conversions) AS conversions
      FROM public.single_pin_scope_counts(p_season_id, v_third, v_week)
      WHERE bowler_id IS NOT NULL GROUP BY bowler_id
    ) counts
    WHERE cache.season_id = p_season_id AND cache.scope = s AND cache.bowler_id = counts.bowler_id;

    UPDATE public.team_stats_cache cache
    SET single_pin_attempts = counts.attempts::integer,
        single_pin_conversions = counts.conversions::integer
    FROM (
      SELECT team_id, SUM(attempts) AS attempts, SUM(conversions) AS conversions
      FROM public.single_pin_scope_counts(p_season_id, v_third, v_week)
      GROUP BY team_id
    ) counts
    WHERE cache.season_id = p_season_id AND cache.scope = s AND cache.team_id = counts.team_id;
  END LOOP;$append$);
 -- Preserve real first-ball attempts in weekly bowler caches even when all
 -- of that week's games were withdrawn (game eligibility remains zero).
 definition := replace(definition,
   'AND (v_week IS NULL OR COALESCE(gs.games,0) > 0);',
   'AND (v_week IS NULL OR COALESCE(gs.games,0) > 0 OR COALESCE(fs.fb_count,0) > 0);');
 EXECUTE definition;
END;
$migration$;