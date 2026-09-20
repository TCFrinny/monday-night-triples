# Singles: mid-season participant replacement

## What the live data shows (read-only inspection)

- 56 Singles participants, all enrolled.
- Singles schedule is fully generated for 32 league weeks (weeks 2–17, 19–34), 28 pairings each = 896 matchups. Position weeks 18 and 35 are still pending by design.
- Singles Week 1 (league week 2) is complete: 28 results, all 56 people have a played record, standings has 56 rows.
- Any one person appears in 31 future matchups (weeks 3–34).

## The critical technical fact

Singles results and standings are not stored history — they are rebuilt from scratch every time a recalculation runs (and that now happens automatically whenever a Triples match is finalized or corrected). The rebuild deletes every result for the season and regenerates it from the Singles matchup list plus the Triples scores.

Consequence: whoever is named in a Singles matchup row owns that week's result, permanently and retroactively. So:

- Swapping the outgoing person for the incoming person in **all** matchup rows would silently rewrite completed Week 1 history — the incoming bowler would appear to have bowled Week 1, using the outgoing bowler's Triples scores.
- Manually editing the stored Week 1 result row to "preserve" it would not survive; the next automatic rebuild erases it.

Therefore history can only be preserved by leaving the completed week's matchup rows naming the outgoing bowler, and changing only the not-yet-played weeks.

## The one product decision needed from you

Does the incoming bowler **inherit the seat's record** (starts with the points and pinfall the outgoing bowler earned in Singles Week 1), or **start from zero**?

- **Option A — Start fresh (recommended, and the only option that needs no new data model).** Week 1 stays credited to the outgoing bowler under their own name, forever. The incoming bowler takes over the same schedule slot from the next unplayed Singles week and appears in standings with 0 points / 1 fewer week played. The outgoing bowler stays in the standings with their single completed week.
- **Option B — Inherit the seat's record.** The standings line becomes a "seat" rather than a person (e.g. "Seat 14 — Jane Doe (weeks 1), John Smith (weeks 2+)"), carrying combined points and pinfall. This is a genuinely different abstraction: it needs a new seat concept that matchups, results and standings all key off instead of a bowler ID, plus display rules for a shared line. Substantially larger change.

Everything below assumes Option A unless you tell me otherwise.

## Proposed replacement workflow (Option A)

An admin action in Admin → Singles: **Replace participant**, picking the outgoing bowler, the incoming bowler, and showing the effective week (first Singles week with no results, computed, not typed).

What it does, in one transaction:

1. Validate: outgoing is enrolled, incoming is an active bowler in the season and not already enrolled, and the incoming person is not already an opponent in any affected week (they cannot be scheduled against themselves).
2. Reassign only future matchups: in `singles_matches`, replace the outgoing bowler ID with the incoming bowler ID for weeks at or after the effective week. Completed weeks are untouched. The round-robin pairing structure and matchup IDs survive intact, so no schedule regeneration is needed.
3. Enrollment: add the incoming bowler to `singles_participants`; keep the outgoing bowler enrolled so their completed week still shows a standings line (their remaining weeks are gone, so they simply stop accruing).
4. Recalculate Singles so standings reflect both people correctly.

Safety rails:
- Refuses to touch any week that already has results.
- Refuses if the incoming bowler already has matchups in the affected weeks.
- Shows a preview ("31 future matchups will move from A to B; Week 2 stays with A") and requires confirmation before writing.

## Display consequence to confirm

Under Option A, both people appear in the Singles standings: the outgoing bowler frozen at one completed week, the incoming bowler building from the next week. I'd add a small note on the Singles standings marking a participant who has been replaced ("withdrawn after week N") so the frozen line isn't confusing. Say the word if you'd rather hide withdrawn participants once they have no remaining matchups.

## Technical notes

- No change to `refresh_singles_impl`, `singles_side_scores`, handicap or substitute semantics.
- No change to Triples scores, lineups or match records.
- Data touched: `singles_matches` (future weeks only), `singles_participants` (one insert), plus the derived rebuild of `singles_results` / `singles_standings_cache`.
- Likely a small `replaceSinglesParticipant` helper in `src/lib/singles.ts` (pure: given matchups, results and a cutover week, produce the list of rows to reassign and the validation errors) with unit tests, wired to a new panel in `src/routes/admin.singles.tsx`.
- A database migration is needed only if we add a "withdrawn after week N" marker; otherwise the change is application-side.
