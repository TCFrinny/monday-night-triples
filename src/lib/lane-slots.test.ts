import { describe, expect, it } from "vitest";
import {
  buildWeekSlots,
  hasBye,
  laneOrderKey,
  sortSlotsForDisplay,
  sortMatchesByActualLane,
  laneSlots,
  lanePairLabel,
  matchupsPerWeek,
  parseLanePair,
  parseStartingLane,
  resolveActualLane,
  validateActualLanes,
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

  it("keeps existing matchups in natural slot order and treats out-of-range lanes as overrides", () => {
    const pairs = laneSlots(25, 3);
    const plan = buildWeekSlots(pairs, [
      { id: "b", lane_pair: "27-28", status: "scheduled", team_a_id: "t3", team_b_id: "t4" },
      { id: "a", lane_pair: "25-26", status: "final", team_a_id: "t1", team_b_id: "t2" },
      {
        id: "x",
        lane_pair: "9-10",
        sort_order: 3,
        status: "scheduled",
        team_a_id: "t5",
        team_b_id: "t6",
      },
    ]);
    expect(plan.slots.map((s) => s.lane_pair)).toEqual(["25-26", "27-28", "29-30"]);
    expect(plan.slots[0]!.match?.id).toBe("a");
    expect(plan.slots[0]!.locked).toBe(true);
    expect(plan.slots[0]!.overridden).toBe(false);
    expect(plan.slots[1]!.match?.id).toBe("b");
    // Maintenance override keeps its slot and its stored lane pair.
    expect(plan.slots[2]!.match?.id).toBe("x");
    expect(plan.slots[2]!.actual_lane_pair).toBe("9-10");
    expect(plan.slots[2]!.overridden).toBe(true);
    expect(plan.orphans).toEqual([]);
  });

  it("only orphans matchups with no slot left (structural conflict)", () => {
    const plan = buildWeekSlots(laneSlots(25, 1), [
      { id: "a", lane_pair: "25-26", status: "scheduled", team_a_id: "t1", team_b_id: "t2" },
      { id: "x", lane_pair: "31-32", status: "scheduled", team_a_id: "t3", team_b_id: "t4" },
    ]);
    expect(plan.orphans.map((m) => m.id)).toEqual(["x"]);
  });

  it("empty slots default to the generated pair", () => {
    const plan = buildWeekSlots(laneSlots(25, 2), []);
    expect(plan.slots.map((s) => s.actual_lane_pair)).toEqual(["25-26", "27-28"]);
    expect(plan.slots.every((s) => !s.overridden)).toBe(true);
  });

  it("parses and normalizes lane-pair overrides", () => {
    expect(parseLanePair("25-26")).toBe("25-26");
    expect(parseLanePair("  31 - 32 ")).toBe("31-32");
    expect(parseLanePair("31")).toBe("31-32");
    expect(parseLanePair("25-27")).toBeNull();
    expect(parseLanePair("26-25")).toBeNull();
    expect(parseLanePair("0-1")).toBeNull();
    expect(parseLanePair("abc")).toBeNull();
    expect(parseLanePair("")).toBeNull();
    expect(parseLanePair(null)).toBeNull();
    // Outside the generated season pairs is allowed during lane maintenance.
    expect(parseLanePair("101-102")).toBe("101-102");
  });

  it("rejects duplicate actual lane pairs within a week, ignoring empty slots and byes", () => {
    expect(
      validateActualLanes([
        { lane_pair: "25-26", actual_lane_pair: "31-32", team_a_id: "t1", team_b_id: "t2" },
        { lane_pair: "27-28", actual_lane_pair: "31-32", team_a_id: "t3", team_b_id: "t4" },
      ]),
    ).toMatch(/two matchups/);
    expect(
      validateActualLanes([
        { lane_pair: "25-26", actual_lane_pair: "31-32", team_a_id: "t1", team_b_id: "t2" },
        { lane_pair: "27-28", actual_lane_pair: "27-28", team_a_id: "", team_b_id: "" },
      ]),
    ).toBeNull();
    expect(
      validateActualLanes([
        { lane_pair: "25-26", actual_lane_pair: "25-27", team_a_id: "t1", team_b_id: "t2" },
      ]),
    ).toMatch(/not a valid pair/);
    // A finalized (locked) row still occupies its lane pair.
    expect(
      validateActualLanes([
        { lane_pair: "25-26", actual_lane_pair: "31-32", team_a_id: "", team_b_id: "", locked: true },
        { lane_pair: "27-28", actual_lane_pair: "31-32", team_a_id: "t3", team_b_id: "t4" },
      ]),
    ).toMatch(/two matchups/);
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

describe("resolveActualLane (draft fallback)", () => {
  it("blank or undefined draft falls back to stored, then default", () => {
    expect(resolveActualLane("", "31-32", "27-28")).toBe("31-32");
    expect(resolveActualLane(undefined, "", "27-28")).toBe("27-28");
    expect(resolveActualLane("   ", null, "27-28")).toBe("27-28");
  });

  it("keeps a valid scheduled override and a malformed nonblank entry", () => {
    expect(resolveActualLane("47-48", "43-44", "43-44")).toBe("47-48");
    expect(resolveActualLane("47-49", "43-44", "43-44")).toBe("47-49");
    expect(parseLanePair(resolveActualLane("47-49", "43-44", "43-44"))).toBeNull();
  });

  it("blank draft never produces a false invalid-lane error, but malformed does", () => {
    const row = (lane: string) => ({
      lane_pair: "43-44",
      actual_lane_pair: resolveActualLane(lane, "43-44", "43-44"),
      team_a_id: "t1",
      team_b_id: "t2",
    });
    expect(validateActualLanes([row("")])).toBeNull();
    expect(validateActualLanes([row("47-48")])).toBeNull();
    expect(validateActualLanes([row("47-49")])).toMatch(/not a valid pair/);
  });

  it("still blocks duplicates produced through the fallback", () => {
    expect(
      validateActualLanes([
        { lane_pair: "25-26", actual_lane_pair: resolveActualLane("", "47-48", "25-26"), team_a_id: "t1", team_b_id: "t2" },
        { lane_pair: "43-44", actual_lane_pair: resolveActualLane("47-48", "43-44", "43-44"), team_a_id: "t3", team_b_id: "t4" },
      ]),
    ).toMatch(/two matchups/);
  });
});

describe("actual lane-pair ordering (public schedule)", () => {
  it("orders matchups ascending by the current actual lane pair", () => {
    const rows = [
      { id: "a", lane_pair: "29-30", sort_order: 1 },
      { id: "b", lane_pair: "45-46", sort_order: 2 },
      { id: "c", lane_pair: "31-32", sort_order: 3 },
      { id: "d", lane_pair: "47-48", sort_order: 7 },
      { id: "e", lane_pair: "41-42", sort_order: 8 },
    ];
    expect(sortMatchesByActualLane(rows).map((r) => r.lane_pair)).toEqual([
      "29-30",
      "31-32",
      "41-42",
      "45-46",
      "47-48",
    ]);
  });

  it("ignores sort_order when the lane was overridden", () => {
    const rows = [
      { id: "a", lane_pair: "45-46", sort_order: 1 },
      { id: "b", lane_pair: "29-30", sort_order: 9 },
    ];
    expect(sortMatchesByActualLane(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("sorts byes and malformed/null lanes last with deterministic fallback", () => {
    const rows = [
      { id: "bye", lane_pair: null, is_bye: true, sort_order: 1 },
      { id: "bad", lane_pair: "abc", sort_order: 5 },
      { id: "null", lane_pair: null, sort_order: 2 },
      { id: "ok", lane_pair: "33-34", sort_order: 9 },
    ];
    expect(sortMatchesByActualLane(rows).map((r) => r.id)).toEqual(["ok", "null", "bad", "bye"]);
  });

  it("does not mutate the input array", () => {
    const rows = [{ id: "a", lane_pair: "45-46" }, { id: "b", lane_pair: "29-30" }];
    sortMatchesByActualLane(rows);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("laneOrderKey parses the leading lane and rejects malformed pairs", () => {
    expect(laneOrderKey("29-30")).toBe(29);
    expect(laneOrderKey("31 - 32")).toBe(31);
    expect(laneOrderKey("31-33")).toBe(Number.POSITIVE_INFINITY);
    expect(laneOrderKey(null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("admin week editor display order", () => {
  const slot = (lane_pair: string, actual: string | null, hasMatch: boolean, index: number) => ({
    lane_pair,
    index,
    match: hasMatch ? { id: `m${index}`, lane_pair: actual, sort_order: index + 1 } : null,
    locked: false,
    actual_lane_pair: actual ?? lane_pair,
    overridden: Boolean(actual) && actual !== lane_pair,
  });

  it("sorts occupied rows by actual lane pair despite stale slot/sort order", () => {
    const slots = [
      slot("27-28", "29-30", true, 0),
      slot("29-30", "45-46", true, 1),
      slot("31-32", "31-32", true, 2),
    ];
    expect(sortSlotsForDisplay(slots).map((s) => s.actual_lane_pair)).toEqual([
      "29-30",
      "31-32",
      "45-46",
    ]);
  });

  it("keeps each row's default-slot identity while reordering", () => {
    const slots = [slot("27-28", "45-46", true, 0), slot("29-30", "29-30", true, 1)];
    expect(sortSlotsForDisplay(slots).map((s) => s.lane_pair)).toEqual(["29-30", "27-28"]);
  });

  it("places empty slots after occupied rows in default-lane order", () => {
    const slots = [
      slot("27-28", null, false, 0),
      slot("29-30", "45-46", true, 1),
      slot("31-32", null, false, 2),
    ];
    expect(sortSlotsForDisplay(slots).map((s) => s.lane_pair)).toEqual([
      "29-30",
      "27-28",
      "31-32",
    ]);
  });

  it("uses the in-progress draft override when ordering", () => {
    const slots = [slot("27-28", "27-28", true, 0), slot("29-30", "29-30", true, 1)];
    const ordered = sortSlotsForDisplay(slots, (s) => (s.lane_pair === "27-28" ? "41-42" : ""));
    expect(ordered.map((s) => s.lane_pair)).toEqual(["29-30", "27-28"]);
  });

  it("falls back to stored lane when the draft field is blank mid-edit", () => {
    const slots = [slot("27-28", "45-46", true, 0), slot("29-30", "29-30", true, 1)];
    const ordered = sortSlotsForDisplay(slots, () => "");
    expect(ordered.map((s) => s.lane_pair)).toEqual(["29-30", "27-28"]);
  });
});
