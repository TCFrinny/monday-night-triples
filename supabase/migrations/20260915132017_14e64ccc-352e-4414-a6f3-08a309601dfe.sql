-- 1. Fix ambiguous "i": the PL/pgSQL loop variable i collided with the
--    generate_subscripts(...) alias i inside the standings CTE.
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

    ha := floor(v_pct / 100.0 * GREATEST(0, v_base - a.applicable_average));
    hb := floor(v_pct / 100.0 * GREATEST(0, v_base - b.applicable_average));
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

-- 2. Automatic refresh when a Triples match transitions into (or out of) final.
CREATE OR REPLACE FUNCTION public.matches_singles_refresh()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_season uuid;
BEGIN
  -- transition-sensitive: ignore metadata updates on an already-final match
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status <> 'final' AND OLD.status <> 'final' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'final' THEN
    RETURN NULL;
  END IF;

  SELECT w.season_id INTO v_season FROM public.weeks w WHERE w.id = NEW.week_id;
  IF v_season IS NOT NULL THEN
    PERFORM public.refresh_singles_impl(v_season);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS matches_singles_refresh_trg ON public.matches;
CREATE TRIGGER matches_singles_refresh_trg
AFTER INSERT OR UPDATE OF status ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.matches_singles_refresh();

-- 3. Corrections to an ALREADY-final match: statement-level so a multi-row
--    correction refreshes once. Normal (non-final) score entry never fires.
CREATE OR REPLACE FUNCTION public.bowler_games_singles_refresh()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT w.season_id
    FROM changed_games cg
    JOIN public.match_lineups ml ON ml.id = cg.lineup_id
    JOIN public.matches m ON m.id = ml.match_id
    JOIN public.weeks w ON w.id = m.week_id
    WHERE m.status = 'final'
  LOOP
    PERFORM public.refresh_singles_impl(r.season_id);
  END LOOP;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS bowler_games_singles_refresh_ins ON public.bowler_games;
DROP TRIGGER IF EXISTS bowler_games_singles_refresh_upd ON public.bowler_games;
DROP TRIGGER IF EXISTS bowler_games_singles_refresh_del ON public.bowler_games;

CREATE TRIGGER bowler_games_singles_refresh_ins
AFTER INSERT ON public.bowler_games
REFERENCING NEW TABLE AS changed_games
FOR EACH STATEMENT EXECUTE FUNCTION public.bowler_games_singles_refresh();

CREATE TRIGGER bowler_games_singles_refresh_upd
AFTER UPDATE ON public.bowler_games
REFERENCING NEW TABLE AS changed_games
FOR EACH STATEMENT EXECUTE FUNCTION public.bowler_games_singles_refresh();

CREATE TRIGGER bowler_games_singles_refresh_del
AFTER DELETE ON public.bowler_games
REFERENCING OLD TABLE AS changed_games
FOR EACH STATEMENT EXECUTE FUNCTION public.bowler_games_singles_refresh();

-- 4. Lineup participation / actual bowler changes on a final match.
CREATE OR REPLACE FUNCTION public.match_lineups_singles_refresh()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_season uuid; v_status match_status;
BEGIN
  IF NEW.bowler_id IS NOT DISTINCT FROM OLD.bowler_id
     AND NEW.absent_bowler_id IS NOT DISTINCT FROM OLD.absent_bowler_id
     AND NEW.participation IS NOT DISTINCT FROM OLD.participation
     AND NEW.applicable_average IS NOT DISTINCT FROM OLD.applicable_average THEN
    RETURN NULL;
  END IF;

  SELECT m.status, w.season_id INTO v_status, v_season
  FROM public.matches m JOIN public.weeks w ON w.id = m.week_id
  WHERE m.id = NEW.match_id;

  IF v_status = 'final' AND v_season IS NOT NULL THEN
    PERFORM public.refresh_singles_impl(v_season);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS match_lineups_singles_refresh_trg ON public.match_lineups;
CREATE TRIGGER match_lineups_singles_refresh_trg
AFTER UPDATE ON public.match_lineups
FOR EACH ROW EXECUTE FUNCTION public.match_lineups_singles_refresh();

-- 5. Trigger helpers are not directly callable by clients.
REVOKE ALL ON FUNCTION public.matches_singles_refresh() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bowler_games_singles_refresh() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_lineups_singles_refresh() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_singles_impl(uuid) FROM PUBLIC, anon, authenticated;