-- ============================================================
-- SINGLES: internal secondary competition attached to Triples weeks
-- ============================================================

CREATE TABLE public.singles_config (
  season_id uuid PRIMARY KEY REFERENCES public.seasons(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  active_weeks integer[] NOT NULL DEFAULT '{}',
  position_weeks integer[] NOT NULL DEFAULT '{18,35}',
  required_week_count integer NOT NULL DEFAULT 34,
  handicap_base integer NOT NULL DEFAULT 160,
  handicap_percent numeric NOT NULL DEFAULT 80,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.singles_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  bowler_id uuid NOT NULL REFERENCES public.bowlers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, bowler_id)
);

CREATE TABLE public.singles_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  week_id uuid NOT NULL REFERENCES public.weeks(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  bowler_a_id uuid NOT NULL REFERENCES public.bowlers(id) ON DELETE CASCADE,
  bowler_b_id uuid REFERENCES public.bowlers(id) ON DELETE CASCADE,
  is_bye boolean NOT NULL DEFAULT false,
  is_position_round boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX singles_matches_week_idx ON public.singles_matches (week_id, sort_order);

CREATE TABLE public.singles_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  week_id uuid NOT NULL REFERENCES public.weeks(id) ON DELETE CASCADE,
  singles_match_id uuid NOT NULL UNIQUE REFERENCES public.singles_matches(id) ON DELETE CASCADE,
  a_bowler_id uuid NOT NULL REFERENCES public.bowlers(id) ON DELETE CASCADE,
  a_actual_bowler_id uuid REFERENCES public.bowlers(id) ON DELETE SET NULL,
  a_is_sub boolean NOT NULL DEFAULT false,
  a_is_blind boolean NOT NULL DEFAULT false,
  a_applicable_average numeric NOT NULL DEFAULT 0,
  a_handicap integer NOT NULL DEFAULT 0,
  a_scratch integer[] NOT NULL DEFAULT '{}',
  a_adjusted integer[] NOT NULL DEFAULT '{}',
  a_points numeric NOT NULL DEFAULT 0,
  b_bowler_id uuid NOT NULL REFERENCES public.bowlers(id) ON DELETE CASCADE,
  b_actual_bowler_id uuid REFERENCES public.bowlers(id) ON DELETE SET NULL,
  b_is_sub boolean NOT NULL DEFAULT false,
  b_is_blind boolean NOT NULL DEFAULT false,
  b_applicable_average numeric NOT NULL DEFAULT 0,
  b_handicap integer NOT NULL DEFAULT 0,
  b_scratch integer[] NOT NULL DEFAULT '{}',
  b_adjusted integer[] NOT NULL DEFAULT '{}',
  b_points numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.singles_standings_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  bowler_id uuid NOT NULL REFERENCES public.bowlers(id) ON DELETE CASCADE,
  points numeric NOT NULL DEFAULT 0,
  game_wins numeric NOT NULL DEFAULT 0,
  game_losses numeric NOT NULL DEFAULT 0,
  game_ties numeric NOT NULL DEFAULT 0,
  pinfall integer NOT NULL DEFAULT 0,
  scratch_pinfall integer NOT NULL DEFAULT 0,
  matches_played integer NOT NULL DEFAULT 0,
  games integer NOT NULL DEFAULT 0,
  rank integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, bowler_id)
);

-- Grants
GRANT SELECT ON public.singles_config TO anon, authenticated;
GRANT SELECT ON public.singles_participants TO anon, authenticated;
GRANT SELECT ON public.singles_matches TO anon, authenticated;
GRANT SELECT ON public.singles_results TO anon, authenticated;
GRANT SELECT ON public.singles_standings_cache TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.singles_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.singles_participants TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.singles_matches TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.singles_results TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.singles_standings_cache TO authenticated;
GRANT ALL ON public.singles_config TO service_role;
GRANT ALL ON public.singles_participants TO service_role;
GRANT ALL ON public.singles_matches TO service_role;
GRANT ALL ON public.singles_results TO service_role;
GRANT ALL ON public.singles_standings_cache TO service_role;

ALTER TABLE public.singles_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.singles_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.singles_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.singles_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.singles_standings_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "singles_config public read" ON public.singles_config FOR SELECT USING (true);
CREATE POLICY "singles_config admin write" ON public.singles_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "singles_participants public read" ON public.singles_participants FOR SELECT USING (true);
CREATE POLICY "singles_participants admin write" ON public.singles_participants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "singles_matches public read" ON public.singles_matches FOR SELECT USING (true);
CREATE POLICY "singles_matches admin write" ON public.singles_matches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "singles_results public read" ON public.singles_results FOR SELECT USING (true);
CREATE POLICY "singles_results admin write" ON public.singles_results FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "singles_standings public read" ON public.singles_standings_cache FOR SELECT USING (true);
CREATE POLICY "singles_standings admin write" ON public.singles_standings_cache FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER singles_config_updated BEFORE UPDATE ON public.singles_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER singles_matches_updated BEFORE UPDATE ON public.singles_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- Resolve the person who actually bowled for a scheduled Singles
-- participant in a Triples week, with THEIR OWN applicable average.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.singles_side_scores(p_week_id uuid, p_bowler uuid)
RETURNS TABLE (
  actual_bowler_id uuid,
  applicable_average numeric,
  is_sub boolean,
  is_blind boolean,
  g1 integer, g2 integer, g3 integer, games integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
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
         (l.participation = 'blind'),
         COALESCE(MAX(bg.scratch_score) FILTER (WHERE bg.game_number = 1), 0)::int,
         COALESCE(MAX(bg.scratch_score) FILTER (WHERE bg.game_number = 2), 0)::int,
         COALESCE(MAX(bg.scratch_score) FILTER (WHERE bg.game_number = 3), 0)::int,
         COUNT(bg.id)::int
  FROM public.bowler_games bg
  WHERE bg.lineup_id = l.id;
END;
$$;

-- ------------------------------------------------------------
-- Recompute all Singles results + standings from finalized Triples data.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_singles_impl(p_season_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  m record; a record; b record;
  v_base int := 160; v_pct numeric := 80;
  ha int; hb int;
  sa int[]; sb int[]; adja int[]; adjb int[];
  pa numeric; pb numeric; i int;
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
    FOR i IN 1..3 LOOP
      IF adja[i] > adjb[i] THEN pa := pa + 1;
      ELSIF adjb[i] > adja[i] THEN pb := pb + 1;
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
           (SELECT COUNT(*) FROM generate_subscripts(s.adj, 1) i WHERE s.adj[i] > s.opp[i]) AS w,
           (SELECT COUNT(*) FROM generate_subscripts(s.adj, 1) i WHERE s.adj[i] < s.opp[i]) AS l,
           (SELECT COUNT(*) FROM generate_subscripts(s.adj, 1) i WHERE s.adj[i] = s.opp[i]) AS t
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
$$;

CREATE OR REPLACE FUNCTION public.refresh_singles(p_season_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  PERFORM public.refresh_singles_impl(p_season_id);
END;
$$;