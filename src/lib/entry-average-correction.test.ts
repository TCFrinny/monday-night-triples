import { describe, expect, it } from "vitest";
import {
  entrySourceTargets,
  lineupOwnedByBowler,
  shapeCorrectionPreview,
  validateCorrectedAverage,
  type CorrectionLineupRow,
} from "./entry-average-correction";

const B = "bowler-1";

function row(partial: Partial<CorrectionLineupRow>): CorrectionLineupRow {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    match_id: partial.match_id ?? "m1",
    bowler_id: partial.bowler_id ?? B,
    absent_bowler_id: partial.absent_bowler_id ?? null,
    average_source: partial.average_source ?? "entry",
    applicable_average: partial.applicable_average ?? 124,
    participation: partial.participation ?? "rostered",
    matches: partial.matches ?? null,
  };
}

describe("lineupOwnedByBowler", () => {
  it("matches the actual bowler", () => {
    expect(lineupOwnedByBowler(row({ bowler_id: B }), B)).toBe(true);
  });
  it("matches the absent bowler behind a blind lineup", () => {
    expect(lineupOwnedByBowler(row({ bowler_id: null, absent_bowler_id: B, participation: "blind" }), B)).toBe(true);
  });
  it("does not match other bowlers", () => {
    expect(lineupOwnedByBowler(row({ bowler_id: "other" }), B)).toBe(false);
  });
});

describe("entrySourceTargets", () => {
  it("keeps only entry-source snapshots owned by the bowler", () => {
    const rows = [
      row({ id: "entry", average_source: "entry" }),
      row({ id: "league", average_source: "current" }),
      row({ id: "blind", bowler_id: null, absent_bowler_id: B, average_source: "entry", participation: "blind" }),
      row({ id: "other", bowler_id: "other", average_source: "entry" }),
    ];
    expect(entrySourceTargets(rows, B).map((r) => r.id)).toEqual(["entry", "blind"]);
  });

  it("a blind snapshot for the corrected bowler is a target (blind score changes on recalc)", () => {
    const targets = entrySourceTargets(
      [row({ bowler_id: null, absent_bowler_id: B, participation: "blind" })],
      B,
    );
    expect(targets).toHaveLength(1);
  });

  it("league-source snapshots remain unchanged", () => {
    expect(entrySourceTargets([row({ average_source: "current" })], B)).toHaveLength(0);
  });
});

describe("shapeCorrectionPreview", () => {
  const match = (id: string, week: number, status: string) => ({
    id,
    status,
    weeks: { week_number: week },
    team_a: { name: `#${week} A` },
    team_b: { name: `#${week} B` },
  });

  it("splits finalized and unfinalized matches, deduped per match, sorted by week", () => {
    const targets = [
      row({ match_id: "m3", matches: match("m3", 3, "final") }),
      row({ match_id: "m1", matches: match("m1", 1, "final") }),
      row({ match_id: "m1", matches: match("m1", 1, "final") }), // second slot same match
      row({ match_id: "m5", matches: match("m5", 5, "scheduled") }),
    ];
    const preview = shapeCorrectionPreview(targets);
    expect(preview.snapshots).toBe(4);
    expect(preview.finalized.map((m) => m.matchId)).toEqual(["m1", "m3"]);
    expect(preview.unfinalized.map((m) => m.matchId)).toEqual(["m5"]);
    expect(preview.finalized[0]!.label).toBe("#1 A vs #1 B");
  });

  it("handles a bowler with no entry-source history", () => {
    const preview = shapeCorrectionPreview([]);
    expect(preview).toEqual({ snapshots: 0, finalized: [], unfinalized: [] });
  });
});

describe("validateCorrectedAverage", () => {
  it("rejects no-op and invalid averages", () => {
    expect(validateCorrectedAverage(124, 124)).toMatch(/already/);
    expect(validateCorrectedAverage(-1, 124)).toMatch(/between/);
    expect(validateCorrectedAverage(301, 124)).toMatch(/between/);
    expect(validateCorrectedAverage(Number.NaN, 124)).toMatch(/between/);
  });
  it("accepts a real correction", () => {
    expect(validateCorrectedAverage(130, 124)).toBeNull();
  });
});
