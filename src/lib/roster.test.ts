import { describe, expect, it } from "vitest";
import {
  rosterForWeek,
  rosterStartWeek,
  teamHasRosterHistory,
  type RosterSpotRow,
} from "./roster";

const spot = (over: Partial<RosterSpotRow>): RosterSpotRow => ({
  id: "s1",
  team_id: "old",
  slot: 1,
  bowler_id: "b1",
  effective_from_week: 1,
  effective_to_week: null,
  ...over,
});

describe("teamHasRosterHistory", () => {
  it("distinguishes a brand-new team from an established one", () => {
    const spots = [spot({}), spot({ id: "s2", team_id: "old", slot: 2, bowler_id: "b2" })];
    expect(teamHasRosterHistory(spots, "old")).toBe(true);
    expect(teamHasRosterHistory(spots, "new")).toBe(false);
    expect(teamHasRosterHistory(null, "new")).toBe(false);
  });
});

describe("rosterStartWeek", () => {
  it("keeps established teams on the current league week", () => {
    expect(rosterStartWeek({ hasHistory: true, currentWeek: 5 })).toBe(5);
    // The week-1 option is ignored for a team that already has history, so no
    // historical roster is ever rewritten.
    expect(rosterStartWeek({ hasHistory: true, currentWeek: 5, fromWeekOne: true })).toBe(5);
  });

  it("lets a brand-new team's first roster be effective from week 1", () => {
    expect(rosterStartWeek({ hasHistory: false, currentWeek: 5, fromWeekOne: true })).toBe(1);
  });

  it("defaults a new team to the current week when the option is off", () => {
    expect(rosterStartWeek({ hasHistory: false, currentWeek: 5 })).toBe(5);
  });
});

describe("Week 1 makeup eligibility", () => {
  it("a new team seeded from week 1 resolves a Week 1 lineup", () => {
    const start = rosterStartWeek({ hasHistory: false, currentWeek: 5, fromWeekOne: true });
    const spots = [1, 2, 3].map((slot) =>
      spot({ id: `n${slot}`, team_id: "new", slot, bowler_id: `nb${slot}`, effective_from_week: start }),
    );
    expect(rosterForWeek(spots, "new", 1).map((s) => s?.bowler_id)).toEqual(["nb1", "nb2", "nb3"]);
    // Still in force for the current and later weeks.
    expect(rosterForWeek(spots, "new", 5).every(Boolean)).toBe(true);
  });

  it("without the option, a Week 1 lineup for a new team is empty", () => {
    const start = rosterStartWeek({ hasHistory: false, currentWeek: 5 });
    const spots = [spot({ id: "n1", team_id: "new", effective_from_week: start })];
    expect(rosterForWeek(spots, "new", 1)).toEqual([null, null, null]);
  });
});
