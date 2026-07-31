/**
 * Roster helpers. A team has exactly ONE active assignment per slot (1..3) at a
 * given week. History is preserved via effective_from_week / effective_to_week —
 * never delete a historical row once matches reference it.
 */

export interface RosterSpotRow {
  id: string;
  team_id: string;
  slot: number;
  bowler_id: string;
  effective_from_week: number;
  effective_to_week: number | null;
  bowlers?: { id: string; full_name: string; slug: string; entry_average: number; is_sub: boolean } | null;
}

/** Is this roster row in force during the given week? */
export function spotActiveInWeek(spot: RosterSpotRow, week: number): boolean {
  if (spot.effective_from_week > week) return false;
  return spot.effective_to_week === null || spot.effective_to_week >= week;
}

/** The three current slots for a team in a given week (index 0 => slot 1). */
export function rosterForWeek(
  spots: RosterSpotRow[] | null | undefined,
  teamId: string,
  week: number,
): (RosterSpotRow | null)[] {
  const rows = (spots ?? []).filter((s) => s.team_id === teamId && spotActiveInWeek(s, week));
  return [1, 2, 3].map((slot) => rows.find((r) => r.slot === slot) ?? null);
}

/** Currently-active roster rows (no end week), used for setup screens. */
export function currentRoster(
  spots: RosterSpotRow[] | null | undefined,
  teamId: string,
): (RosterSpotRow | null)[] {
  const rows = (spots ?? []).filter((s) => s.team_id === teamId && s.effective_to_week === null);
  return [1, 2, 3].map((slot) => rows.find((r) => r.slot === slot) ?? null);
}

/** Map bowler id -> team id for every currently-active roster member. */
export function activeTeamByBowler(spots: RosterSpotRow[] | null | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of spots ?? []) if (s.effective_to_week === null) m.set(s.bowler_id, s.team_id);
  return m;
}

/**
 * The week currently being played: the lowest week number that still has an
 * unfinalized (or missing) match. Falls back to week 1.
 */
export function currentWeekNumber(
  weeks: { id: string; week_number: number }[] | null | undefined,
  matches: { weeks: { id: string }; status: string }[] | null | undefined,
): number {
  const list = [...(weeks ?? [])].sort((a, b) => a.week_number - b.week_number);
  for (const w of list) {
    const rows = (matches ?? []).filter((m) => m.weeks?.id === w.id);
    if (!rows.length || rows.some((m) => m.status !== "final")) return w.week_number;
  }
  return list[list.length - 1]?.week_number ?? 1;
}
