import { describe, expect, it } from "vitest";
import {
  formatPoa,
  laneOpenPct,
  laneSortKey,
  laneSparePct,
  laneStrikePct,
  sortLaneRows,
  type LaneRow,
} from "@/lib/lane-data";

const row = (over: Partial<LaneRow>): LaneRow => ({
  lane_pair: "25-26",
  lane_sort: 25,
  games: 18,
  pinfall: 2456,
  average: 136.44,
  poa: 4.11,
  high_scratch_game: 202,
  frames: 180,
  strikes: 34,
  spares: 46,
  ten_boxes: 44,
  opens: 56,
  spare_attempts: 146,
  first_ball_pins: 1370,
  first_ball_count: 180,
  first_ball_avg: 7.61,
  pins_lost: 83,
  pins_lost_per_game: 4.61,
  ...over,
});

describe("lane data", () => {
  it("sorts lane pairs naturally, not lexically", () => {
    const rows = [
      { lane_pair: "29-30", lane_sort: 29 },
      { lane_pair: "3-4", lane_sort: 3 },
      { lane_pair: "25-26", lane_sort: 25 },
    ];
    expect(sortLaneRows(rows).map((r) => r.lane_pair)).toEqual(["3-4", "25-26", "29-30"]);
  });

  it("falls back to the label's leading number when lane_sort is missing", () => {
    expect(laneSortKey("11-12")).toBe(11);
    expect(laneSortKey("Practice")).toBe(0);
    expect(
      sortLaneRows([
        { lane_pair: "9-10", lane_sort: null },
        { lane_pair: "7-8", lane_sort: null },
      ]).map((r) => r.lane_pair),
    ).toEqual(["7-8", "9-10"]);
  });

  it("computes lane percentages from cached counters", () => {
    const r = row({});
    expect(laneStrikePct(r)).toBeCloseTo(18.9, 1);
    expect(laneSparePct(r)).toBeCloseTo(31.5, 1);
    expect(laneOpenPct(r)).toBeCloseTo(31.1, 1);
  });

  it("guards zero denominators (empty scope)", () => {
    const empty = row({ frames: 0, spare_attempts: 0, strikes: 0, spares: 0, opens: 0 });
    expect(laneStrikePct(empty)).toBe(0);
    expect(laneSparePct(empty)).toBe(0);
  });

  it("formats POA with an explicit sign", () => {
    expect(formatPoa(4.11)).toBe("+4.11");
    expect(formatPoa(-2.33)).toBe("-2.33");
    expect(formatPoa(0)).toBe("0.00");
  });
});
