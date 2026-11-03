import { describe, expect, it } from "vitest";
import { incompleteLineups, lineupPatchFor, priorAveragesBefore, recalcLineupSnapshots, type PriorGameRow } from "./league";

const rows = (id: string, n: number, s: number): PriorGameRow[] =>
  Array.from({ length: n }, (_, i) => ({ bowlerId: id, weekNumber: 1 + Math.floor(i / 3), scratch: s }));
const entry = new Map([["reg", 140], ["est", 110], ["new", 115]]);
const prior = priorAveragesBefore([...rows("reg", 21, 150), ...rows("est", 18, 125), ...rows("new", 9, 130)], 8);
const base = { ready: true, entryAverages: entry, prior, threshold: 15 };

describe("Score Entry sub selection", () => {
  it("rostered -> sub with no replacement: no throw, identity only, no snapshot", () => {
    const p = lineupPatchFor({ ...base, participation: "sub", bowlerId: null, absentId: "reg" });
    expect(p.incomplete).toBe(true);
    expect(p).not.toHaveProperty("applicable_average");
    expect(p).not.toHaveProperty("average_source");
    expect(p).not.toHaveProperty("games_before");
  });
  it("patch never touches scores", () => {
    const p = lineupPatchFor({ ...base, participation: "sub", bowlerId: null, absentId: "reg" });
    expect(Object.keys(p).sort()).toEqual(["absent_bowler_id", "bowler_id", "incomplete", "participation"]);
  });
  it("established sub (15+) gets current average; absent bowler preserved", () => {
    const p = lineupPatchFor({ ...base, participation: "sub", bowlerId: "est", absentId: "reg" });
    expect(p).toMatchObject({ bowler_id: "est", absent_bowler_id: "reg", average_source: "current", applicable_average: 125, games_before: 18 });
  });
  it("sub under 15 gets entry average", () => {
    const p = lineupPatchFor({ ...base, participation: "sub", bowlerId: "new", absentId: "reg" });
    expect(p).toMatchObject({ average_source: "entry", applicable_average: 115, games_before: 9 });
  });
  it("blind uses absent bowler's average", () => {
    const p = lineupPatchFor({ ...base, participation: "blind", bowlerId: null, absentId: "reg" });
    expect(p).toMatchObject({ bowler_id: null, absent_bowler_id: "reg", applicable_average: 150, average_source: "current" });
  });
  it("still refuses to compute while data is loading", () => {
    expect(() => lineupPatchFor({ ...base, ready: false, participation: "sub", bowlerId: "est", absentId: "reg" })).toThrow();
  });
  it("incomplete sub blocks finalization", () => {
    const ls = [
      { slot: 1, participation: "rostered", bowler_id: "a" },
      { slot: 2, participation: "sub", bowler_id: null },
      { slot: 3, participation: "blind", bowler_id: null },
    ];
    expect(incompleteLineups(ls).map((l) => l.slot)).toEqual([2]);
  });
  it("recalc skips incomplete sub row", () => {
    const out = recalcLineupSnapshots({
      ...base,
      lineups: [{ id: "x", participation: "sub", bowler_id: null, absent_bowler_id: "reg", games_before: 0, applicable_average: 140, applicable_average_truncated: 140, average_source: "entry" } as any],
    });
    expect(out).toEqual([]);
  });
});
