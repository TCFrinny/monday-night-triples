import { describe, expect, it } from "vitest";
import {
  canSeedLineups,
  priorAveragesBefore,
  recalcLineupSnapshots,
  snapshotFor,
  type PriorGameRow,
} from "./league";
import { isAverageEligibleGame } from "./blind-games";

const games = (bowlerId: string, n: number, score = 130, fromWeek = 1): PriorGameRow[] =>
  Array.from({ length: n }, (_, i) => ({ bowlerId, weekNumber: fromWeek + Math.floor(i / 3), scratch: score }));

const entry = new Map([["b", 120]]);
const snap = (rows: PriorGameRow[], week = 8) =>
  snapshotFor({ ready: true, bowlerId: "b", entryAverages: entry, prior: priorAveragesBefore(rows, week), threshold: 15 });

describe("established average snapshot", () => {
  it("14 prior games => entry", () => {
    expect(snap(games("b", 14, 140))).toMatchObject({ average_source: "entry", applicable_average: 120, games_before: 14 });
  });
  it("15 prior games => current", () => {
    expect(snap(games("b", 15, 140))).toMatchObject({ average_source: "current", applicable_average: 140, games_before: 15 });
  });
  it("21 prior games => current", () => {
    expect(snap(games("b", 21, 136))).toMatchObject({ average_source: "current", applicable_average: 136, games_before: 21 });
  });
  it("full blind and withdrawn games are not eligible prior games", () => {
    expect(isAverageEligibleGame({ is_blind: true })).toBe(false);
    expect(isAverageEligibleGame({ is_withdrawn: true })).toBe(false);
    const raw = [
      ...Array.from({ length: 14 }, () => ({ is_blind: false, is_withdrawn: false })),
      { is_blind: true, is_withdrawn: false },
      { is_blind: false, is_withdrawn: true },
    ];
    const rows = raw.filter(isAverageEligibleGame).map(() => ({ bowlerId: "b", weekNumber: 1, scratch: 140 }));
    expect(snap(rows).average_source).toBe("entry");
  });
  it("lane pair plays no part: same rows give same result whatever lanes the match used", () => {
    const rows = games("b", 18, 131);
    const a = snap(rows);
    const b = snap(rows.map((r) => ({ ...r, lane_pair: "25-26" }) as PriorGameRow));
    expect(b).toEqual(a);
  });
  it("delayed makeup stays league-week based: Week 1 sees zero prior games", () => {
    expect(snap(games("b", 21, 136, 2), 1)).toMatchObject({ games_before: 0, average_source: "entry" });
  });
  it("refuses to compute while data is loading instead of using 0 games", () => {
    expect(() =>
      snapshotFor({ ready: false, bowlerId: "b", entryAverages: entry, prior: new Map(), threshold: 15 }),
    ).toThrow();
  });
});

describe("auto-seed gate", () => {
  const all = { match: true, season: true, roster: true, bowlers: true, priorGames: true };
  it("waits for prior games", () => {
    expect(canSeedLineups({ ...all, priorGames: false })).toBe(false);
  });
  it("waits for bowlers", () => {
    expect(canSeedLineups({ ...all, bowlers: false })).toBe(false);
  });
  it("runs once everything loaded", () => {
    expect(canSeedLineups(all)).toBe(true);
  });
});

describe("recalcLineupSnapshots", () => {
  it("updates only wrong rows and never returns identity fields", () => {
    const entryAverages = new Map([["est", 134], ["new", 110], ["abs", 125]]);
    const prior = priorAveragesBefore([...games("est", 21, 136), ...games("new", 6, 115), ...games("abs", 15, 128)], 8);
    const lineups = [
      { id: "1", participation: "rostered", bowler_id: "est", absent_bowler_id: null, games_before: 0, applicable_average: 134, applicable_average_truncated: 134, average_source: "entry" },
      { id: "2", participation: "rostered", bowler_id: "new", absent_bowler_id: null, games_before: 6, applicable_average: 110, applicable_average_truncated: 110, average_source: "entry" },
      { id: "3", participation: "blind", bowler_id: null, absent_bowler_id: "abs", games_before: 0, applicable_average: 125, applicable_average_truncated: 125, average_source: "entry" },
    ];
    const changes = recalcLineupSnapshots({ lineups, entryAverages, prior, threshold: 15 });
    expect(changes.map((c) => c.id)).toEqual(["1", "3"]);
    expect(changes[0].after).toEqual({ games_before: 21, applicable_average: 136, applicable_average_truncated: 136, average_source: "current" });
    expect(changes[1].bowlerId).toBe("abs");
    expect(Object.keys(changes[0].after)).not.toContain("bowler_id");
  });
});
