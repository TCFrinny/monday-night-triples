import { describe, expect, it } from "vitest";
import {
  buildWeekSlots,
  hasBye,
  laneSlots,
  lanePairLabel,
  matchupsPerWeek,
  parseStartingLane,
  validateWeekAssignments,
} from "./lane-slots";

describe("lane slots", () => {
  it("18 teams produce 9 pairs starting at 25", () => {
    expect(matchupsPerWeek(18)).toBe(9);
    expect(hasBye(18)).toBe(false);
    expect(laneSlots(25, matchupsPerWeek(18))).toEqual([
      "25-26",
      "27-28",
      "29-30",
      "31-32",
      "33-34",
      "35-36",
      "37-38",
      "39-40",
      "41-42",
    ]);
  });

  it("odd team counts drop one team to a bye without inventing a pair", () => {
    expect(matchupsPerWeek(17)).toBe(8);
    expect(hasBye(17)).toBe(true);
    expect(laneSlots(1, matchupsPerWeek(17))).toHaveLength(8);
  });

  it("validates the starting lane", () => {
    expect(parseStartingLane("25")).toBe(25);
    expect(parseStartingLane("0")).toBeNull();
    expect(parseStartingLane("-3")).toBeNull();
    expect(parseStartingLane("2.5")).toBeNull();
    expect(parseStartingLane("")).toBeNull();
    expect(lanePairLabel(25)).toBe("25-26");
    expect(laneSlots(null, 4)).toEqual([]);
  });

  it("keeps existing matchups in natural slot order and surfaces orphans", () => {
    const pairs = laneSlots(25, 3);
    const plan = buildWeekSlots(pairs, [
      { id: "b", lane_pair: "27-28", status: "scheduled", team_a_id: "t3", team_b_id: "t4" },
      { id: "a", lane_pair: "25-26", status: "final", team_a_id: "t1", team_b_id: "t2" },
      { id: "x", lane_pair: "9-10", status: "scheduled", team_a_id: "t5", team_b_id: "t6" },
    ]);
    expect(plan.slots.map((s) => s.lane_pair)).toEqual(["25-26", "27-28", "29-30"]);
    expect(plan.slots[0]!.match?.id).toBe("a");
    expect(plan.slots[0]!.locked).toBe(true);
    expect(plan.slots[1]!.match?.id).toBe("b");
    expect(plan.slots[1]!.locked).toBe(false);
    expect(plan.slots[2]!.match).toBeNull();
    expect(plan.orphans.map((m) => m.id)).toEqual(["x"]);
  });

  it("counts byes separately from lane slots", () => {
    const plan = buildWeekSlots(laneSlots(25, 2), [
      { id: "y", lane_pair: null, is_bye: true, status: "scheduled", team_a_id: "t7" },
    ]);
    expect(plan.byeCount).toBe(1);
    expect(plan.orphans).toEqual([]);
  });

  it("rejects duplicate teams, self-matchups and half-filled slots", () => {
    expect(
      validateWeekAssignments([
        { lane_pair: "25-26", team_a_id: "t1", team_b_id: "t2" },
        { lane_pair: "27-28", team_a_id: "t1", team_b_id: "t3" },
      ]),
    ).toMatch(/twice this week/);
    expect(
      validateWeekAssignments([{ lane_pair: "25-26", team_a_id: "t1", team_b_id: "t1" }]),
    ).toMatch(/cannot bowl itself/);
    expect(validateWeekAssignments([{ lane_pair: "25-26", team_a_id: "t1", team_b_id: "" }])).toMatch(
      /choose both teams/,
    );
    expect(
      validateWeekAssignments([{ lane_pair: "25-26", team_a_id: "t1", team_b_id: "t2" }], "t2"),
    ).toMatch(/bye team/);
    expect(
      validateWeekAssignments(
        [
          { lane_pair: "25-26", team_a_id: "t1", team_b_id: "t1", locked: true },
          { lane_pair: "27-28", team_a_id: "", team_b_id: "" },
        ],
        "t9",
      ),
    ).toBeNull();
  });
});
