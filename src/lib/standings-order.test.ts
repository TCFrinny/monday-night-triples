import { describe, expect, it } from "vitest";
import { isPreseasonStandings, naturalCompare, orderStandingsRows } from "./standings-order";

const row = (name: string, rank: number, matches_played = 0, points = 0) => ({
  id: name,
  rank,
  previous_rank: rank,
  points,
  matches_played,
  teams: { id: name, name, slug: name },
});

describe("standings preseason ordering", () => {
  it("sorts embedded numbers numerically", () => {
    expect(naturalCompare("2 Team", "10 Team")).toBeLessThan(0);
    expect(naturalCompare("11 Team", "9 Team")).toBeGreaterThan(0);
  });

  it("orders preseason rows 1,2,9,10,11 and renumbers rank", () => {
    const rows = [row("10 Team", 1), row("2 Team", 2), row("11 Team", 3), row("1 Team", 4), row("9 Team", 5)];
    const out = orderStandingsRows(rows);
    expect(out.map((r) => r.teams.name)).toEqual(["1 Team", "2 Team", "9 Team", "10 Team", "11 Team"]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps ranked order once matches are played", () => {
    const rows = [row("10 Team", 1, 3, 15), row("2 Team", 2, 3, 10), row("1 Team", 3, 0, 0)];
    const out = orderStandingsRows(rows);
    expect(out.map((r) => r.teams.name)).toEqual(["10 Team", "2 Team", "1 Team"]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("detects preseason only when every row has zero matches", () => {
    expect(isPreseasonStandings([row("1 Team", 1), row("2 Team", 2)])).toBe(true);
    expect(isPreseasonStandings([row("1 Team", 1), row("2 Team", 2, 1)])).toBe(false);
    expect(isPreseasonStandings([])).toBe(false);
  });

  it("orders all 18 teams naturally with the #N prefix style", () => {
    const names = Array.from({ length: 18 }, (_, i) => `#${i + 1} TEAM`);
    const shuffled = [...names].sort();
    const out = orderStandingsRows(shuffled.map((n, i) => row(n, i + 1)));
    expect(out.map((r) => r.teams.name)).toEqual(names);
    expect(out.map((r) => r.rank)).toEqual(names.map((_, i) => i + 1));
  });

  it("preserves double-digit ranks through preseason reordering", () => {
    const rows = [
      row("#10 TEAM", 10),
      row("#2 TEAM", 2),
      row("#11 TEAM", 11),
      row("#1 TEAM", 1),
      row("#9 TEAM", 9),
    ];
    const out = orderStandingsRows(rows);
    expect(out.map((r) => r.teams.name)).toEqual(["#1 TEAM", "#2 TEAM", "#9 TEAM", "#10 TEAM", "#11 TEAM"]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });
});
