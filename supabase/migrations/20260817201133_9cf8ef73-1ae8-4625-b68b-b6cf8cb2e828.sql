-- Individual scratch game performances (one row per bowler game)
CREATE OR REPLACE VIEW public.v_bowler_game_events AS
SELECT gc.game_id AS event_id,
       gc.season_id,
       gc.week_number,
       gc.third,
       gc.bowler_id,
       b.full_name,
       b.slug,
       b.is_sub,
       gc.scratch_score AS score
FROM public.v_game_context gc
JOIN public.bowlers b ON b.id = gc.bowler_id
WHERE gc.match_status = 'final'
  AND gc.is_bye = false
  AND gc.is_blind = false
  AND gc.bowler_id IS NOT NULL;

-- Individual scratch 3-game sets (one row per complete lineup set)
CREATE OR REPLACE VIEW public.v_bowler_set_events AS
SELECT gc.lineup_id AS event_id,
       gc.season_id,
       gc.week_number,
       gc.third,
       gc.bowler_id,
       b.full_name,
       b.slug,
       b.is_sub,
       SUM(gc.scratch_score)::int AS score
FROM public.v_game_context gc
JOIN public.bowlers b ON b.id = gc.bowler_id
WHERE gc.match_status = 'final'
  AND gc.is_bye = false
  AND gc.is_blind = false
  AND gc.bowler_id IS NOT NULL
GROUP BY gc.lineup_id, gc.season_id, gc.week_number, gc.third, gc.bowler_id, b.full_name, b.slug, b.is_sub
HAVING COUNT(*) = 3;

-- Team scratch game totals (one row per team per game of a finalized match)
CREATE OR REPLACE VIEW public.v_team_game_events AS
SELECT (gc.match_id::text || ':' || gc.team_id::text || ':' || gc.game_number::text) AS event_id,
       gc.season_id,
       gc.week_number,
       gc.third,
       gc.team_id,
       t.name,
       t.slug,
       gc.game_number,
       SUM(gc.scratch_score)::int AS score
FROM public.v_game_context gc
JOIN public.teams t ON t.id = gc.team_id
WHERE gc.match_status = 'final'
  AND gc.is_bye = false
GROUP BY gc.match_id, gc.team_id, gc.game_number, gc.season_id, gc.week_number, gc.third, t.name, t.slug;

-- Team scratch set totals (one row per team per finalized match)
CREATE OR REPLACE VIEW public.v_team_set_events AS
SELECT (m.id::text || ':' || m.team_a_id::text) AS event_id,
       w.season_id, w.week_number, w.third,
       m.team_a_id AS team_id, t.name, t.slug,
       m.scratch_total_a AS score
FROM public.matches m
JOIN public.weeks w ON w.id = m.week_id
JOIN public.teams t ON t.id = m.team_a_id
WHERE m.status = 'final' AND m.is_bye = false
UNION ALL
SELECT (m.id::text || ':' || m.team_b_id::text),
       w.season_id, w.week_number, w.third,
       m.team_b_id, t.name, t.slug,
       m.scratch_total_b
FROM public.matches m
JOIN public.weeks w ON w.id = m.week_id
JOIN public.teams t ON t.id = m.team_b_id
WHERE m.status = 'final' AND m.is_bye = false AND m.team_b_id IS NOT NULL;

GRANT SELECT ON public.v_bowler_game_events TO anon, authenticated;
GRANT SELECT ON public.v_bowler_set_events TO anon, authenticated;
GRANT SELECT ON public.v_team_game_events TO anon, authenticated;
GRANT SELECT ON public.v_team_set_events TO anon, authenticated;