import { describe, expect, it } from "vitest";
import {
  computeMatchPoints,
  formatGamesBehind,
  formatRecord,
  formatRecordValue,
  gamesBehind,
  recordFromPoints,
} from "./league";

describe("W-L aggregation", () => {
  it("turns a 5-2 match into 5.0 W and 2.0 L", () => {
    expect(recordFromPoints(5, 1)).toEqual({ wins: 5, losses: 2 });
    expect(formatRecord(recordFromPoints(5, 1))).toBe("5-2");
  });

  it("supports a 3.5-3.5 split (tied game + tied set)", () => {
    const pts = computeMatchPoints([120, 130, 140], [120, 130, 140]);
    expect(pts.totalA).toBe(3.5);
    expect(recordFromPoints(pts.totalA, 1)).toEqual({ wins: 3.5, losses: 3.5 });
    expect(formatRecord(recordFromPoints(3.5, 1))).toBe("3.5-3.5");
  });

  it("accumulates across matches", () => {
    // 5 + 3.5 + 7 over three matches = 15.5 W, 5.5 L
    expect(recordFromPoints(15.5, 3)).toEqual({ wins: 15.5, losses: 5.5 });
  });

  it("is 0-0 with no matches played", () => {
    expect(recordFromPoints(0, 0)).toEqual({ wins: 0, losses: 0 });
  });

  it("formats half values with one decimal only when needed", () => {
    expect(formatRecordValue(5)).toBe("5");
    expect(formatRecordValue(3.5)).toBe("3.5");
  });
});

describe("games behind", () => {
  const leader = recordFromPoints(20, 4); // 20-8

  it("is 0 (—) for the leader", () => {
    expect(gamesBehind(leader, leader)).toBe(0);
    expect(formatGamesBehind(0)).toBe("—");
  });

  it("handles equal matches played", () => {
    const team = recordFromPoints(17, 4); // 17-11
    expect(gamesBehind(leader, team)).toBe(3);
    expect(formatGamesBehind(3)).toBe("3.0");
  });

  it("supports half-game increments", () => {
    const team = recordFromPoints(19, 4); // 19-9
    expect(gamesBehind(leader, team)).toBe(1);
    const half = recordFromPoints(19.5, 4); // 19.5-8.5
    expect(gamesBehind(leader, half)).toBe(0.5);
    expect(formatGamesBehind(0.5)).toBe("0.5");
  });

  it("works with unequal match counts (BYE week)", () => {
    const team = recordFromPoints(17, 3); // 17-4
    // ((20-17) + (4-8)) / 2 = -0.5 -> ahead on the formula, shown as —
    expect(gamesBehind(leader, team)).toBe(-0.5);
    expect(formatGamesBehind(-0.5)).toBe("—");

    const behind = recordFromPoints(12, 3); // 12-9
    expect(gamesBehind(leader, behind)).toBe(4.5);
    expect(formatGamesBehind(4.5)).toBe("4.5");
  });
});
