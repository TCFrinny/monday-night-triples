CREATE OR REPLACE FUNCTION public.refresh_singles_impl(p_season_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m record; a record; b record;
  v_base int := 160; v_pct numeric := 80;
  ha int; hb int;
  sa int[]; sb int[]; adja int[]; adjb int[];
  pa numeric; pb numeric; v_idx int;
BEGIN
  SELECT handicap_base, handicap_percent INTO v_base, v_pct
  FROM public.singles_config WHERE season_id = p_season_id;
  IF v_base IS NULL THEN v_base := 160; END IF;
  IF v_pct IS NULL THEN v_pct := 80; END IF;

  DELETE FROM public.singles_results WHERE season_id = p_season_id;
  DELETE FROM public.singles_standings_cache WHERE season_id = p_season_id;

  FOR m IN
    SELECT * FROM public.singles_matches
    WHERE season_id = p_season_id AND is_bye = false AND bowler_b_id IS NOT NULL
  LOOP
    SELECT * INTO a FROM public.singles_side_scores(m.week_id, m.bowler_a_id);
    CONTINUE WHEN NOT FOUND;
    SELECT * INTO b FROM public.singles_side_scores(m.week_id, m.bowler_b_id);
    CONTINUE WHEN NOT FOUND;
    CONTINUE WHEN a.games < 3 OR b.games < 3;

    -- Triples-style: truncate average to a whole pin, then floor the final handicap.
    ha := floor(v_pct / 100.0 * GREATEST(0, v_base - floor(a.applicable_average)));
    hb := floor(v_pct / 100.0 * GREATEST(0, v_base - floor(b.applicable_average)));
    sa := ARRAY[a.g1, a.g2, a.g3];
    sb := ARRAY[b.g1, b.g2, b.g3];
    adja := ARRAY[a.g1 + ha, a.g2 + ha, a.g3 + ha];
    adjb := ARRAY[b.g1 + hb, b.g2 + hb, b.g3 + hb];
    pa := 0; pb := 0;
    FOR v_idx IN 1..3 LOOP
      IF adja[v_idx] > adjb[v_idx] THEN pa := pa + 1;
      ELSIF adjb[v_idx] > adja[v_idx] THEN pb := pb + 1;
      ELSE pa := pa + 0.5; pb := pb + 0.5;
      END IF;
    END LOOP;

    INSERT INTO public.singles_results (
      season_id, week_id, singles_match_id,
      a_bowler_id, a_actual_bowler_id, a_is_sub, a_is_blind, a_applicable_average, a_handicap, a_scratch, a_adjusted, a_points,
      b_bowler_id, b_actual_bowler_id, b_is_sub, b_is_blind, b_applicable_average, b_handicap, b_scratch, b_adjusted, b_points
    ) VALUES (
      p_season_id, m.week_id, m.id,
      m.bowler_a_id, a.actual_bowler_id, a.is_sub, a.is_blind, a.applicable_average, ha, sa, adja, pa,
      m.bowler_b_id, b.actual_bowler_id, b.is_sub, b.is_blind, b.applicable_average, hb, sb, adjb, pb
    );
  END LOOP;

  WITH sides AS (
    SELECT a_bowler_id AS bowler_id, a_points AS points, a_adjusted AS adj, b_adjusted AS opp, a_scratch AS scr
    FROM public.singles_results WHERE season_id = p_season_id
    UNION ALL
    SELECT b_bowler_id, b_points, b_adjusted, a_adjusted, b_scratch
    FROM public.singles_results WHERE season_id = p_season_id
  ), expanded AS (
    SELECT s.bowler_id, s.points,
           (SELECT COALESCE(SUM(x), 0) FROM unnest(s.adj) x) AS adj_total,
           (SELECT COALESCE(SUM(x), 0) FROM unnest(s.scr) x) AS scr_total,
           (SELECT COUNT(*) FROM generate_subscripts(s.adj, 1) gi WHERE s.adj[gi] > s.opp[gi]) AS w,
           (SELECT COUNT(*) FROM generate_subscripts(s.adj, 1) gi WHERE s.adj[gi] < s.opp[gi]) AS l,
           (SELECT COUNT(*) FROM generate_subscripts(s.adj, 1) gi WHERE s.adj[gi] = s.opp[gi]) AS t
    FROM sides s
  ), agg AS (
    SELECT bowler_id, SUM(points) AS points, SUM(w) AS w, SUM(l) AS l, SUM(t) AS t,
           SUM(adj_total)::int AS pinfall, SUM(scr_total)::int AS scratch_pinfall,
           COUNT(*)::int AS matches, (COUNT(*) * 3)::int AS games
    FROM expanded GROUP BY bowler_id
  )
  INSERT INTO public.singles_standings_cache
    (season_id, bowler_id, points, game_wins, game_losses, game_ties, pinfall, scratch_pinfall, matches_played, games, rank)
  SELECT p_season_id, p.bowler_id,
         COALESCE(agg.points, 0), COALESCE(agg.w, 0), COALESCE(agg.l, 0), COALESCE(agg.t, 0),
         COALESCE(agg.pinfall, 0), COALESCE(agg.scratch_pinfall, 0),
         COALESCE(agg.matches, 0), COALESCE(agg.games, 0),
         RANK() OVER (ORDER BY COALESCE(agg.points, 0) DESC, COALESCE(agg.pinfall, 0) DESC)
  FROM public.singles_participants p
  LEFT JOIN agg ON agg.bowler_id = p.bowler_id
  WHERE p.season_id = p_season_id;
END;
$function$;