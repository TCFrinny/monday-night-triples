# What happens when you change an entering average

This was a read-only check. Nothing was changed. The plan section at the bottom is optional repair work, for you to decide on.

## Current behavior

1. **What Admin saves:** Only the bowler's entering average is updated. The database step that runs on save does nothing except record the time of the edit. No other database logic uses the entering average.
2. **Stored match averages:** Not changed. When a match is set up, each bowler's average at that time is saved with that match's lineup, and it stays as saved.
3. **Finished matches:** Handicap, points, pinfall and standings are not recalculated. Finishing a match uses the averages saved with the lineup. Reopening and finishing it again still uses those saved averages, not the entering average.
4. **Unfinished matches that are already set up:** These keep the old average. Setup only fills empty lineup spots. The new value is picked up only if an admin changes that spot's player type (Rostered, Sub or Blind) or picks a different bowler, because that re-saves the average.
5. **Future weeks for bowlers under 15 games:** These use the new entering average when their match is set up in Score Entry. The projected handicaps on the upcoming schedule update right away.
6. **Bowlers with 15+ games before a week:** They use their league average, so the entering average has no effect on new matches. Their past matches from before they reached 15 games keep the old value.
7. **Singles:** Singles handicap comes from the average saved with each Triples lineup. Past Singles results do not change, even after a Singles recalculation. Future Singles results follow whatever average their Triples lineup saves.
8. **Stats and league averages:** Unaffected. Only handicap and blind scores depend on it. Blind score = saved average minus the blind deduction, so past blind scores also stay as they were.
9. **Reports:** The All Bowlers "Entering Average" column, bowler profiles and the Bowlers list update right away. Past results do not.
10. **Repair tool:** None exists today. "Recalculate Singles" and the stats refresh both reuse the saved lineup averages. The only manual fix is reopening a match and re-selecting each affected bowler's player type in every past match. This is clumsy and only works on unfinished or reopened matches.

## Main caveat

If you fix the entering average now, every match the bowler already bowled keeps the wrong average. That includes the team handicap, points, blind scores, standings and Singles handicap for those weeks. Those stay wrong until they are repaired by hand.

## Optional follow-up: a repair tool (not built unless approved)

"Correct entering average" button in Admin → Teams/Bowlers:
- Shows every match where this bowler used the entering average, and which finished matches would change: handicap, points, and roll-off effects.
- When you confirm, it updates only the saved averages that came from the entering average. Saved league averages are left alone. Blind lineups that used this bowler's average are included.
- Then it re-finishes the affected matches with the existing finish logic, keeping roll-off decisions. Standings and Singles then update automatically.
- It never changes ball-by-ball scores.

Please tell me whether you want this tool, or would rather correct the average for future weeks only.
