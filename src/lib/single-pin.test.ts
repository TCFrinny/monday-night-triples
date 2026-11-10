import { describe, expect, it } from "vitest";
import { singlePinFrame, singlePinTotals, singlePinPercentage, formatSinglePin } from "./single-pin";
import { BOWLER_BOARDS, TEAM_BOARDS, boardLeaders, type Leader } from "./leaderboards";
import { PARTICIPATION_EXEMPT_BOARDS } from "./participation";

const counts = (attempts: number, conversions: number) => ({ single_pin_attempts: attempts, single_pin_conversions: conversions });
function board(key: string): Leader {
  const found = [...BOWLER_BOARDS, ...TEAM_BOARDS].find((b) => b.key === key);
  if (!found) throw new Error(`Missing board ${key}`);
  return found;
}
const row = (id: string, attempts: number, conversions: number, games = 21) => ({ bowler_id: id, games, ...counts(attempts, conversions) });

describe("single pin actual-ball accounting", () => {
  it("9 then second-ball spare is 1/1", () => expect(singlePinFrame([{ pins: 9 }, { pins: 1 }])).toEqual(counts(1, 1)));
  it("9 gutter third-ball ten-box is 0/1", () => expect(singlePinFrame([{ pins: 9 }, { pins: 0 }, { pins: 1 }])).toEqual(counts(1, 0)));
  it("9 and two misses is 0/1", () => expect(singlePinFrame([{ pins: 9 }, { pins: 0 }, { pins: 0 }])).toEqual(counts(1, 0)));
  it("first-ball 8 is not an attempt", () => expect(singlePinFrame([{ pins: 8 }, { pins: 2 }])).toEqual(counts(0, 0)));
  it("strike and ninth-pin bonus is not an attempt", () => expect(singlePinFrame([{ pins: 10 }, { pins: 9 }, { pins: 1 }])).toEqual(counts(0, 0)));
  it("split flag does not exclude a legal first-ball 9", () => expect(singlePinFrame([{ pins: 9, isSplit: true }, { pins: 1 }])).toEqual(counts(1, 1)));
  it("full blind is excluded", () => expect(singlePinFrame([{ pins: 9 }, { pins: 1 }], true)).toEqual(counts(0, 0)));
  it("real nine and B second ball is an attempt/miss", () => expect(singlePinFrame([{ pins: 9 }, { pins: 1, isBlind: true }])).toEqual(counts(1, 0)));
  it("B first ball is excluded", () => expect(singlePinFrame([{ pins: 9, isBlind: true }, { pins: 1, isBlind: true }])).toEqual(counts(0, 0)));
  it("later B bonus ball does not erase a real tenth-frame spare", () => expect(singlePinFrame([{ pins: 9 }, { pins: 1 }, { pins: 9, isBlind: true }])).toEqual(counts(1, 1)));
  it("individual sums across games, preserving real hybrid attempts", () => expect(singlePinTotals([
    { frames: [{ balls: [{ pins: 9 }, { pins: 1 }] }] },
    { frames: [{ balls: [{ pins: 9 }, { pins: 1, isBlind: true }] }] },
    { isBlind: true, frames: [{ balls: [{ pins: 9 }, { pins: 1 }] }] },
  ])).toEqual(counts(2, 1)));
  it("team sums all bowlers and substitutes", () => {
    const regular = singlePinTotals([{ frames: [{ balls: [{ pins: 9 }, { pins: 1 }] }] }]);
    const sub = singlePinTotals([{ frames: [{ balls: [{ pins: 9 }, { pins: 0 }, { pins: 1 }] }] }]);
    expect(counts(regular.single_pin_attempts + sub.single_pin_attempts, regular.single_pin_conversions + sub.single_pin_conversions)).toEqual(counts(2, 1));
  });
});

describe("single pin leaderboards", () => {
  it("ranks exact percentages descending, not conversion counts", () => expect(boardLeaders(board("singlepin"), [row("a", 10, 5), row("b", 3, 2)]).map((r) => r.bowler_id)).toEqual(["b", "a"]));
  it("both boards exclude zero attempts", () => {
    for (const key of ["singlepin", "tsinglepin"]) expect(boardLeaders(board(key), [row("a", 0, 0), row("b", 10, 0)]).map((r) => r.bowler_id)).toEqual(["b"]);
  });
  it("Season/Third individual gate excludes six games with minimum fourteen", () => expect(boardLeaders(board("singlepin"), [row("late", 2, 2, 6), row("full", 4, 2)], 5, { minGames: new Map([["late", 14], ["full", 14]]) }).map((r) => r.bowler_id)).toEqual(["full"]));
  it("weekly has no gate and retains existing substitute inclusion", () => expect(boardLeaders(board("singlepin"), [{ ...row("sub", 2, 1, 3), bowlers: { is_sub: true } }], 5, { includeSubs: true })).toHaveLength(1));
  it("season excludes subs but team aggregates are ungated", () => {
    expect(boardLeaders(board("singlepin"), [{ ...row("sub", 2, 1), bowlers: { is_sub: true } }])).toHaveLength(0);
    expect(boardLeaders(board("tsinglepin"), [row("team", 2, 1, 0)])).toHaveLength(1);
  });
  it("equal exact ratios expand fifth-place ties with stable order", () => {
    const rows = [row("a", 10, 10), row("b", 10, 9), row("c", 10, 8), row("d", 10, 7), row("e", 10, 6), row("f", 5, 3)];
    for (const key of ["singlepin", "tsinglepin"]) expect(boardLeaders(board(key), rows).map((r) => r.bowler_id)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
  it("rounded-equal percentages are not false ties", () => expect(singlePinPercentage(counts(10000, 5001))).not.toBe(singlePinPercentage(counts(2, 1))));
  it("exemptions are exactly unchanged", () => expect([...PARTICIPATION_EXEMPT_BOARDS].sort()).toEqual(["hg", "hs", "strikes", "sparect", "clean", "streak", "marks"].sort()));
  it("two decimals and counts are shared by boards and profiles", () => {
    const stats = counts(3, 2);
    expect(formatSinglePin(stats)).toBe("66.67% (2/3)");
    expect(board("singlepin").fmt?.(stats)).toBe("66.67% (2/3)");
    expect(board("tsinglepin").fmt?.(stats)).toBe("66.67% (2/3)");
    expect(formatSinglePin(counts(0, 0))).toBe("—");
  });
});