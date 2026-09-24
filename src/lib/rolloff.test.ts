import { describe, expect, it } from "vitest";
import type { Frame } from "@/lib/duckpin";
import { computeMatchPoints } from "@/lib/league";
import { buildGameSnapshot } from "@/lib/results";
import {
  computeTriplesPoints,
  frameOneNatural,
  rolloffHandicap,
  teamFrameOne,
  type TeamFrameOne,
} from "@/lib/rolloff";

const f1 = (...frames: number[][]): Frame[] => {
  const out: Frame[] = frames.map((balls) => ({ balls: balls.map((pins) => ({ pins })) }));
  while (out.length < 10) out.push({ balls: [] });
  return out;
};
const team = (score: number): TeamFrameOne => ({ score });
const none = { receivingSide: null, pins: 0 } as const;

describe("Triples roll-offs", () => {
  it("1) non-tied games/set unchanged", () => {
    const p = computeTriplesPoints({ hdcpA: [400, 380, 410], hdcpB: [390, 390, 400], handicap: none, frameOne: {} });
    expect(p.gamePoints.map((g) => [g.a, g.b])).toEqual([[2, 0], [0, 2], [2, 0]]);
    expect([p.setPointA, p.setPointB, p.totalA, p.totalB]).toEqual([1, 0, 5, 2]);
    expect(p.pending).toEqual([]);
  });

  it("2) G1 tie resolved by G2 frame 1 with no handicap", () => {
    const p = computeTriplesPoints({
      hdcpA: [400, 380, 410], hdcpB: [400, 370, 400], handicap: none,
      frameOne: { 2: { a: team(20), b: team(25) } },
    });
    expect(p.gamePoints[0]).toMatchObject({ a: 0, b: 2, tied: true });
    expect(p.gamePoints[0]!.rolloff).toMatchObject({ method: "auto", aHdcp: 0, bHdcp: 0, winner: "b" });
  });

  it("3) roll-off handicap = floor(10%) to the receiving team only", () => {
    expect(rolloffHandicap(34)).toBe(3);
    expect(rolloffHandicap(9)).toBe(0);
    const p = computeTriplesPoints({
      hdcpA: [400, 380, 410], hdcpB: [400, 370, 400], handicap: { receivingSide: "a", pins: 34 },
      frameOne: { 2: { a: team(23), b: team(25) } },
    });
    expect(p.gamePoints[0]!.rolloff).toMatchObject({ aHdcp: 3, bHdcp: 0, aTotal: 26, bTotal: 25, winner: "a" });
  });

  it("4) strike frame includes next two balls", () => {
    expect(frameOneNatural(f1([10], [9, 1]))).toBe(20);
    expect(frameOneNatural(f1([10], [3, 4]))).toBe(17);
    expect(frameOneNatural(f1([10]))).toBeNull();
  });

  it("5) spare frame includes next one ball", () => {
    expect(frameOneNatural(f1([9, 1], [2, 6, 0]))).toBe(12);
    expect(frameOneNatural(f1([9, 1]))).toBeNull();
    expect(frameOneNatural(f1([4, 3, 3]))).toBe(10); // ten-box: no bonus
  });

  it("6) G2 tie uses G3 frame 1", () => {
    const p = computeTriplesPoints({
      hdcpA: [410, 391, 400], hdcpB: [400, 391, 410], handicap: none,
      frameOne: { 3: { a: team(30), b: team(28) } },
    });
    expect(p.gamePoints[1]!.rolloff).toMatchObject({ nextGame: 3, winner: "a" });
    expect([p.gamePoints[1]!.a, p.gamePoints[1]!.b]).toEqual([2, 0]);
  });

  it("7) auto roll-off tied => manual winner required, never split", () => {
    const args = {
      hdcpA: [400, 380, 410], hdcpB: [400, 370, 400], handicap: { receivingSide: "b" as const, pins: 20 },
      frameOne: { 2: { a: team(27), b: team(25) } },
    };
    const p = computeTriplesPoints(args);
    expect(p.gamePoints[0]).toMatchObject({ a: 0, b: 0 });
    expect(p.pending[0]).toContain("Game 1 roll-off still tied — choose winner");
    const q = computeTriplesPoints({ ...args, decisions: { game1: "b" } });
    expect(q.gamePoints[0]).toMatchObject({ a: 0, b: 2 });
    expect(q.pending).toEqual([]);
  });

  it("incomplete next frame 1 blocks without splitting or manual override", () => {
    const p = computeTriplesPoints({
      hdcpA: [400, 380, 410], hdcpB: [400, 370, 400], handicap: none,
      frameOne: { 2: { a: team(20), b: teamFrameOne([{ blind: false, frames: f1([10]) }]) } },
      decisions: { game1: "a" },
    });
    expect(p.gamePoints[0]).toMatchObject({ a: 0, b: 0 });
    expect(p.pending[0]).toContain("finish frame 1 of Game 2");
  });

  it("8) G3 tie manual winner gets full 2", () => {
    const p = computeTriplesPoints({ hdcpA: [410, 380, 400], hdcpB: [400, 390, 400], handicap: none, frameOne: {} });
    expect(p.pending).toContain("Game 3 is tied — choose the roll-off winner");
    const q = computeTriplesPoints({ hdcpA: [410, 380, 400], hdcpB: [400, 390, 400], handicap: none, frameOne: {}, decisions: { game3: "b" } });
    expect([q.gamePoints[2]!.a, q.gamePoints[2]!.b]).toEqual([0, 2]);
  });

  it("9) set tie manual winner gets full 1", () => {
    const base = { hdcpA: [410, 390, 400], hdcpB: [400, 400, 400], handicap: none, frameOne: {} };
    expect(computeTriplesPoints({ ...base, decisions: { game3: "a" } }).pending).toEqual(["Set is tied — choose the roll-off winner"]);
    const q = computeTriplesPoints({ ...base, decisions: { game3: "a", set: "b" } });
    expect([q.setPointA, q.setPointB]).toEqual([0, 1]);
  });

  it("10) G3 and set ties are independent decisions", () => {
    const q = computeTriplesPoints({
      hdcpA: [410, 390, 400], hdcpB: [400, 400, 400], handicap: none, frameOne: {},
      decisions: { game3: "a", set: "b" },
    });
    expect([q.totalA, q.totalB]).toEqual([4, 3]);
  });

  it("11) stale manual winners are ignored and dropped when the tie disappears", () => {
    const q = computeTriplesPoints({
      hdcpA: [400, 380, 411], hdcpB: [390, 390, 400], handicap: none, frameOne: {},
      decisions: { game1: "b", game3: "b", set: "b" },
    });
    expect([q.totalA, q.totalB]).toEqual([5, 2]);
    expect(q.decisions).toEqual({});
  });

  it("12) Singles helper still splits ties 1/1 and 0.5/0.5", () => {
    const p = computeMatchPoints([150, 140, 130], [150, 140, 130]);
    expect(p.gamePoints.map((g) => [g.a, g.b])).toEqual([[1, 1], [1, 1], [1, 1]]);
    expect([p.setPointA, p.setPointB]).toEqual([0.5, 0.5]);
  });

  it("13) live Week 3 lanes 37-38: #8 wins the Game 2 roll-off", () => {
    // Stored G3 frame 1 balls: #8 Peach X|9,1 · Neil 9,1|2 · Karabelas 2,6,0;
    // #4 Hook 5,1,2 · C. DeAntoniis 5,1,1 · N. DeAntoniis 2,6,0.
    const a = teamFrameOne([
      { blind: false, frames: f1([10], [9, 1]) },
      { blind: false, frames: f1([9, 1], [8]) },
      { blind: false, frames: f1([2, 6, 0]) },
    ]);
    const b = teamFrameOne([
      { blind: false, frames: f1([5, 1, 2]) },
      { blind: false, frames: f1([5, 1, 1]) },
      { blind: false, frames: f1([2, 6, 0]) },
    ]);
    expect([a.score, b.score]).toEqual([46, 23]);
    const p = computeTriplesPoints({
      hdcpA: [383, 391, 445], hdcpB: [405, 391, 368], handicap: { receivingSide: "a", pins: 34 },
      frameOne: { 3: { a, b } },
    });
    expect(p.gamePoints[1]!.rolloff).toMatchObject({ aHdcp: 3, bHdcp: 0, aTotal: 49, bTotal: 23, winner: "a" });
    expect([p.totalA, p.totalB]).toEqual([5, 2]);
    const snap = buildGameSnapshot({ scratchA: [0, 0, 0], scratchB: [0, 0, 0], hdcpA: [0, 0, 0], hdcpB: [0, 0, 0], gamePoints: p.gamePoints });
    expect(snap[1]).toMatchObject({ tied: true, rolloff_winner: "a", rolloff_method: "auto", rolloff_a: 46, rolloff_b: 23 });
  });
});
