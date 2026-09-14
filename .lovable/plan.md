# Printable Standings and Stats Reports

## Goal
Add four public, browser-printable reports that use the same live season caches, ordering, leaderboard definitions, milestone expansion, and substitute rules as the existing Standings and Stats pages. No database changes or writes.

## Routes and navigation
- Add `/standings/print/full` for full-season standings.
- Add `/standings/print/current-third` for the automatically resolved active third.
- Add `/stats/print/bowlers` for all full-season bowler leaderboard categories.
- Add `/stats/print/teams` for all full-season team leaderboard categories.
- Add compact **Print / Export** actions to the normal Standings and Stats pages; each report opens in a new tab.
- Because `/standings` and `/stats` gain child routes, preserve those URLs by converting each existing route into an `<Outlet />` layout and moving its current page into the matching `.index.tsx` leaf.

## Shared report logic
- Extract the existing finalized-week/current-third calculation into one tested helper and use it on both the normal standings page and printable current-third report.
- Reuse `standingsQuery`, `orderStandingsRows`, record/GB formatting, and the existing cache rank order; include all rows and gracefully handle preseason/empty data.
- Extract the existing leaderboard card rendering/data shaping into shared components so normal Stats and printable Stats use `BOWLER_BOARDS`, `TEAM_BOARDS`, `boardLeaders`, `milestoneBoard`, and `milestoneLeaders` identically.
- Keep ordinary boards at Top 5. Keep milestone boards as Top 5 plus every qualifying event, preserving duplicate performances by event ID, Week N labels, and full-season substitute exclusion for bowlers.

## Printable presentation
- Add a shared report header with live league display name, season name, report title, and latest finalized league week when available.
- Add a screen-only toolbar with Back and **Print / Save PDF**; printing calls the browser print dialog.
- Standings: compact full table with rank, team, matches played, points, W/L, GB, handicap pinfall, and scratch pinfall; omit movement arrows for clarity.
- Stats: compact two-column leaderboard-card layout with cards protected from page splitting.
- Add scoped print CSS: white paper, dark text, subtle borders, no shadows/background effects, repeating table headers, unsplit rows/cards, hidden site header/footer/toolbars.
- Use Letter landscape for standings and the most readable Letter layout for stats (portrait, two columns unless live-data verification shows landscape is clearer).

## Verification
- Add pure tests for finalized-week/current-third scope selection, preseason fallback, ordinary Top 5 shaping, substitute exclusion, and milestone event preservation.
- Browser-check all four routes with live data on screen and under print media emulation; confirm the full standings report renders all 22 teams.
- Run the complete test suite, TypeScript check, and production build.
- Report the exact four URLs, contents/orientation, print instructions, test count, and the readable connector commit SHA.
