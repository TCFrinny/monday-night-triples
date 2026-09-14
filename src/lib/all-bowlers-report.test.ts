import { describe, expect, it } from "vitest";
import { shapeAllBowlersReport } from "@/lib/all-bowlers-report";

describe("all bowlers report", () => {
  it("labels, shapes, and naturally sorts rostered bowlers and subs", () => {
    const bowlers = [
      { id: "sub", full_name: "Alpha Sub", entry_average: 98, is_active: true, is_sub: true, roster_spots: [] },
      { id: "zero", full_name: "Zero Games", entry_average: 101.5, is_active: true, is_sub: false, roster_spots: [{ effective_to_week: null, teams: { name: "#2 Team" } }] },
      { id: "regular", full_name: "Regular Bowler", entry_average: 120.125, is_active: true, is_sub: false, roster_spots: [{ effective_to_week: null, teams: { name: "#10 Team" } }] },
      { id: "rostered-sub", full_name: "Rostered Sub", entry_average: 110, is_active: true, is_sub: true, roster_spots: [{ effective_to_week: null, teams: { name: "#1 Team" } }] },
      { id: "inactive", full_name: "Inactive", entry_average: 130, is_active: false, is_sub: false, roster_spots: [] },
    ];
    const stats = [{ bowler_id: "regular", games: 3, average: 123.456, high_game: 150, high_set: 370 }];
    const rows = shapeAllBowlersReport(bowlers, stats);

    expect(rows.map((row) => row.name)).toEqual(["Rostered Sub", "Zero Games", "Regular Bowler", "Alpha Sub"]);
    expect(rows[0]?.team).toBe("#1 Team");
    expect(rows[3]?.team).toBe("SUB");
    expect(rows[1]).toMatchObject({ enteringAverage: "101.50", average: "—", games: 0, highGame: null, highSet: null });
    expect(rows[2]).toMatchObject({ enteringAverage: "120.13", average: "123.46", games: 3, highGame: 150, highSet: 370 });
  });
});