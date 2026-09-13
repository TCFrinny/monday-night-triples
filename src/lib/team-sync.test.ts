import { describe, expect, it } from "vitest";
import {
  matchesPerWeek,
  parseTeamNumber,
  placeholderName,
  planTeamSync,
  usesHashPrefix,
} from "./team-sync";

const six = Array.from({ length: 6 }, (_, i) => ({
  id: `id-${i + 1}`,
  name: `#${i + 1} ALPHA - BETA - GAMMA`,
}));

describe("parseTeamNumber", () => {
  it("reads both numbering styles", () => {
    expect(parseTeamNumber("#12 SMITH - JONES")).toBe(12);
    expect(parseTeamNumber("7 Team")).toBe(7);
    expect(parseTeamNumber("Costas Inn")).toBeNull();
  });
});

describe("planTeamSync", () => {
  it("detects configured 18 vs actual 6", () => {
    const plan = planTeamSync({ configuredCount: 18, teams: six, hasFinalizedResults: false });
    expect(plan.configured).toBe(18);
    expect(plan.actual).toBe(6);
    expect(plan.creates).toHaveLength(12);
    expect(plan.preservedIds).toEqual(six.map((t) => t.id));
    expect(plan.blockedReason).toBeNull();
  });

  it("numbers placeholders naturally through 18", () => {
    const plan = planTeamSync({ configuredCount: 18, teams: six, hasFinalizedResults: false });
    expect(plan.creates.map((c) => c.number)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(plan.creates[0]!.name).toBe("#7 TEAM");
    expect(plan.creates.at(-1)!.name).toBe("#18 TEAM");
  });

  it("uses plain numbering when the season does not use # prefixes", () => {
    const teams = [{ id: "a", name: "1 Team" }, { id: "b", name: "2 Team" }];
    expect(usesHashPrefix(teams)).toBe(false);
    const plan = planTeamSync({ configuredCount: 4, teams, hasFinalizedResults: false });
    expect(plan.creates.map((c) => c.name)).toEqual(["3 Team", "4 Team"]);
    expect(placeholderName(9, true)).toBe("#9 TEAM");
  });

  it("fills gaps in existing numbering before extending", () => {
    const teams = [{ id: "a", name: "#1 A" }, { id: "b", name: "#3 B" }];
    const plan = planTeamSync({ configuredCount: 4, teams, hasFinalizedResults: false });
    expect(plan.creates.map((c) => c.number)).toEqual([2, 4]);
  });

  it("never deletes on a decrease", () => {
    const plan = planTeamSync({ configuredCount: 4, teams: six, hasFinalizedResults: false });
    expect(plan.creates).toHaveLength(0);
    expect(plan.isDecrease).toBe(true);
    expect(plan.surplus).toBe(2);
    expect(plan.preservedIds).toHaveLength(6);
  });

  it("still allows purely additive creation when finalized results exist", () => {
    const plan = planTeamSync({ configuredCount: 8, teams: six, hasFinalizedResults: true });
    expect(plan.creates.map((c) => c.name)).toEqual(["#7 TEAM", "#8 TEAM"]);
    expect(plan.blockedReason).toBeNull();
    expect(plan.removalBlockedReason).toBeNull();
    expect(plan.preservedIds).toEqual(six.map((t) => t.id));
  });

  it("still protects the destructive direction after finalized results", () => {
    const plan = planTeamSync({ configuredCount: 4, teams: six, hasFinalizedResults: true });
    expect(plan.creates).toHaveLength(0);
    expect(plan.isDecrease).toBe(true);
    expect(plan.surplus).toBe(2);
    expect(plan.removalBlockedReason).toBeTruthy();
    expect(plan.preservedIds).toEqual(six.map((t) => t.id));
  });

  it("expands a live 18-team season to 22 with exactly four placeholders", () => {
    const eighteen = Array.from({ length: 18 }, (_, i) => ({
      id: `t-${i + 1}`,
      name: `#${i + 1} SOME - REAL - NAMES`,
    }));
    const plan = planTeamSync({
      configuredCount: 22,
      teams: eighteen,
      hasFinalizedResults: true,
    });
    expect(plan.creates.map((c) => c.name)).toEqual([
      "#19 TEAM",
      "#20 TEAM",
      "#21 TEAM",
      "#22 TEAM",
    ]);
    expect(plan.isDecrease).toBe(false);
    expect(plan.surplus).toBe(0);
    expect(plan.preservedIds).toEqual(eighteen.map((t) => t.id));
  });
});

describe("matchesPerWeek", () => {
  it("supports an 18-team league with 9 matches and no bye", () => {
    expect(matchesPerWeek(18)).toEqual({ matches: 9, byes: 0 });
    expect(matchesPerWeek(6)).toEqual({ matches: 3, byes: 0 });
    expect(matchesPerWeek(17)).toEqual({ matches: 8, byes: 1 });
  });

  it("supports a 22-team league with 11 matches and no bye", () => {
    expect(matchesPerWeek(22)).toEqual({ matches: 11, byes: 0 });
  });
});
