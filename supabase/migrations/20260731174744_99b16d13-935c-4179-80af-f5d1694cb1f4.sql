-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.participation_type AS ENUM ('rostered', 'sub', 'blind');
CREATE TYPE public.match_status AS ENUM ('scheduled', 'in_progress', 'final');
CREATE TYPE public.average_source AS ENUM ('entry', 'current');
CREATE TYPE public.frame_outcome AS ENUM ('strike', 'spare', 'ten_box', 'open', 'incomplete');

-- ============ SHARED ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ SEASONS ============
CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_name text NOT NULL DEFAULT 'Monday Night Triples',
  sponsor text,
  display_name text NOT NULL DEFAULT 'Monday Night Triples',
  logo_url text,
  center_name text NOT NULL DEFAULT 'AMF Dundalk',
  season_name text NOT NULL,
  team_count integer NOT NULL DEFAULT 20,
  total_weeks integer NOT NULL DEFAULT 36,
  position_round_weeks integer[] NOT NULL DEFAULT '{12,24,36}',
  third_boundaries integer[] NOT NULL DEFAULT '{12,24,36}',
  handicap_percent numeric NOT NULL DEFAULT 80,
  establishment_threshold integer NOT NULL DEFAULT 15,
  blind_deduction integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seasons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT ALL ON public.seasons TO service_role;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seasons public read" ON public.seasons FOR SELECT USING (true);
CREATE POLICY "seasons admin write" ON public.seasons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER seasons_updated BEFORE UPDATE ON public.seasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TEAMS ============
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, slug)
);
GRANT SELECT ON public.teams TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams public read" ON public.teams FOR SELECT USING (true);
CREATE POLICY "teams admin write" ON public.teams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER teams_updated BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ BOWLERS ============
CREATE TABLE public.bowlers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  slug text NOT NULL,
  entry_average numeric NOT NULL DEFAULT 0,
  is_sub boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, slug)
);
GRANT SELECT ON public.bowlers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bowlers TO authenticated;
GRANT ALL ON public.bowlers TO service_role;
ALTER TABLE public.bowlers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bowlers public read" ON public.bowlers FOR SELECT USING (true);
CREATE POLICY "bowlers admin write" ON public.bowlers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER bowlers_updated BEFORE UPDATE ON public.bowlers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ROSTER SPOTS ============
CREATE TABLE public.roster_spots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  bowler_id uuid NOT NULL REFERENCES public.bowlers(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 3),
  effective_from_week integer NOT NULL DEFAULT 1,
  effective_to_week integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX roster_spots_team_idx ON public.roster_spots(team_id, slot);
GRANT SELECT ON public.roster_spots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_spots TO authenticated;
GRANT ALL ON public.roster_spots TO service_role;
ALTER TABLE public.roster_spots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roster public read" ON public.roster_spots FOR SELECT USING (true);
CREATE POLICY "roster admin write" ON public.roster_spots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER roster_updated BEFORE UPDATE ON public.roster_spots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ WEEKS ============
CREATE TABLE public.weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  bowl_date date,
  third smallint NOT NULL DEFAULT 1,
  is_position_round boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, week_number)
);
GRANT SELECT ON public.weeks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weeks TO authenticated;
GRANT ALL ON public.weeks TO service_role;
ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weeks public read" ON public.weeks FOR SELECT USING (true);
CREATE POLICY "weeks admin write" ON public.weeks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER weeks_updated BEFORE UPDATE ON public.weeks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ MATCHES ============
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES public.weeks(id) ON DELETE CASCADE,
  lane_pair text,
  sort_order integer NOT NULL DEFAULT 0,
  team_a_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  team_b_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  is_bye boolean NOT NULL DEFAULT false,
  status public.match_status NOT NULL DEFAULT 'scheduled',
  team_a_average integer,
  team_b_average integer,
  handicap_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  handicap_pins integer NOT NULL DEFAULT 0,
  points_a numeric NOT NULL DEFAULT 0,
  points_b numeric NOT NULL DEFAULT 0,
  scratch_total_a integer NOT NULL DEFAULT 0,
  scratch_total_b integer NOT NULL DEFAULT 0,
  hdcp_total_a integer NOT NULL DEFAULT 0,
  hdcp_total_b integer NOT NULL DEFAULT 0,
  game_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX matches_week_idx ON public.matches(week_id);
GRANT SELECT ON public.matches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches public read" ON public.matches FOR SELECT USING (true);
CREATE POLICY "matches admin write" ON public.matches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER matches_updated BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ MATCH LINEUPS ============
CREATE TABLE public.match_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 3),
  bowler_id uuid REFERENCES public.bowlers(id) ON DELETE SET NULL,
  absent_bowler_id uuid REFERENCES public.bowlers(id) ON DELETE SET NULL,
  participation public.participation_type NOT NULL DEFAULT 'rostered',
  applicable_average numeric NOT NULL DEFAULT 0,
  applicable_average_truncated integer NOT NULL DEFAULT 0,
  average_source public.average_source NOT NULL DEFAULT 'entry',
  games_before integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, team_id, slot)
);
CREATE INDEX match_lineups_match_idx ON public.match_lineups(match_id);
CREATE INDEX match_lineups_bowler_idx ON public.match_lineups(bowler_id);
GRANT SELECT ON public.match_lineups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_lineups TO authenticated;
GRANT ALL ON public.match_lineups TO service_role;
ALTER TABLE public.match_lineups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lineups public read" ON public.match_lineups FOR SELECT USING (true);
CREATE POLICY "lineups admin write" ON public.match_lineups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER lineups_updated BEFORE UPDATE ON public.match_lineups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ GAMES ============
CREATE TABLE public.bowler_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id uuid NOT NULL REFERENCES public.match_lineups(id) ON DELETE CASCADE,
  game_number smallint NOT NULL CHECK (game_number BETWEEN 1 AND 3),
  scratch_score integer NOT NULL DEFAULT 0,
  is_blind boolean NOT NULL DEFAULT false,
  is_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lineup_id, game_number)
);
GRANT SELECT ON public.bowler_games TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bowler_games TO authenticated;
GRANT ALL ON public.bowler_games TO service_role;
ALTER TABLE public.bowler_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games public read" ON public.bowler_games FOR SELECT USING (true);
CREATE POLICY "games admin write" ON public.bowler_games FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER games_updated BEFORE UPDATE ON public.bowler_games
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ FRAMES ============
CREATE TABLE public.frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.bowler_games(id) ON DELETE CASCADE,
  frame_number smallint NOT NULL CHECK (frame_number BETWEEN 1 AND 10),
  outcome public.frame_outcome NOT NULL DEFAULT 'incomplete',
  frame_score integer NOT NULL DEFAULT 0,
  cumulative_score integer NOT NULL DEFAULT 0,
  is_split boolean NOT NULL DEFAULT false,
  split_converted boolean NOT NULL DEFAULT false,
  first_ball_pins integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, frame_number)
);
CREATE INDEX frames_game_idx ON public.frames(game_id);
GRANT SELECT ON public.frames TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frames TO authenticated;
GRANT ALL ON public.frames TO service_role;
ALTER TABLE public.frames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frames public read" ON public.frames FOR SELECT USING (true);
CREATE POLICY "frames admin write" ON public.frames FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ BALLS ============
CREATE TABLE public.balls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_id uuid NOT NULL REFERENCES public.frames(id) ON DELETE CASCADE,
  ball_number smallint NOT NULL CHECK (ball_number BETWEEN 1 AND 3),
  pins integer NOT NULL CHECK (pins BETWEEN 0 AND 10),
  is_split boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (frame_id, ball_number)
);
CREATE INDEX balls_frame_idx ON public.balls(frame_id);
GRANT SELECT ON public.balls TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balls TO authenticated;
GRANT ALL ON public.balls TO service_role;
ALTER TABLE public.balls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "balls public read" ON public.balls FOR SELECT USING (true);
CREATE POLICY "balls admin write" ON public.balls FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ ANNOUNCEMENTS ============
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements public read" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "announcements admin write" ON public.announcements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER announcements_updated BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ DERIVED SUMMARY CACHES ============
CREATE TABLE public.team_standings_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  scope text NOT NULL,
  points numeric NOT NULL DEFAULT 0,
  hdcp_pinfall integer NOT NULL DEFAULT 0,
  scratch_pinfall integer NOT NULL DEFAULT 0,
  matches_played integer NOT NULL DEFAULT 0,
  rank integer NOT NULL DEFAULT 0,
  previous_rank integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, team_id, scope)
);
GRANT SELECT ON public.team_standings_cache TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_standings_cache TO authenticated;
GRANT ALL ON public.team_standings_cache TO service_role;
ALTER TABLE public.team_standings_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "standings public read" ON public.team_standings_cache FOR SELECT USING (true);
CREATE POLICY "standings admin write" ON public.team_standings_cache FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.bowler_stats_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  bowler_id uuid NOT NULL REFERENCES public.bowlers(id) ON DELETE CASCADE,
  scope text NOT NULL,
  games integer NOT NULL DEFAULT 0,
  sets integer NOT NULL DEFAULT 0,
  pinfall integer NOT NULL DEFAULT 0,
  average numeric NOT NULL DEFAULT 0,
  high_game integer NOT NULL DEFAULT 0,
  low_game integer NOT NULL DEFAULT 0,
  high_set integer NOT NULL DEFAULT 0,
  low_set integer NOT NULL DEFAULT 0,
  frames integer NOT NULL DEFAULT 0,
  strikes integer NOT NULL DEFAULT 0,
  spares integer NOT NULL DEFAULT 0,
  ten_boxes integer NOT NULL DEFAULT 0,
  opens integer NOT NULL DEFAULT 0,
  spare_attempts integer NOT NULL DEFAULT 0,
  clean_frames integer NOT NULL DEFAULT 0,
  clean_games integer NOT NULL DEFAULT 0,
  first_ball_pins integer NOT NULL DEFAULT 0,
  first_ball_count integer NOT NULL DEFAULT 0,
  first_ball_eight_plus integer NOT NULL DEFAULT 0,
  first_ball_nine_plus integer NOT NULL DEFAULT 0,
  first_ball_dist jsonb NOT NULL DEFAULT '{}'::jsonb,
  splits integer NOT NULL DEFAULT 0,
  split_conversions integer NOT NULL DEFAULT 0,
  split_ten_boxes integer NOT NULL DEFAULT 0,
  split_opens integer NOT NULL DEFAULT 0,
  longest_strike_streak integer NOT NULL DEFAULT 0,
  longest_mark_streak integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, bowler_id, scope)
);
GRANT SELECT ON public.bowler_stats_cache TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bowler_stats_cache TO authenticated;
GRANT ALL ON public.bowler_stats_cache TO service_role;
ALTER TABLE public.bowler_stats_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bowler stats public read" ON public.bowler_stats_cache FOR SELECT USING (true);
CREATE POLICY "bowler stats admin write" ON public.bowler_stats_cache FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.team_stats_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  scope text NOT NULL,
  matches integer NOT NULL DEFAULT 0,
  points numeric NOT NULL DEFAULT 0,
  points_possible numeric NOT NULL DEFAULT 0,
  game_points numeric NOT NULL DEFAULT 0,
  set_points numeric NOT NULL DEFAULT 0,
  scratch_pinfall integer NOT NULL DEFAULT 0,
  hdcp_pinfall integer NOT NULL DEFAULT 0,
  scratch_avg numeric NOT NULL DEFAULT 0,
  hdcp_avg numeric NOT NULL DEFAULT 0,
  high_scratch_game integer NOT NULL DEFAULT 0,
  high_hdcp_game integer NOT NULL DEFAULT 0,
  high_scratch_set integer NOT NULL DEFAULT 0,
  high_hdcp_set integer NOT NULL DEFAULT 0,
  frames integer NOT NULL DEFAULT 0,
  strikes integer NOT NULL DEFAULT 0,
  spares integer NOT NULL DEFAULT 0,
  ten_boxes integer NOT NULL DEFAULT 0,
  opens integer NOT NULL DEFAULT 0,
  spare_attempts integer NOT NULL DEFAULT 0,
  first_ball_pins integer NOT NULL DEFAULT 0,
  first_ball_count integer NOT NULL DEFAULT 0,
  first_ball_eight_plus integer NOT NULL DEFAULT 0,
  first_ball_nine_plus integer NOT NULL DEFAULT 0,
  splits integer NOT NULL DEFAULT 0,
  split_conversions integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, team_id, scope)
);
GRANT SELECT ON public.team_stats_cache TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_stats_cache TO authenticated;
GRANT ALL ON public.team_stats_cache TO service_role;
ALTER TABLE public.team_stats_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team stats public read" ON public.team_stats_cache FOR SELECT USING (true);
CREATE POLICY "team stats admin write" ON public.team_stats_cache FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ BASE VIEWS ============
CREATE OR REPLACE VIEW public.v_game_context AS
SELECT g.id AS game_id, g.lineup_id, g.game_number, g.scratch_score, g.is_blind,
       l.bowler_id, l.team_id, l.participation, l.match_id,
       m.week_id, m.status AS match_status,
       w.season_id, w.week_number, w.third
FROM public.bowler_games g
JOIN public.match_lineups l ON l.id = g.lineup_id
JOIN public.matches m ON m.id = l.match_id
JOIN public.weeks w ON w.id = m.week_id;

GRANT SELECT ON public.v_game_context TO anon, authenticated, service_role;

-- ============ AGGREGATE REFRESH ============
CREATE OR REPLACE FUNCTION public.refresh_season_aggregates(p_season_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s text;
  scopes text[] := ARRAY['full','third_1','third_2','third_3'];
BEGIN
  DELETE FROM public.team_standings_cache WHERE season_id = p_season_id;
  DELETE FROM public.bowler_stats_cache WHERE season_id = p_season_id;
  DELETE FROM public.team_stats_cache WHERE season_id = p_season_id;

  FOREACH s IN ARRAY scopes LOOP
    -- team match rows (one row per team per finalized match)
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

    -- team ball/aggregate stats
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
    ), gstats AS (
      SELECT gc.team_id,
             MAX(teamgame.scratch) AS high_scratch_game
      FROM (
        SELECT gc2.team_id, gc2.match_id, gc2.game_number, SUM(gc2.scratch_score) AS scratch
        FROM public.v_game_context gc2
        WHERE gc2.season_id = p_season_id AND gc2.match_status = 'final'
          AND (s = 'full' OR gc2.third = substring(s from 7)::int)
        GROUP BY gc2.team_id, gc2.match_id, gc2.game_number
      ) teamgame
      JOIN public.v_game_context gc ON gc.team_id = teamgame.team_id
      GROUP BY gc.team_id
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

    -- bowler stats (blinds excluded)
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
             COUNT(*) FILTER (WHERE is_split AND outcome = 'open') AS split_open,
             jsonb_object_agg(COALESCE(first_ball_pins, -1)::text, cnt) FILTER (WHERE false) AS dummy
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

REVOKE ALL ON FUNCTION public.refresh_season_aggregates(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_season_aggregates(uuid) TO authenticated, service_role;