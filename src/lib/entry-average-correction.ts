/**
 * Retroactive entering-average correction.
 *
 * A bowler's entry average is snapshotted onto each match lineup when the
 * match is seeded (average_source = "entry"). Correcting a wrong entry
 * average must therefore repair those snapshots and re-finalize the affected
 * matches — actual bowling scores, frames and stats never change.
 */

export interface CorrectionLineupRow {
  id: string;
  match_id: string;
  bowler_id: string | null;
  absent_bowler_id: string | null;
  average_source: string;
  applicable_average: number;
  participation: string;
  matches?: {
    id: string;
    status: string;
    weeks?: { week_number: number } | null;
    team_a?: { name: string } | null;
    team_b?: { name: string } | null;
  } | null;
}

/** True when this lineup's snapshot average belongs to the given bowler. */
export function lineupOwnedByBowler(row: CorrectionLineupRow, bowlerId: string): boolean {
  return row.bowler_id === bowlerId || row.absent_bowler_id === bowlerId;
}

/**
 * The lineup snapshots a correction must update: only rows whose average was
 * sourced from the entry average. Established ("current"/league) snapshots
 * are historical fact and stay untouched.
 */
export function entrySourceTargets(rows: CorrectionLineupRow[], bowlerId: string) {
  return rows.filter((r) => lineupOwnedByBowler(r, bowlerId) && r.average_source === "entry");
}

export interface CorrectionPreviewMatch {
  matchId: string;
  week: number | null;
  label: string;
  status: string;
}

export interface CorrectionPreview {
  snapshots: number;
  finalized: CorrectionPreviewMatch[];
  unfinalized: CorrectionPreviewMatch[];
}

/** Shape the affected lineups into a per-match preview for the admin UI. */
export function shapeCorrectionPreview(
  targets: CorrectionLineupRow[],
): CorrectionPreview {
  const byMatch = new Map<string, CorrectionPreviewMatch>();
  for (const t of targets) {
    const m = t.matches;
    if (!m || byMatch.has(m.id)) continue;
    const a = m.team_a?.name ?? "?";
    const b = m.team_b?.name ?? "Bye";
    byMatch.set(m.id, {
      matchId: m.id,
      week: m.weeks?.week_number ?? null,
      label: `${a} vs ${b}`,
      status: m.status,
    });
  }
  const all = [...byMatch.values()].sort((x, y) => (x.week ?? 0) - (y.week ?? 0));
  return {
    snapshots: targets.length,
    finalized: all.filter((m) => m.status === "final"),
    unfinalized: all.filter((m) => m.status !== "final"),
  };
}

/** Validate a corrected average before any mutation. */
export function validateCorrectedAverage(
  value: number,
  current: number,
): string | null {
  if (!Number.isFinite(value) || value < 0 || value > 300) return "Enter an average between 0 and 300.";
  if (value === current) return "That is already the current entering average.";
  return null;
}
