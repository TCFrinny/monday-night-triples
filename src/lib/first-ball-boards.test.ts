import { describe, expect, it } from "vitest";
import { BOWLER_BOARDS, TEAM_BOARDS, boardLeaders, type Leader } from "./leaderboards";
import { PARTICIPATION_EXEMPT_BOARDS, participationMinimums } from "./participation";
import { accumulateFrameStats, emptyStatTotals, scoreGame, type Frame } from "./duckpin";

function board(key: string): Leader {
  const found = [...BOWLER_BOARDS, ...TEAM_BOARDS].find((b) => b.key === key);
  if (!found) throw new Error(`Missing board ${key}`);
  return found;
}
const row = (id: string, makes: number, attempts: number, games = 14, sub = false) => ({
  bowler_id: id, games, bowlers: { is_sub: sub }, first_ball_count: attempts,
  first_ball_eight_plus: makes, first_ball_nine_plus: makes,
});

describe.each(["fb8", "fb9", "tfb8", "tfb9"])("%s first-ball board", (key) => {
  it("uses the exact formula and shared two-decimal formatter", () => {
    expect(board(key).value(row("a", 8, 10))).toBe(80);
    expect(board(key).fmt?.(row("a", 8, 10))).toBe("80.00%");
    expect(board(key).value(row("a", 2, 3))).toBe((2 / 3) * 100);
    expect(board(key).fmt?.(row("a", 2, 3))).toBe("66.67%");
  });
  it("excludes zero first-ball attempts", () => {
    expect(boardLeaders(board(key), [row("zero", 0, 0)])).toEqual([]);
  });
  it("orders exact percentage ties by makes descending, then stable order", () => {
    const rows = [row("small", 1, 2), row("large", 10, 20), row("same", 10, 20)];
    expect(boardLeaders(board(key), rows).map((r) => r.bowler_id)).toEqual(["large", "same", "small"]);
  });
  it("uses the corresponding makes count, not the other threshold", () => {
    const eight = key.endsWith("8");
    const rows = [
      { ...row("small", 1, 2), [eight ? "first_ball_nine_plus" : "first_ball_eight_plus"]: 100 },
      row("large", 10, 20),
    ];
    expect(boardLeaders(board(key), rows)[0]?.bowler_id).toBe("large");
  });
  it("includes all exact primary cutoff ties regardless of makes", () => {
    const rows = [row("a", 10, 10), row("b", 9, 10), row("c", 8, 10), row("d", 7, 10), row("small", 3, 5), row("large", 60, 100)];
    expect(boardLeaders(board(key), rows).map((r) => r.bowler_id)).toEqual(["a", "b", "c", "d", "large", "small"]);
  });
  it("does not tie distinct ratios with the same displayed percentage", () => {
    const rows = [row("a", 10, 10), row("b", 9, 10), row("c", 8, 10), row("d", 7, 10), row("higher", 50001, 100000), row("lower", 1, 2)];
    expect(board(key).fmt?.(rows[4])).toBe("50.00%");
    expect(board(key).fmt?.(rows[5])).toBe("50.00%");
    expect(boardLeaders(board(key), rows).map((r) => r.bowler_id)).toEqual(["a", "b", "c", "d", "higher"]);
  });
});

describe.each(["fb8", "fb9"])("%s individual participation", (key) => {
  it.each(["full", "third_1"] as const)("enforces 2/3 of 21 team opportunities in %s", (scope) => {
    const matches = Array.from({ length: 7 }, (_, i) => ({ status: "final", is_bye: false, team_a_id: "team", weeks: { week_number: i + 1, third: 1 } }));
    const rosters = ["late", "qualified"].map((bowler_id) => ({ bowler_id, team_id: "team", effective_from_week: 6, effective_to_week: null }));
    const minGames = participationMinimums(matches, rosters, scope);
    expect(minGames.get("late")).toBe(14);
    expect(boardLeaders(board(key), [row("late", 9, 10, 6), row("qualified", 8, 10, 14)], 5, { minGames }).map((r) => r.bowler_id)).toEqual(["qualified"]);
  });
  it("weekly stays ungated and includes subs only when explicitly enabled", () => {
    const rows = [row("sub", 9, 10, 3, true), row("regular", 8, 10, 3)];
    expect(boardLeaders(board(key), rows, 5, { includeSubs: true }).map((r) => r.bowler_id)).toEqual(["sub", "regular"]);
    expect(boardLeaders(board(key), rows).map((r) => r.bowler_id)).toEqual(["regular"]);
  });
});

describe("first-ball aggregate semantics", () => {
  it("excludes B first balls while retaining real pre-withdrawal first balls", () => {
    const frames: Frame[] = [
      { balls: [{ pins: 8 }, { pins: 2 }] },
      { balls: [{ pins: 9 }, { pins: 1, isBlind: true }] },
      ...Array.from({ length: 8 }, () => ({ balls: [{ pins: 10, isBlind: true }] })),
    ];
    const totals = accumulateFrameStats(emptyStatTotals(), scoreGame(frames).frames);
    expect(totals.firstBallCount).toBe(2);
    expect(totals.eightPlus).toBe(2);
    expect(totals.ninePlus).toBe(1);
  });
  it("gives no first-ball attempts or makes to all-blind frames", () => {
    const frames: Frame[] = Array.from({ length: 10 }, () => ({ balls: [{ pins: 10, isBlind: true }] }));
    const totals = accumulateFrameStats(emptyStatTotals(), scoreGame(frames).frames);
    expect(totals.firstBallCount).toBe(0);
    expect(totals.eightPlus).toBe(0);
    expect(totals.ninePlus).toBe(0);
  });
  it("keeps the exact existing exemption list", () => {
    expect([...PARTICIPATION_EXEMPT_BOARDS].sort()).toEqual(["hg", "hs", "strikes", "sparect", "clean", "streak", "marks"].sort());
  });
});