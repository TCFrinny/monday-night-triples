import { describe, expect, it } from "vitest";
import {
  accumulateFrameStats,
  ballToken,
  clearWithdrawal,
  emptyStatTotals,
  firstBlindBallPosition,
  hasBlindBalls,
  inheritWithdrawal,
  parseBallToken,
  scoreGame,
  validateWithdrawalSequence,
  type Ball,
  type Frame,
} from "@/lib/duckpin";
import { isAverageEligibleGame, gameScratch } from "@/lib/blind-games";
import { computeMatchPoints, priorAveragesBefore } from "@/lib/league";
import { computeTriplesPoints, teamFrameOne } from "@/lib/rolloff";
import { resolveSinglesSide } from "@/lib/singles";
import { framesFromRows } from "@/components/league/ui";

const b = (pins: number, extra: Partial<Ball> = {}): Ball => ({ pins, ...extra });
const B = (pins: number): Ball => ({ pins, isBlind: true });
const game = (...frames: Ball[][]): Frame[] => {
  const out = frames.map((balls) => ({ balls }));
  while (out.length < 10) out.push({ balls: [] });
  return out;
};
const empty = game();

/** Frames 1-4 real, frame 5 starts real then withdraws, rest blind. */
const hybrid = () =>
  game(
    [b(10)],
    [b(7), b(3)],
    [b(6, { isSplit: true }), b(4)],
    [b(5), b(2), b(1)],
    [b(9), B(1)],
    [B(7), B(2), B(0)],
    [B(10)],
    [B(8), B(2)],
    [B(6), B(3), B(1)],
    [B(5), B(4), B(0)],
  );

describe("B token parsing / display", () => {
  it("parses 7b, -b, Xb, /b case-insensitively", () => {
    expect(parseBallToken("7b", empty, 0, 0)).toMatchObject({ ball: { pins: 7, isBlind: true } });
    expect(parseBallToken("-B", empty, 0, 0)).toMatchObject({ ball: { pins: 0, isBlind: true } });
    expect(parseBallToken("Xb", empty, 0, 0)).toMatchObject({ ball: { pins: 10, isBlind: true } });
    const g = game([b(6)]);
    expect(parseBallToken("/b", g, 0, 1)).toMatchObject({ ball: { pins: 4, isBlind: true } });
    expect(parseBallToken("7s", empty, 0, 0)).toMatchObject({ ball: { pins: 7, isSplit: true } });
  });
  it("rejects S+B on the same ball", () => {
    expect(parseBallToken("7sb", empty, 0, 0).error).toMatch(/both/);
    expect(parseBallToken("7bs", empty, 0, 0).error).toMatch(/both/);
  });
  it("displays B suffix with legal notation", () => {
    expect(ballToken({ balls: [B(10)] }, 0, 0)).toBe("Xb");
    expect(ballToken({ balls: [b(6), B(4)] }, 0, 1)).toBe("/b");
    expect(ballToken({ balls: [B(0)] }, 0, 0)).toBe("-b");
    expect(ballToken({ balls: [B(7)] }, 0, 0)).toBe("7b");
  });
});

describe("withdrawal invariant", () => {
  it("score is numerically identical regardless of B flags", () => {
    const h = hybrid();
    expect(scoreGame(h).total).toBe(scoreGame(clearWithdrawal(h)).total);
    expect(scoreGame(h).complete).toBe(true);
  });
  it("rejects a real ball after the first B; inheritance fixes it", () => {
    const bad = game([b(5), B(3), b(1)], [b(4)]);
    expect(validateWithdrawalSequence(bad)).toMatch(/after the first B/);
    const fixed = inheritWithdrawal(bad);
    expect(validateWithdrawalSequence(fixed)).toBeNull();
    expect(fixed[1]!.balls[0]!.isBlind).toBe(true);
    expect(firstBlindBallPosition(fixed)).toEqual({ frameIndex: 0, ballIndex: 1 });
  });
  it("clearing B flags makes the game normal again (pins kept)", () => {
    const c = clearWithdrawal(hybrid());
    expect(hasBlindBalls(c)).toBe(false);
    expect(c[5]!.balls.map((x) => x.pins)).toEqual([7, 2, 0]);
  });
});

describe("individual frame stats from a withdrawn game", () => {
  const t = accumulateFrameStats(emptyStatTotals(), scoreGame(hybrid()).frames);
  it("real frames before withdrawal keep normal stats; B frames give no outcome credit", () => {
    expect(t.frames).toBe(4);
    expect(t.strikes).toBe(1); // frame 7 Xb never credited
    expect(t.spares).toBe(2); // frame 8 /b not credited
    expect(t.tenBoxes).toBe(0);
    expect(t.opens).toBe(1);
  });
  it("real first ball of a later-B frame still counts in first-ball stats", () => {
    expect(t.firstBallCount).toBe(5); // frames 1-5
    expect(t.firstBallPins).toBe(10 + 7 + 6 + 5 + 9);
    expect(t.ninePlus).toBe(2);
  });
  it("split left counts, conversion only in fully real frame", () => {
    expect(t.splits).toBe(1);
    expect(t.splitConversions).toBe(1);
  });
});

describe("average / game eligibility", () => {
  it("hybrid and full-blind games are not average-eligible", () => {
    expect(isAverageEligibleGame({ is_complete: true, is_blind: false, is_withdrawn: false })).toBe(true);
    expect(isAverageEligibleGame({ is_complete: true, is_blind: false, is_withdrawn: true })).toBe(false);
    expect(isAverageEligibleGame({ is_complete: true, is_blind: true, is_withdrawn: false })).toBe(false);
  });
  it("games-before/establishment excludes the hybrid game", () => {
    const stored = [
      { w: 1, s: 120, is_withdrawn: false },
      { w: 1, s: 150, is_withdrawn: true },
      { w: 1, s: 130, is_withdrawn: false },
    ];
    const rows = stored
      .filter((g) => isAverageEligibleGame({ is_complete: true, is_blind: false, is_withdrawn: g.is_withdrawn }))
      .map((g) => ({ bowlerId: "x", weekNumber: g.w, scratch: g.s }));
    const m = priorAveragesBefore(rows, 2);
    expect(m.get("x")?.games).toBe(2);
    expect(m.get("x")?.average).toBe(125);
  });
});

describe("team scoring keeps the hybrid score", () => {
  it("team totals / match points use full numeric hybrid score", () => {
    const hs = gameScratch({ lineup: { participation: "rostered" }, gameNumber: 1, frames: hybrid(), blindDeduction: 10 });
    expect(hs).toBe(scoreGame(clearWithdrawal(hybrid())).total);
    const p = computeMatchPoints([hs + 200, 300, 300], [hs + 199, 310, 290]);
    expect(p.gamePoints[0]!.a).toBe(2);
  });
  it("full-game blind unchanged", () => {
    const lineup = { participation: "rostered", applicable_average: 130, bowler_games: [{ game_number: 2, is_blind: true }] };
    expect(gameScratch({ lineup, gameNumber: 2, frames: undefined, blindDeduction: 10 })).toBe(120);
  });
});

describe("roll-off with a withdrawn next game", () => {
  it("auto roll-off is blocked when frame 1 contains a B ball", () => {
    const withB = teamFrameOne([{ blind: false, frames: game([b(5), B(5)], [B(3)]) }]);
    expect(withB).toEqual({ score: null, reason: "withdrawn" });
    const real = teamFrameOne([{ blind: false, frames: game([b(5), b(5)], [B(3)]) }]);
    expect(real.score).toBe(13);
    const p = computeTriplesPoints({
      hdcpA: [400, 380, 410], hdcpB: [400, 370, 400], handicap: { receivingSide: null, pins: 0 },
      frameOne: { 2: { a: withB, b: { score: 20 } } },
    });
    expect(p.gamePoints[0]!.rolloff).toMatchObject({ method: "pending", manualAllowed: true, winner: null });
    expect(p.pending.length).toBeGreaterThan(0);
  });
});

describe("Singles with a withdrawn source game", () => {
  it("side is flagged blind/withdrawn; rostered unaffected otherwise", () => {
    const base = { bowler_id: "j", absent_bowler_id: null, participation: "rostered", applicable_average: 130 };
    expect(resolveSinglesSide([{ ...base, bowler_games: [{ is_withdrawn: true }] }], "j")?.isBlind).toBe(true);
    expect(resolveSinglesSide([{ ...base, bowler_games: [{ is_withdrawn: false }] }], "j")?.isBlind).toBe(false);
  });
});

describe("hydration", () => {
  it("framesFromRows reads balls.is_blind", () => {
    const f = framesFromRows([
      { frame_number: 1, balls: [{ ball_number: 2, pins: 3, is_blind: true }, { ball_number: 1, pins: 6, is_split: true }] },
    ]);
    expect(f[0]!.balls).toEqual([{ pins: 6, isSplit: true }, { pins: 3, isBlind: true }]);
    expect(ballToken(f[0]!, 0, 1)).toBe("3b");
  });
});
