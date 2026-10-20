import { describe, expect, it } from "vitest";
import { BOWLER_BOARDS, boardLeaders, milestoneLeaders, milestoneBoard, topPositions } from "@/lib/leaderboards";

const avg = BOWLER_BOARDS.find((b) => b.key === "avg")!;
const opens = BOWLER_BOARDS.find((b) => b.key === "opens")!;
const rowsOf = (vals: number[], key: "average" | "opens") =>
  vals.map((v, i) => ({ bowler_id: `b${i}`, games: 21, frames: 210, [key]: v }));
const ids = (rs: any[]) => rs.map((r) => r.bowler_id);

describe("Top-5 positions with tie expansion", () => {
  it("descending 5th-place tie expands", () => {
    expect(boardLeaders(avg, rowsOf([100, 90, 80, 70, 60, 60, 60], "average"))).toHaveLength(7);
  });
  it("tie group beginning before cutoff expands", () => {
    expect(boardLeaders(avg, rowsOf([100, 90, 90, 80, 80, 80, 70], "average"))).toHaveLength(6);
  });
  it("ascending (Fewest Opens) 5th-place tie expands", () => {
    expect(boardLeaders(opens, rowsOf([5, 1, 3, 2, 5, 4, 9], "opens")).map((r) => r.opens)).toEqual([1, 2, 3, 4, 5, 5]);
  });
  it("no tie at cutoff returns exactly 5", () => {
    expect(boardLeaders(avg, rowsOf([100, 90, 80, 70, 60, 50, 50], "average"))).toHaveLength(5);
  });
  it("fewer than 5 returns all", () => {
    expect(boardLeaders(avg, rowsOf([100, 90], "average"))).toHaveLength(2);
  });
  it("participation-ineligible tied row stays excluded", () => {
    const rows = rowsOf([100, 90, 80, 70, 60, 60], "average");
    const min = new Map(rows.map((r) => [r.bowler_id, 14]));
    min.set("b5", 99);
    expect(ids(boardLeaders(avg, rows, 5, { minGames: min }))).toEqual(["b0", "b1", "b2", "b3", "b4"]);
  });
  it("order among ties stays stable", () => {
    const rows = rowsOf([60, 100, 60, 90, 80, 60, 70], "average");
    expect(ids(boardLeaders(avg, rows))).toEqual(["b1", "b3", "b4", "b6", "b0", "b2", "b5"]);
    expect(topPositions([3, 2, 1], (x) => x, 5)).toEqual([3, 2, 1]);
  });
  it("milestone union: cutoff ties plus threshold qualifiers, no duplicates", () => {
    const board = milestoneBoard("hg")!; // threshold 200
    const ev = (id: string, score: number) => ({ event_id: id, score });
    const events = [ev("a", 250), ev("b", 240), ev("c", 230), ev("d", 220), ev("e", 210), ev("f", 210), ev("g", 205), ev("a", 250), ev("h", 150)];
    const out = milestoneLeaders(board, events).map((e) => e.event_id);
    // e/f tie at 5th (210), g qualifies by threshold (>=200), "a" deduped.
    expect(out).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    const tied = milestoneLeaders(board, [ev("a", 230), ev("b", 190), ev("c", 185), ev("d", 182), ev("e", 180), ev("f", 180), ev("g", 179)]);
    expect(tied.map((e) => e.event_id)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(new Set(out).size).toBe(out.length);
  });
});
