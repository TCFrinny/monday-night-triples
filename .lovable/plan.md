# Singles handicap audit and update check (read-only, nothing to build)

## Update status
- Latest commit is dd74c6f, and every change is saved. That commit only changed the database, not page code.
- Database: 280 Singles results were rebuilt at 13:50 UTC. Every saved handicap matches the new formula (0 mismatches).
- The preview and the duckpins.workers.dev /singles page show the same standings (DeAntoniis 21, Zimmerman 20, Dryer 19.5...). Production reads the same live data, so it does not need a redeploy.
- Most likely cause: a page left open or cached from before 13:50 UTC. A hard refresh should fix it.

## Old vs new reconstruction
How it was rebuilt: each result's adjusted scores were rolled back to the old handicap. Ranking uses points, then handicap pinfall, the same way the site ranks.
The totals match the earlier audit: 144 side handicaps, 110 matchups, 8 flipped games, 14 point changes and 25 rank changes (52 bowlers' handicaps changed).

### 1) Handicap changes (bowler | old->new | matchups changed)
- Barnes, Marty | 27->28, 30->31 | 3
- Blake, Issac | 22->23, 23->24 | 5
- Brooks, Denise | 29->30, 30->31, 31->32 | 3
- Brooks, Walt | 18->19, 22->23 | 2
- Bull, Steve | 15->16, 17->18 | 2
- Caprinolo, Dom | 20->21, 22->23 | 3
- Collison, Billy | 18->19 | 2
- Cook, Chuck | 11->12, 13->14, 15->16 | 3
- DeAntoniis, Colby | 9->10, 11->12 | 3
- DeAntoniis, John | 9->10 | 1
- DeAntoniis, Noelle | 23->24 | 2
- DeGraff, Paul | 17->18, 19->20, 22->23, 23->24 | 5
- Deck, Rob | 29->30, 30->31, 31->32, 32->33 | 6
- Dix, Phil | 15->16 | 1
- Dryer, Steve | 11->12, 12->13 | 2
- Fargason, Scott | 29->30, 30->31, 31->32 | 4
- Fellas, John | 25->26, 26->27 | 2
- Fink, Josh | 15->16, 16->17 | 2
- Geho, Leo | 21->22, 22->23, 23->24 | 4
- Gruss, Bob | 25->26, 26->27, 27->28 | 4
- Hanley, Rob | 15->16, 16->17 | 2
- Helferstay, Eddie | 19->20 | 3
- Huber, Lisa | 13->14, 15->16, 18->19 | 4
- Karabelas, Yana | 35->36 | 1
- Keith, Ray | 22->23, 23->24 | 4
- Kohlhepp, Denise | 43->44, 44->45 | 4
- Kowalewski, Mike | 15->16, 16->17 | 2
- Kropfelder, Debbie | 41->42 | 1
- Leon, Joyce | 26->27, 27->28, 29->30 | 4
- Lipka, Larry | 22->23 | 2
- Lloyd, Nick | 19->20 | 2
- Manns, Mike | 15->16 | 3
- Matheson, Carrie | 21->22, 22->23 | 3
- Mauk, Scott | 15->16 | 1
- McGinley, Jason | 19->20 | 1
- Morris, Trina | 27->28 | 1
- Neil, George | 16->17, 18->19 | 2
- Paris, Chuck | 22->23, 23->24 | 3
- Peach, Brian | 30->31, 31->32 | 2
- Ripley, Cody | 25->26, 26->27, 27->28, 28->29 | 4
- Roth, Chris | 23->24, 26->27 | 3
- Sauter, Janet | 35->36 | 2
- Schline, Abbey | 26->27 | 2
- Stewart, Justin | 20->21, 23->24, 24->25 | 3
- Thomas, Billy | 16->17, 19->20 | 3
- Wander, Dave | 23->24 | 1
- Warehime, Matt | 23->24, 25->26 | 4
- Watson, Brandon | 18->19, 22->23, 26->27 | 4
- Watson, Keith | 28->29 | 1
- Webb, Glenn | 27->28, 29->30, 30->31 | 5
- Welling, Andy | 15->16, 17->18 | 4
- Zimmerman, Jenna | 22->23, 23->24 | 4

### 2) Points changed (old -> new)
- Barnes, Marty | 17 -> 17.5
- Caprinolo, Dom | 12.5 -> 12
- DeAntoniis, John | 17.5 -> 17
- Fink, Josh | 17 -> 17.5
- Green, Jon | 13.5 -> 13
- Hanley, Rob | 13 -> 12.5
- Huber, Lisa | 13.5 -> 14
- Kropfelder, Debbie | 14 -> 14.5
- Manns, Mike | 16 -> 16.5
- McGinley, Jason | 14 -> 13.5
- Morris, Trina | 9 -> 8.5
- Peach, Brian | 14.5 -> 15
- Sauter, Janet | 10.5 -> 10
- Welling, Andy | 18.5 -> 19
- Note: Keith Watson had one tie become a loss and one loss become a tie, so his points stayed the same.

### 3) Rank changed (old -> new)
- Welling, Andy | 6 -> 5
- Helferstay, Eddie | 5 -> 6
- Fink, Josh | 10 -> 7
- Barnes, Marty | 14 -> 9
- Cook, Brandon | 9 -> 10
- DeAntoniis, John | 7 -> 11
- Bull, Steve | 11 -> 12
- Fellas, John | 12 -> 13
- Fargason, Scott | 13 -> 14
- Manns, Mike | 17 -> 16
- Paris, Chuck | 16 -> 17
- Peach, Brian | 32 -> 31
- Huber, John | 31 -> 32
- Kropfelder, Debbie | 37 -> 33
- Huber, Lisa | 43 -> 37
- McGinley, Jason | 33 -> 38
- Watson, Brandon | 44 -> 43
- Green, Jon | 38 -> 44
- Leon, Joyce | 46 -> 45
- Dix, Phil | 47 -> 46
- Hanley, Rob | 45 -> 47
- Mitchell, Noah | 49 -> 48
- Ripley, Cody | 50 -> 49
- Thomas, Billy | 51 -> 50
- Caprinolo, Dom | 48 -> 51

### 4) Flipped games (old -> new)
- Week 7 G3: Barnes, Marty vs Caprinolo, Dom: Caprinolo, Dom -> tie
- Week 7 G2: DeAntoniis, John vs Welling, Andy: tie -> Welling, Andy
- Week 7 G3: Hanley, Rob vs Peach, Brian: tie -> Peach, Brian
- Week 10 G1: Fink, Josh vs Watson, Keith: Watson, Keith -> tie
- Week 10 G1: Huber, Lisa vs Sauter, Janet: tie -> Huber, Lisa
- Week 10 G2: Kropfelder, Debbie vs Morris, Trina: tie -> Kropfelder, Debbie
- Week 11 G2: Green, Jon vs Watson, Keith: tie -> Watson, Keith
- Week 11 G1: Manns, Mike vs McGinley, Jason: tie -> Manns, Mike

## Code line count (commit ea95fb30cc6acbd4078e90c24a3774d003e0f370)
Counts are physical lines from saved project files only. Excluded: lockfiles, routeTree.gen.ts, generated database types, migration snapshot and journal files (11 generated files, 2,693 lines), images, and docs/memory/roadmap.
| Category | Files | Lines |
|---|---|---|
| TypeScript/TSX app source (src, including UI kit) | 127 | 16,783 |
| SQL migrations | 36 | 4,909 |
| Tests (.test.ts/.tsx) | 31 | 3,858 |
| CSS | 1 | 269 |
| Config/build (package.json, vite, wrangler, tsconfig, eslint, etc.) | 15 | 304 |
| **Total** | **210** | **26,123** |
Project code without tests or config: 21,961 lines (app source + SQL + CSS).
