# Singles handicap: optional alignment with Triples truncation (nothing changed yet)

## Findings (read-only)
- Triples: each bowler's average is first cut down to a whole pin (149.9 -> 149). Team averages are sums of those whole numbers, and team handicap = floor(80% x difference). Rounded down twice; never rounded up.
- Singles (live database and app code agree): handicap = floor(80% x max(0, 160 - average)). The final result is rounded down with floor(), never round(). It uses the **unrounded decimal average** and never cuts it to a whole pin first.
- Live check: in all 280 saved Singles results, handicaps match the decimal-average formula exactly. None were rounded up.
- If averages were cut to whole pins first, 110 of 280 results would get a different handicap, usually 1 pin higher. Example: 121.33 avg -> 0.8 x 38.67 = 30.93 -> **30** today; whole-pin 121 -> 0.8 x 39 = 31.2 -> **31**.
- More examples: 116.5 -> 34.8 -> 34 (whole-pin 116 -> 35.2 -> 35); 131 -> 23.2 -> 23 (both methods give the same result).

## Proposed fix (only if you want Triples-style whole-pin averages)
1. Database Singles refresh: use floor(average) in the handicap math.
2. App helper `singlesHandicap`: apply Math.floor to the average before subtracting; update tests (121.33 -> 31, 116.5 -> 35).
3. Rebuild Singles results and standings. Triples data stays untouched. Report which matchups changed.

If the current behavior is intended (round down only at the end), approve nothing and no change is needed.
