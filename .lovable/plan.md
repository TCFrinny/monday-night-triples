# Fix: established bowlers seeded with entering average

## Findings (read-only)

**Lane changes are not the cause.**
- Admin Schedule lane saves (whole-match and per-game, final or not) only update `matches.lane_pair` / `matches.game_lane_pairs`. Nothing in the schedule page or lane helpers touches `match_lineups`.
- The only database trigger on a lane change refreshes the Lane Data cache. It doesn't recalculate averages and doesn't delete or recreate lineups.
- The prior-games count (`priorAveragesBefore` in `src/lib/league.ts`) filters by bowler and league week only. It never looks at lane pair, and moving a match keeps its week and teams.

**Actual cause: a timing race in Score Entry's automatic lineup setup.**
- When Score Entry opens an unfinished match with no saved lineups, it creates them as soon as the match, season and roster have loaded.
- It does **not** wait for the season's past-games list (`seasonGamesByWeekQuery`) to load. If that list is still loading, every bowler gets 0 prior games, so they're saved with source "entry". The bowlers list isn't waited for either.
- After lineups exist, Score Entry keeps them as saved and never refills them. So a bad snapshot stays until someone changes that slot.

**Live examples**
- Week 8, lanes 25-26 (in progress, lineups created today at 17:52 UTC): all six bowlers were saved with 0 prior games and their entering average:
  - Stevens: 15 games before (league avg 130.33), saved 129 entry
  - Manns: 21 games (136.19), saved 134 entry
  - Roth: 21 games (129.38), saved 139 entry
  - Zimmerman: 18 games (131.44), saved 130 entry
  - Dryer: 21 games (143.90), saved 145 entry
  - (the sixth bowler is under 15 games, so entry is correct for them)
- The match had just been moved to 25-26, which made the lanes look like the cause. The lineups were really created when Score Entry was opened.
- Weeks 2–3 also have many finished lineups saved with 0 games before. These don't change any result because those bowlers were under 15 games anyway.
- Sherry Pokigo, Week 6 (final): saved with 14 games before, but 15 are counted now, so she used entry 121 instead of 118.53. That's probably an earlier game that was corrected after Week 6 was set up. It needs your decision because Week 6 is already finished.

## Fix

1. **Score Entry setup waits for all the data.** Don't create lineups until the past-games list and bowlers list have both loaded successfully. This applies to the automatic setup and to any manual slot change (sub, blind, changing the bowler).
2. **Repair action for unfinished matches.** Add a "Recalculate averages" button on Score Entry for matches that aren't final. It recomputes each saved lineup's prior games, average and source from the same rules, and only changes rows that differ. Bowlers and scores stay as they are.
3. **Fix Week 8 lanes 25-26 now** with that action. The five established bowlers move to their league average.
4. **Week 6 Sherry Pokigo:** no change unless you approve it. A change would need re-finalizing that match, the same way the entering-average correction tool does it.

## Tests

- Setup is held back while past games or bowlers are still loading.
- A bowler with 15+ prior games gets "current" and their league average. One with 14 gets "entry".
- A lane-only change leaves lineups untouched (a metadata-only patch never includes lineup fields).
- The recalculation changes only rows that are wrong.

Then run the full tests, type check and production build, and check Week 8 in the browser.

## Technical details

- `src/routes/admin.entry.$matchId.tsx` seed effect: add guards for `priorGames` and `bowlers` being loaded (check `isSuccess`), and add them to the dependency list. In `appFor`, refuse to run (throw an error) when the data isn't ready, instead of silently returning 0 or entry.
- Put the recalculation in a pure helper in `src/lib/league.ts` (`recomputeLineupSnapshot`) so it can be tested. The button calls it, then updates `match_lineups` and skips final matches.
