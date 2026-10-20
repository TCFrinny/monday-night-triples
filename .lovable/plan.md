# Per-game lane pairs (findings + recommendation, nothing changed)

## Findings
1. Yes. `matches.lane_pair` is the only stored lane value. No other table has a lane column (only `seasons.starting_lane_number` and the cache).
2. Yes. `refresh_lane_aggregates_impl` reads `v_game_context`, which takes `m.lane_pair` for every game. All 3 games of every bowler land on the match's single pair.
3. No per-game lane field exists anywhere (`bowler_games`, `frames`, `match_lineups` have none).

## Recommendation (smallest robust model)
Add one nullable JSON column on `matches`: `game_lane_pairs` jsonb, default `{}`, e.g. `{"3": "41-42"}`.
- `matches.lane_pair` stays the primary/whole-match pair. Schedule, Score Entry and public sorting keep using it unchanged.
- A game's actual pair = `game_lane_pairs[game_number]` if set, otherwise `lane_pair`. Empty map = today's behaviour.
- Only matches store it (the two teams bowl each game on the same pair), so no per-bowler data, no score tables touched.
- Duplicates stay allowed: no uniqueness constraint added.

Why not a `matches_games` table or a column on `bowler_games`: a table adds joins/RLS for 3 values; a `bowler_games` column would repeat the same value 6 times per game and could disagree.

## Lane Data
- `v_game_context.lane_pair` becomes `COALESCE(m.game_lane_pairs ->> g.game_number::text, m.lane_pair)` (append-only view change, same column name), so the existing aggregate attributes each game to its actual pair with no other SQL change.
- Extend the `matches_lane_pair_refresh` trigger to also fire when `game_lane_pairs` changes, so corrections on finalized matches rebuild Lane Data.
- One-off backfill call not needed (all maps start empty).

## Admin UX (Admin → Schedule week editor)
- Keep the current "Actual lanes" field per match (whole-match override).
- Add a small "Per game" toggle on that row revealing G1/G2/G3 inputs, prefilled with the actual pair; blank = same as the match pair. Saved only when different.
- Row shows a badge like "G3: 41-42". Public schedule/match page can show the same note.
- Allowed on finalized (locked) rows: saving writes only `lane_pair`/`game_lane_pairs` and never calls finalization, so scores and points are untouched. Validation reuses `parseLanePair`.

## Technical details
- Migration: `ALTER TABLE matches ADD COLUMN game_lane_pairs jsonb NOT NULL DEFAULT '{}'`; check constraint keys in ('1','2','3'); `CREATE OR REPLACE VIEW v_game_context` with COALESCE; update trigger condition.
- Pure helper `gameLanePair(match, n)` + `validateGameLanePairs` in `src/lib/lane-slots.ts` with tests (override, fallback, blank cleared, malformed rejected, duplicates allowed).
- Schedule save in `admin.schedule.tsx` writes the map alongside `lane_pair`; sorting unchanged (`compareByActualLane` on primary pair).
- Verify: Lane Data test match with G3 override shows 1/3 of its games on the second pair; finalized match points/totals identical before/after.
