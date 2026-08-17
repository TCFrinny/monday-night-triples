/**
 * Team-count synchronization.
 *
 * The season's `team_count` is a configuration value only — changing it never
 * created or removed rows in `teams`. These helpers turn that setting into an
 * explicit, non-destructive plan the admin can review and apply.
 *
 * Rules:
 * - Existing team rows are never replaced, renamed, or deleted. Ids, slugs,
 *   rosters, matchups and cached stats always stay attached.
 * - Missing slots become editable numbered placeholders that continue the
 *   season's existing numbering style.
 * - A decreased team count never deletes anything; it only warns.
 * - Nothing is created while the season has finalized results.
 */

export interface TeamNameRow {
  id: string;
  name: string;
}

export interface PlannedTeam {
  number: number;
  name: string;
}

export interface TeamSyncPlan {
  configured: number;
  actual: number;
  /** Placeholder teams to create, in ascending number order. */
  creates: PlannedTeam[];
  /** How many rows exceed the configured count (never auto-removed). */
  surplus: number;
  /** True when the configured count is lower than the actual row count. */
  isDecrease: boolean;
  /** Existing ids, preserved verbatim. */
  preservedIds: string[];
  /** Set when creation is not allowed (e.g. finalized results exist). */
  blockedReason: string | null;
}

const NUMBER_RE = /^\s*#?\s*(\d{1,3})\b/;

/** Leading team number in a name such as "#3 SMITH - JONES" or "7 Team". */
export function parseTeamNumber(name: string): number | null {
  const m = NUMBER_RE.exec(name ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** True when the season's existing names use the "#N" prefix style. */
export function usesHashPrefix(teams: TeamNameRow[]): boolean {
  return teams.some((t) => /^\s*#\s*\d/.test(t.name ?? ""));
}

/** Placeholder label for a missing slot, matching the season's style. */
export function placeholderName(n: number, hashStyle: boolean): string {
  return hashStyle ? `#${n} TEAM` : `${n} Team`;
}

export function planTeamSync(input: {
  configuredCount: number;
  teams: TeamNameRow[];
  hasFinalizedResults: boolean;
}): TeamSyncPlan {
  const teams = input.teams ?? [];
  const configured = Math.max(0, Math.trunc(input.configuredCount || 0));
  const actual = teams.length;
  const hashStyle = usesHashPrefix(teams);

  const used = new Set<number>();
  for (const t of teams) {
    const n = parseTeamNumber(t.name);
    if (n) used.add(n);
  }

  const creates: PlannedTeam[] = [];
  // Fill unused numbers first (gaps in the existing numbering), then continue
  // naturally past the highest number in use.
  let candidate = 1;
  while (actual + creates.length < configured) {
    if (!used.has(candidate)) {
      used.add(candidate);
      creates.push({ number: candidate, name: placeholderName(candidate, hashStyle) });
    }
    candidate += 1;
    if (candidate > 999) break;
  }

  const blockedReason = input.hasFinalizedResults
    ? "This season already has finalized results. Structural team changes must be made deliberately."
    : null;

  return {
    configured,
    actual,
    creates: blockedReason ? [] : creates,
    surplus: Math.max(0, actual - configured),
    isDecrease: configured > 0 && configured < actual,
    preservedIds: teams.map((t) => t.id),
    blockedReason,
  };
}

/**
 * Matches per week for an even/odd team count. Odd counts carry one bye.
 * 18 teams -> 9 matches, no bye.
 */
export function matchesPerWeek(teamCount: number): { matches: number; byes: number } {
  const n = Math.max(0, Math.trunc(teamCount || 0));
  return { matches: Math.floor(n / 2), byes: n % 2 };
}
