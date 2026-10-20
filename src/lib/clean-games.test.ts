import { describe, expect, it } from "vitest";
import { BOWLER_BOARDS, boardLeaders, cleanFrames, isCleanGame, type FrameLike } from "@/lib/leaderboards";
import { isParticipationExempt } from "@/lib/participation";

const fr = (outcomes: FrameLike["outcome"][], balls?: number[][]): FrameLike[] =>
  outcomes.map((outcome, i) => ({ frame_number: i + 1, outcome, ...(balls?.[i] ? { balls: balls[i]! } : {}) }));

const allMarks = fr(Array(10).fill("spare"));

describe("Clean Game = zero wood", () => {
  it("qualifies with a 10-box when pins lost totals 0", () => {
    const g = fr([...Array(9).fill("strike"), "ten_box"], [...Array(9).fill([10]), [5, 3, 2]]);
    expect(isCleanGame(g)).toBe(true);
  });

  it("does not qualify when pins lost > 0 (an open frame)", () => {
    const g = fr([...Array(9).fill("strike"), "open"], [...Array(9).fill([10]), [5, 3, 1]]);
    expect(isCleanGame(g)).toBe(false);
  });

  it("all-mark games qualify only via 0 pins lost, not via the mark rule", () => {
    expect(isCleanGame(allMarks)).toBe(true);
    // Any frame that leaves wood is open under current semantics, so it is not clean.
    const g = fr([...Array(9).fill("spare"), "open"], [...Array(9).fill([7, 3]), [7, 2, 0]]);
    expect(isCleanGame(g)).toBe(false);
  });

  it("full blind and withdrawn games never qualify", () => {
    expect(isCleanGame(allMarks, { isBlind: true })).toBe(false);
    expect(isCleanGame(allMarks, { isWithdrawn: true })).toBe(false);
    // B-ball frames are masked to incomplete.
    expect(isCleanGame(fr([...Array(8).fill("strike"), "incomplete", "incomplete"]))).toBe(false);
  });

  it("leaderboard ranks by clean_games and stays participation-exempt", () => {
    const board = BOWLER_BOARDS.find((b) => b.key === "clean")!;
    const rows = [
      { bowler_id: "a", games: 3, clean_games: 1 },
      { bowler_id: "b", games: 3, clean_games: 4 },
    ];
    expect(boardLeaders(board, rows).map((r) => r.bowler_id)).toEqual(["b", "a"]);
    expect(isParticipationExempt("clean")).toBe(true);
    expect(boardLeaders(board, rows, 5, { minGames: new Map([["a", 99], ["b", 99]]) })).toHaveLength(2);
  });

  it("Clean Frames still counts strikes and spares only", () => {
    expect(cleanFrames(fr(["strike", "spare", "ten_box", "open", "incomplete"]))).toBe(2);
  });
});
