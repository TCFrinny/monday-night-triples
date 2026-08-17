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
});
