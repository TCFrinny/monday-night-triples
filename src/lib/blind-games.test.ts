import { describe, expect, it } from "vitest";
import { gameBlindValue, gameScratch, isGameBlind, planBlindToggle } from "./blind-games";
import { emptyGame, type Frame } from "./duckpin";

const rolled = (game_number: number, scratch: number): Frame[] => emptyGame();

function lineup(over: Partial<Parameters<typeof isGameBlind>[0]> = {}) {
  return {
    participation: "rostered",
    applicable_average: 120,
    bowler_games: [] as { game_number: number; is_blind: boolean }[],
    ...over,
  };
}

describe("isGameBlind", () => {
  it("is blind only for the flagged game — rolled G1/G2 + blind G3", () => {
    const l = lineup({
      bowler_games: [
        { game_number: 1, is_blind: false },
        { game_number: 2, is_blind: false },
        { game_number: 3, is_blind: true },
      ],
    });
    expect(isGameBlind(l, 1)).toBe(false);
    expect(isGameBlind(l, 2)).toBe(false);
    expect(isGameBlind(l, 3)).toBe(true);
  });

  it("supports blind G1 with rolled G2/G3", () => {
    const l = lineup({
      bowler_games: [
        { game_number: 1, is_blind: true },
        { game_number: 2, is_blind: false },
        { game_number: 3, is_blind: false },
      ],
    });
    expect(isGameBlind(l, 1)).toBe(true);
    expect(isGameBlind(l, 2)).toBe(false);
    expect(isGameBlind(l, 3)).toBe(false);
  });

  it("supports all three games blind", () => {
    const l = lineup({
      bowler_games: [1, 2, 3].map((game_number) => ({ game_number, is_blind: true })),
    });
    expect([1, 2, 3].every((g) => isGameBlind(l, g))).toBe(true);
  });

  it("treats a legacy lineup-level blind with no game rows as all games blind", () => {
    const l = lineup({ participation: "blind", bowler_games: [] });
    expect([1, 2, 3].every((g) => isGameBlind(l, g))).toBe(true);
  });

  it("per-game rows override the legacy lineup flag", () => {
    const l = lineup({
      participation: "blind",
      bowler_games: [{ game_number: 2, is_blind: false }],
    });
    expect(isGameBlind(l, 2)).toBe(false);
    expect(isGameBlind(l, 1)).toBe(true); // no row -> legacy flag
  });

  it("is never blind for a missing lineup", () => {
    expect(isGameBlind(null, 1)).toBe(false);
    expect(isGameBlind(undefined, 3)).toBe(false);
  });
});

describe("gameScratch", () => {
  it("returns the blind value only for blind games, sheet score elsewhere", () => {
    const l = lineup({
      applicable_average: 120,
      bowler_games: [{ game_number: 3, is_blind: true }],
    });
    // blindScore(120, 10) = 110
    expect(gameScratch({ lineup: l, gameNumber: 3, frames: rolled(3, 0), blindDeduction: 10 })).toBe(110);
    expect(gameScratch({ lineup: l, gameNumber: 1, frames: emptyGame(), blindDeduction: 10 })).toBe(0);
  });

  it("never lets a blind G3 change G1/G2 scores", () => {
    const l = lineup({ bowler_games: [{ game_number: 3, is_blind: true }] });
    const before = gameScratch({ lineup: l, gameNumber: 1, frames: emptyGame(), blindDeduction: 10 });
    expect(before).toBe(0);
  });

  it("blind value never goes below zero", () => {
    const l = lineup({ applicable_average: 5, bowler_games: [{ game_number: 1, is_blind: true }] });
    expect(gameBlindValue(l, 10)).toBe(0);
  });
});

describe("planBlindToggle", () => {
  it("toggling blind on plans a blind write with the blind value", () => {
    const plan = planBlindToggle({ lineup: lineup(), gameNumber: 2, makeBlind: true, blindDeduction: 10 });
    expect(plan).toEqual({ isBlind: true, blindValue: 110 });
  });

  it("toggling blind off plans a rolled write with no blind value", () => {
    const plan = planBlindToggle({ lineup: lineup(), gameNumber: 2, makeBlind: false, blindDeduction: 10 });
    expect(plan).toEqual({ isBlind: false, blindValue: 0 });
  });
});
