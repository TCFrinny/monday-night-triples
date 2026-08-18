/**
 * Monday Night Triples — INTERNAL SINGLES competition.
 *
 * Singles is an overlay on the existing Triples season: it borrows the league
 * weeks, the enrolled bowlers and — crucially — the scores entered once in
 * Triples score entry. There is no separate Singles scoring.
 *
 * Every rule that might change lives in SINGLES_RULES so nothing is scattered
 * across components.
 */

export const SINGLES_RULES = {
  /** Handicap = floor(percent% of (base - applicable average)), never negative. */
  handicapBase: 160,
  handicapPercent: 80,
  /** 3 games, one point each, no set point. */
  gamesPerMatch: 3,
  pointsPerGame: 1,
  /** A tied game splits the point. No other tie convention exists in the league. */
  tiePoints: 0.5,
  /** Singles runs 34 of the 36 Triples weeks; which two are skipped is admin-configured. */
  requiredActiveWeeks: 34,
  /** Position rounds are fixed to these Triples league weeks and count toward the 34. */
  mandatoryPositionWeeks: [18, 35] as number[],
  /** Prototype tiebreaker — change here only. */
  tiebreaker: "Points desc, then credited Singles pinfall desc",
} as const;

export const SINGLES_POINTS_PER_MATCH =
  SINGLES_RULES.gamesPerMatch * SINGLES_RULES.pointsPerGame;

/** floor(80% of (160 - average)); 0 when the average is at or above the base. */
export function singlesHandicap(
  applicableAverage: number,
  base: number = SINGLES_RULES.handicapBase,
  percent: number = SINGLES_RULES.handicapPercent,
): number {
  const avg = Number(applicableAverage);
  if (!Number.isFinite(avg)) return 0;
  const diff = Math.max(0, base - avg);
  return Math.floor((percent / 100) * diff);
}

export function adjustedScores(scratch: number[], handicap: number): number[] {
  return scratch.map((s) => (Number(s) || 0) + handicap);
}

export interface GamePoint {
  game: number;
  a: number;
  b: number;
}

/** One game: winner takes the point, a tie splits it. */
export function gamePoint(adjA: number, adjB: number, game = 1): GamePoint {
  if (adjA > adjB) return { game, a: SINGLES_RULES.pointsPerGame, b: 0 };
  if (adjB > adjA) return { game, a: 0, b: SINGLES_RULES.pointsPerGame };
  return { game, a: SINGLES_RULES.tiePoints, b: SINGLES_RULES.tiePoints };
}

export interface SinglesMatchPoints {
  gamePoints: GamePoint[];
  totalA: number;
  totalB: number;
}

/** 3-point Singles match: one point per game, no set point. */
export function singlesMatchPoints(adjA: number[], adjB: number[]): SinglesMatchPoints {
  const gamePoints = Array.from({ length: SINGLES_RULES.gamesPerMatch }, (_, i) =>
    gamePoint(adjA[i] ?? 0, adjB[i] ?? 0, i + 1),
  );
  return {
    gamePoints,
    totalA: gamePoints.reduce((s, g) => s + g.a, 0),
    totalB: gamePoints.reduce((s, g) => s + g.b, 0),
  };
}

/* -------------------------------------------------------------------------
 * Substitute attribution
 *
 * The scheduled Singles participant owns the matchup and receives the points
 * and the credited standings pinfall. The person who physically bowled owns
 * the scores, their own applicable average and their own handicap — handicap
 * is NEVER inherited. Personal averages/stats stay with whoever bowled, which
 * is exactly how the Triples lineup already stores it.
 * ---------------------------------------------------------------------- */

export interface TriplesLineupLike {
  /** Bowler who actually rolled; null for a blind. */
  bowler_id: string | null;
  /** Rostered bowler who was absent when a sub or blind is used. */
  absent_bowler_id: string | null;
  participation: string;
  applicable_average: number | string;
}

export interface SinglesSide {
  /** Scheduled Singles participant — receives points and standings pinfall. */
  scheduledBowlerId: string;
  /** Person who actually bowled — owns the score, average and handicap. */
  actualBowlerId: string | null;
  isSub: boolean;
  isBlind: boolean;
  applicableAverage: number;
  handicap: number;
}

/** Resolve which lineup row represents a scheduled Singles participant. */
export function lineupForParticipant<T extends TriplesLineupLike>(
  lineups: readonly T[],
  scheduledBowlerId: string,
): T | null {
  const asSelf = lineups.find(
    (l) => !l.absent_bowler_id && l.bowler_id === scheduledBowlerId,
  );
  if (asSelf) return asSelf;
  return lineups.find((l) => l.absent_bowler_id === scheduledBowlerId) ?? null;
}

export function resolveSinglesSide<T extends TriplesLineupLike>(
  lineups: readonly T[],
  scheduledBowlerId: string,
  base?: number,
  percent?: number,
): SinglesSide | null {
  const l = lineupForParticipant(lineups, scheduledBowlerId);
  if (!l) return null;
  const avg = Number(l.applicable_average) || 0;
  const actual = l.bowler_id ?? (l.participation === "blind" ? scheduledBowlerId : null);
  return {
    scheduledBowlerId,
    actualBowlerId: l.bowler_id,
    isSub: l.participation === "sub" && l.bowler_id !== scheduledBowlerId,
    isBlind: l.participation === "blind",
    applicableAverage: avg,
    handicap: singlesHandicap(avg, base, percent),
    ...(actual ? {} : {}),
  };
}

/* -------------------------------------------------------------------------
 * Active week configuration (34 of 36)
 * ---------------------------------------------------------------------- */

export interface WeekSelectionCheck {
  ok: boolean;
  errors: string[];
  selectedCount: number;
  missingPositionWeeks: number[];
}

export function validateActiveWeeks(
  selected: readonly number[],
  totalWeeks: number,
  required: number = SINGLES_RULES.requiredActiveWeeks,
  positionWeeks: readonly number[] = SINGLES_RULES.mandatoryPositionWeeks,
): WeekSelectionCheck {
  const set = new Set(selected);
  const errors: string[] = [];
  const missing = positionWeeks.filter((w) => !set.has(w));
  if (set.size !== required) {
    errors.push(`Select exactly ${required} league weeks (currently ${set.size}).`);
  }
  if (missing.length) {
    errors.push(
      `Position round week${missing.length > 1 ? "s" : ""} ${missing.join(", ")} must be selected.`,
    );
  }
  for (const w of set) {
    if (w < 1 || w > totalWeeks) errors.push(`Week ${w} is outside the season (1–${totalWeeks}).`);
  }
  return { ok: errors.length === 0, errors, selectedCount: set.size, missingPositionWeeks: missing };
}

export function isSinglesPositionWeek(
  weekNumber: number,
  positionWeeks: readonly number[] = SINGLES_RULES.mandatoryPositionWeeks,
): boolean {
  return positionWeeks.includes(weekNumber);
}

/* -------------------------------------------------------------------------
 * Schedule generation — bowler vs bowler only, never a lane.
 * ---------------------------------------------------------------------- */

export interface SinglesPairing {
  a: string;
  /** null = bye (odd participant count). */
  b: string | null;
}

export interface SinglesWeekPlan {
  weekNumber: number;
  isPositionRound: boolean;
  pairings: SinglesPairing[];
}

/** Circle-method round robin for one round index. */
export function roundRobinPairings(
  bowlerIds: readonly string[],
  roundIndex: number,
): SinglesPairing[] {
  const ids: (string | null)[] = [...bowlerIds];
  if (ids.length < 2) return [];
  if (ids.length % 2 === 1) ids.push(null);
  const n = ids.length;
  const fixed = ids[0]!;
  const rotating = ids.slice(1);
  const r = ((roundIndex % (n - 1)) + (n - 1)) % (n - 1);
  const rotated = [...rotating.slice(r), ...rotating.slice(0, r)];
  const order = [fixed, ...rotated];
  const pairings: SinglesPairing[] = [];
  for (let i = 0; i < n / 2; i++) {
    const x = order[i]!;
    const y = order[n - 1 - i]!;
    if (x === null && y === null) continue;
    if (x === null) pairings.push({ a: y as string, b: null });
    else if (y === null) pairings.push({ a: x, b: null });
    else pairings.push({ a: x, b: y });
  }
  return pairings;
}

/**
 * Regular-season schedule for the configured active weeks. Position-round
 * weeks are returned with no pairings: they stay pending until an admin
 * generates them deliberately from the standings.
 */
export function generateSinglesSchedule(
  bowlerIds: readonly string[],
  activeWeeks: readonly number[],
  positionWeeks: readonly number[] = SINGLES_RULES.mandatoryPositionWeeks,
): SinglesWeekPlan[] {
  const weeks = [...activeWeeks].sort((a, b) => a - b);
  let round = 0;
  return weeks.map((weekNumber) => {
    const isPositionRound = positionWeeks.includes(weekNumber);
    if (isPositionRound) return { weekNumber, isPositionRound, pairings: [] };
    const pairings = roundRobinPairings(bowlerIds, round);
    round += 1;
    return { weekNumber, isPositionRound, pairings };
  });
}

/** Position round: 1v2, 3v4, … odd standings count leaves the last bowler a bye. */
export function positionRoundPairings(standingsOrder: readonly string[]): SinglesPairing[] {
  const pairings: SinglesPairing[] = [];
  for (let i = 0; i < standingsOrder.length; i += 2) {
    const a = standingsOrder[i]!;
    const b = standingsOrder[i + 1] ?? null;
    pairings.push({ a, b });
  }
  return pairings;
}

/* -------------------------------------------------------------------------
 * Standings
 * ---------------------------------------------------------------------- */

export interface SinglesStandingRowLike {
  bowler_id: string;
  points: number | string;
  pinfall: number | string;
}

/** Prototype tiebreaker: points desc, then credited Singles pinfall desc. */
export function sortSinglesStandings<T extends SinglesStandingRowLike>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (x, y) =>
      Number(y.points) - Number(x.points) || Number(y.pinfall) - Number(x.pinfall),
  );
}

export function formatSinglesPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : Number(points).toFixed(1);
}
