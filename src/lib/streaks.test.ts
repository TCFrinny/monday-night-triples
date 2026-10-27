import { describe, expect, it } from "vitest";
import { BOWLER_BOARDS, boardLeaders, longestStreaks, type FrameLike } from "@/lib/leaderboards";

type O = FrameLike["outcome"];
const game = (outcomes: O[], isBlind = false) => ({
  isBlind,
  frames: outcomes.map((outcome, i) => ({ frame_number: i + 1, outcome })),
});
const fill = (n: number, o: O) => Array<O>(n).fill(o);

describe("streaks reset at every game boundary", () => {
  it("4 strikes ending G1 + strike starting G2 = 4, not 5", () => {
    const g1 = game([...fill(6, "open"), ...fill(4, "strike")]);
    const g2 = game(["strike", ...fill(9, "open")]);
    expect(longestStreaks([g1, g2]).strike).toBe(4);
  });

  it("mark streak (3 spares end G1 + 2 spares start G2) resets = 3", () => {
    const g1 = game([...fill(7, "open"), ...fill(3, "spare")]);
    const g2 = game([...fill(2, "spare"), ...fill(8, "open")]);
    expect(longestStreaks([g1, g2]).mark).toBe(3);
  });

  it("a longer streak wholly inside G2 wins", () => {
    const g1 = game([...fill(7, "open"), ...fill(3, "strike")]);
    const g2 = game(["open", ...fill(6, "strike"), ...fill(3, "open")]);
    expect(longestStreaks([g1, g2])).toEqual({ strike: 6, mark: 6 });
  });

  it("streak can run through frame 10", () => {
    expect(longestStreaks([game([...fill(5, "open"), ...fill(5, "strike")])]).strike).toBe(5);
  });

  it("open or 10-box frame breaks a streak within a game", () => {
    const g = game(["strike", "strike", "open", "strike", "spare", "ten_box", "strike", "open", "open", "open"]);
    expect(longestStreaks([g])).toEqual({ strike: 2, mark: 2 });
  });

  it("full blind games contribute nothing", () => {
    expect(longestStreaks([game(fill(10, "strike"), true)])).toEqual({ strike: 0, mark: 0 });
  });

  it("withdrawn: B (incomplete) frame breaks and nothing after extends", () => {
    const g = game([...fill(3, "strike"), ...fill(7, "incomplete")]);
    expect(longestStreaks([g]).strike).toBe(3);
  });

  it("Longest Strike Streak board still reads the cached value", () => {
    const board = BOWLER_BOARDS.find((b) => b.key === "streak")!;
    expect(board.value({ longest_strike_streak: 4 } as never)).toBe(4);
    const rows = [
      { bowler_id: "a", games: 3, frames: 30, longest_strike_streak: 2 },
      { bowler_id: "b", games: 3, frames: 30, longest_strike_streak: 4 },
    ];
    expect(boardLeaders(board, rows as never)[0]).toMatchObject({ bowler_id: "b" });
  });
});
