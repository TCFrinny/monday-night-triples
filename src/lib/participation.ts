/**
 * Season / Third individual-leaderboard participation rule.
 *
 * A bowler only appears on most individual Season/Third leaderboards if they
 * bowled at least 2/3 of their TEAM'S completed games in that scope.
 *
 * Team-game opportunities are derived from actual finalized, non-bye matches
 * and roster history, so teams with fewer completed matches, mid-season roster
 * moves, and newly added teams all get their own correct denominator.
 */

export interface ParticipationMatchRow {
  status?: string | null;
  is_bye?: boolean | null;
  team_a_id?: string | null;
  team_b_id?: string | null;
  weeks?: { week_number?: number | null; third?: number | null } | null;
}

export interface ParticipationRosterRow {
  team_id: string;
  bowler_id: string;
  effective_from_week: number;
  effective_to_week: number | null;
}

/** Games bowled per finalized team match. */
const GAMES_PER_MATCH = 3;

/** Board keys exempt from the 2/3 participation minimum. */
export const PARTICIPATION_EXEMPT_BOARDS = new Set([
  "hg",
  "hs",
  "strikes",
  "sparect",
  "clean",
  "streak",
  "marks",
]);

export const isParticipationExempt = (key: string) => PARTICIPATION_EXEMPT_BOARDS.has(key);

/** Scope -> third number, or null for the full season. */
export function scopeThird(scope: string): number | null {
  const m = /^third_(\d+)$/.exec(scope);
  return m ? Number(m[1]) : null;
}

function matchCounts(match: ParticipationMatchRow, third: number | null): boolean {
  if (match.status !== "final") return false;
  if (match.is_bye) return false;
  if (third !== null && Number(match.weeks?.third) !== third) return false;
  return Number.isFinite(Number(match.weeks?.week_number));
}

function rosterActive(spot: ParticipationRosterRow, week: number): boolean {
  if (spot.effective_from_week > week) return false;
  return spot.effective_to_week === null || spot.effective_to_week >= week;
}

/**
 * Team-game opportunities per bowler for the given scope: every finalized,
 * non-bye match gives +3 to each bowler rostered on that team for that league
 * week. Duplicate roster rows for the same bowler/team/week count once.
 */
export function teamGameOpportunities(
  matches: ParticipationMatchRow[] | null | undefined,
  spots: ParticipationRosterRow[] | null | undefined,
  scope: string,
): Map<string, number> {
  const third = scopeThird(scope);
  const out = new Map<string, number>();
  for (const match of matches ?? []) {
    if (!matchCounts(match, third)) continue;
    const week = Number(match.weeks?.week_number);
    for (const teamId of [match.team_a_id, match.team_b_id]) {
      if (!teamId) continue;
      const seen = new Set<string>();
      for (const spot of spots ?? []) {
        if (spot.team_id !== teamId) continue;
        if (!rosterActive(spot, week)) continue;
        if (seen.has(spot.bowler_id)) continue;
        seen.add(spot.bowler_id);
        out.set(spot.bowler_id, (out.get(spot.bowler_id) ?? 0) + GAMES_PER_MATCH);
      }
    }
  }
  return out;
}

/** Minimum games each bowler must have bowled: ceil(opportunities * 2 / 3). */
export function participationMinimums(
  matches: ParticipationMatchRow[] | null | undefined,
  spots: ParticipationRosterRow[] | null | undefined,
  scope: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [bowlerId, opportunities] of teamGameOpportunities(matches, spots, scope)) {
    out.set(bowlerId, Math.ceil((opportunities * 2) / 3));
  }
  return out;
}

export const PARTICIPATION_NOTE =
  "Most individual leaderboards require at least 2/3 of the team's completed games in the selected scope. High Game, High Set, Most Strikes, Most Spares, Clean Games, Longest Strike Streak and Total Marks are exempt.";
