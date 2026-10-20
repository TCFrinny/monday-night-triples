import { describe, expect, it } from "vitest";
import {
  buildWeekSlots,
  gameLanePair,
  gameLaneSummary,
  laneMetadataPatch,
  laneNote,
  laneSlots,
  normalizeGameLanePairs,
  parseLanePair,
  validateActualLanes,
  validateGameLanePairs,
} from "@/lib/lane-slots";

const m = { lane_pair: "37-38", game_lane_pairs: { "3": "41-42" } };

describe("per-game lane pairs", () => {
  it("falls back to the match pair", () => {
    expect(gameLanePair({ lane_pair: "37-38", game_lane_pairs: {} }, 1)).toBe("37-38");
    expect(gameLanePair({ lane_pair: "37-38" }, 2)).toBe("37-38");
  });
  it("uses a G3 override", () => {
    expect([1, 2, 3].map((n) => gameLanePair(m, n))).toEqual(["37-38", "37-38", "41-42"]);
  });
  it("drops blanks and entries equal to primary", () => {
    expect(normalizeGameLanePairs("37-38", { "1": "", "2": "37", "3": "37-38" })).toEqual({});
  });
  it("canonicalizes '41' to '41-42'", () => {
    expect(normalizeGameLanePairs("37-38", { "3": "41" })).toEqual({ "3": "41-42" });
  });
  it("rejects malformed pairs", () => {
    expect(validateGameLanePairs({ "3": "41-43" })).toMatch(/not a valid pair/);
    expect(() => normalizeGameLanePairs("37-38", { "2": "abc" })).toThrow();
    expect(validateGameLanePairs({ "4": "41-42" })).toMatch(/Unknown game/);
  });
  it("allows duplicate per-game pairs", () => {
    expect(normalizeGameLanePairs("37-38", { "1": "41", "2": "41-42", "3": "41" })).toEqual({
      "1": "41-42",
      "2": "41-42",
      "3": "41-42",
    });
    expect(
      validateActualLanes([
        { lane_pair: "37-38", actual_lane_pair: "41-42", team_a_id: "a", team_b_id: "b" },
        { lane_pair: "39-40", actual_lane_pair: "41-42", team_a_id: "c", team_b_id: "d" },
      ]),
    ).toBeNull();
  });
  it("keeps buildWeekSlots stable when game_lane_pairs exist", () => {
    const pairs = laneSlots(37, 3);
    const plan = buildWeekSlots(pairs, [
      { id: "x", lane_pair: "37-38", sort_order: 1, game_lane_pairs: { "3": "41-42" } } as any,
      { id: "y", lane_pair: "39-40", sort_order: 2 },
    ]);
    expect(plan.slots.map((s) => s.match?.id ?? null)).toEqual(["x", "y", null]);
    expect(plan.slots[0]!.overridden).toBe(false);
    expect(plan.orphans).toEqual([]);
  });
  it("lane metadata patch touches only lane fields", () => {
    const patch = laneMetadataPatch("37", { "3": "41" });
    expect(Object.keys(patch).sort()).toEqual(["game_lane_pairs", "lane_pair"]);
    expect(patch).toEqual({ lane_pair: "37-38", game_lane_pairs: { "3": "41-42" } });
  });
  it("re-normalizes overrides when the primary pair changes to match them", () => {
    expect(laneMetadataPatch("41-42", { "3": "41-42" }).game_lane_pairs).toEqual({});
  });
  it("default slots remain unique and whole-match parsing unchanged", () => {
    const s = laneSlots(25, 11);
    expect(new Set(s).size).toBe(11);
    expect(parseLanePair("31")).toBe("31-32");
    expect(parseLanePair("31-33")).toBeNull();
  });
  it("summarizes per-game moves for admin and public", () => {
    expect(gameLaneSummary(m)).toBe("G3 41-42");
    expect(laneNote(m)).toBe("Lanes 37-38 · G3 moved to 41-42");
    expect(laneNote({ lane_pair: "37-38", game_lane_pairs: {} })).toBe("Lanes 37-38");
  });
});
