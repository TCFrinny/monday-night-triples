/**
 * Monday Night Triples league rules: handicap, applicable averages, points, thirds.
 * These are the authoritative helpers — never recompute historical matches from
 * current averages; matches store the snapshot values used at the time.
 */

export interface SeasonRules {
  handicap_percent: number;
  establishment_threshold: number;
  blind_deduction: number;
  third_boundaries: number[];
  position_round_weeks: number[];
  total_weeks: number;
}

export type AverageSource = "entry" | "current";

/** Truncate an average DOWN to a whole pin: 149.9 -> 149. */
export function truncateAverage(avg: number): number {
  return Math.floor(avg);
}

/**
 * Applicable average for a bowler in a given week.
 * Entry Average is used until the bowler has COMPLETED the establishment
 * threshold (default 15) games. Once reached, the Current League Average is
 * used beginning the FOLLOWING week — so a bowler starting the week with 14
 * games uses the Entry Average for the entire match.
 */
export function applicableAverage(args: {
  entryAverage: number;
  currentAverage: number | null;
  gamesBefore: number;
  threshold: number;
}): { value: number; source: AverageSource } {
  const established = args.gamesBefore >= args.threshold && args.currentAverage !== null;
  return established
    ? { value: args.currentAverage as number, source: "current" }
    : { value: args.entryAverage, source: "entry" };
}

/** Team average = sum of each bowler's applicable average, truncated individually. */
export function teamAverage(applicableAverages: number[]): number {
  return applicableAverages.reduce((sum, a) => sum + truncateAverage(a), 0);
}

export interface HandicapResult {
  /** Team receiving the pins, or null when averages are equal. */
  receivingSide: "a" | "b" | null;
  /** Pins granted PER GAME to the receiving team. */
  pins: number;
}

/**
 * Team handicap = handicap% of the difference between the two team averages,
 * rounded DOWN. The lower-average team receives it per game; the higher gets 0.
 * There is NO individual handicap.
 */
export function teamHandicap(
  teamAvgA: number,
  teamAvgB: number,
  handicapPercent: number,
): HandicapResult {
  if (teamAvgA === teamAvgB) return { receivingSide: null, pins: 0 };
  const diff = Math.abs(teamAvgA - teamAvgB);
  const pins = Math.floor((diff * handicapPercent) / 100);
  return { receivingSide: teamAvgA < teamAvgB ? "a" : "b", pins };
}

/** Blind score for one game = applicable average (truncated) minus the deduction. */
export function blindScore(applicableAvg: number, blindDeduction: number): number {
  return Math.max(0, truncateAverage(applicableAvg) - blindDeduction);
}

export interface MatchPoints {
  gamePoints: { game: number; a: number; b: number }[];
  setPointA: number;
  setPointB: number;
  totalA: number;
  totalB: number;
}

/**
 * 7 points per match: 2 points per game (x3) plus 1 point for the set.
 * Tied game = 1 each. Tied set = 0.5 each. All comparisons use HANDICAP scores.
 */
export function computeMatchPoints(hdcpA: number[], hdcpB: number[]): MatchPoints {
  const gamePoints = [0, 1, 2].map((i) => {
    const a = hdcpA[i] ?? 0;
    const b = hdcpB[i] ?? 0;
    if (a > b) return { game: i + 1, a: 2, b: 0 };
    if (b > a) return { game: i + 1, a: 0, b: 2 };
    return { game: i + 1, a: 1, b: 1 };
  });
  const setA = hdcpA.reduce((x, y) => x + y, 0);
  const setB = hdcpB.reduce((x, y) => x + y, 0);
  const setPointA = setA > setB ? 1 : setA === setB ? 0.5 : 0;
  const setPointB = setB > setA ? 1 : setA === setB ? 0.5 : 0;
  return {
    gamePoints,
    setPointA,
    setPointB,
    totalA: gamePoints.reduce((s, g) => s + g.a, 0) + setPointA,
    totalB: gamePoints.reduce((s, g) => s + g.b, 0) + setPointB,
  };
}

/** Which third a week belongs to, based on the season's boundaries. */
export function thirdForWeek(weekNumber: number, boundaries: number[]): number {
  const bounds = boundaries.length ? boundaries : [12, 24, 36];
  for (let i = 0; i < bounds.length; i++) {
    if (weekNumber <= (bounds[i] as number)) return i + 1;
  }
  return bounds.length;
}

export type StandingsScope = "full" | "third_1" | "third_2" | "third_3";

export const SCOPE_LABELS: Record<StandingsScope, string> = {
  full: "Full Season",
  third_1: "1st Third",
  third_2: "2nd Third",
  third_3: "3rd Third",
};

export function scopeForThird(third: number): StandingsScope {
  const t = Math.min(3, Math.max(1, third));
  return `third_${t}` as StandingsScope;
}


export function isPositionRound(weekNumber: number, positionRoundWeeks: number[]): boolean {
  return positionRoundWeeks.includes(weekNumber);
}

export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

export function formatAverage(avg: number | null | undefined): string {
  if (avg === null || avg === undefined) return "—";
  return Number(avg).toFixed(2);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Points available per match (2 per game x3, plus 1 for the set). */
export const POINTS_PER_MATCH = 7;

export interface TeamRecord {
  wins: number;
  losses: number;
}

/**
 * Standings W-L record. The 7 available match points ARE the wins; the
 * remaining points of each played match are losses. A tied game gives 1.0/1.0
 * and a tied set 0.5/0.5, which falls out of this automatically.
 */
export function recordFromPoints(points: number, matchesPlayed: number): TeamRecord {
  const wins = Number(points) || 0;
  const losses = Math.max(0, (Number(matchesPlayed) || 0) * POINTS_PER_MATCH - wins);
  return { wins, losses };
}

/** One decimal only when needed: 5 -> "5", 3.5 -> "3.5". */
export function formatRecordValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatRecord(record: TeamRecord): string {
  return `${formatRecordValue(record.wins)}-${formatRecordValue(record.losses)}`;
}

/**
 * Standard games-behind, valid with unequal matches played:
 * GB = ((leaderW - teamW) + (teamL - leaderL)) / 2
 */
export function gamesBehind(leader: TeamRecord, team: TeamRecord): number {
  return ((leader.wins - team.wins) + (team.losses - leader.losses)) / 2;
}

/** First place (or better) shows an em dash. */
export function formatGamesBehind(gb: number): string {
  if (gb <= 0) return "—";
  return gb.toFixed(1);
}
