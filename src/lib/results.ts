/**
 * Per-game team totals for finalized matches.
 *
 * Finalized matches store a rich snapshot in `matches.game_points`:
 *   { game, a_scratch, b_scratch, a_hdcp, b_hdcp, a, b }
 * Legacy rows only stored { game, a, b }. For those we derive the per-game
 * team totals from match_lineups -> bowler_games using the handicap snapshot
 * that was stored on the match, so historical results never change.
 */

import { blindScore } from "@/lib/league";

export interface GameSnapshot {
  [key: string]: number;
  game: number;
  a_scratch: number;
  b_scratch: number;
  a_hdcp: number;
  b_hdcp: number;
  a: number;
  b: number;
}


export interface LineupGameRow {
  team_id: string;
  participation?: string | null;
  applicable_average?: number | string | null;
  bowler_games?: { game_number: number; scratch_score: number }[] | null;
}

export function isRichSnapshot(rows: unknown): rows is GameSnapshot[] {
  return (
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every(
      (r) =>
        r &&
        typeof r === "object" &&
        typeof (r as any).a_scratch === "number" &&
        typeof (r as any).b_scratch === "number" &&
        typeof (r as any).a_hdcp === "number" &&
        typeof (r as any).b_hdcp === "number",
    )
  );
}

/** Sum a side's scratch score for one game, filling blinds that have no row. */
export function scratchForGame(
  lineups: LineupGameRow[],
  game: number,
  blindDeduction: number,
): number {
  return lineups.reduce((sum, l) => {
    const g = (l.bowler_games ?? []).find((x) => x.game_number === game);
    if (g) return sum + (Number(g.scratch_score) || 0);
    if (l.participation === "blind")
      return sum + blindScore(Number(l.applicable_average) || 0, blindDeduction);
    return sum;
  }, 0);
}

export function buildGameSnapshot(args: {
  scratchA: number[];
  scratchB: number[];
  hdcpA: number[];
  hdcpB: number[];
  gamePoints: { game: number; a: number; b: number }[];
}): GameSnapshot[] {
  return [0, 1, 2].map((i) => ({
    game: i + 1,
    a_scratch: args.scratchA[i] ?? 0,
    b_scratch: args.scratchB[i] ?? 0,
    a_hdcp: args.hdcpA[i] ?? 0,
    b_hdcp: args.hdcpB[i] ?? 0,
    a: args.gamePoints[i]?.a ?? 0,
    b: args.gamePoints[i]?.b ?? 0,
  }));
}

/**
 * Resolve the per-game snapshot for a match: use the stored rich snapshot when
 * present, otherwise derive it from the lineups and the stored handicap.
 */
export function resolveGameSnapshot(args: {
  gamePoints: unknown;
  lineups: LineupGameRow[];
  teamAId: string;
  teamBId: string | null;
  handicapTeamId: string | null;
  handicapPins: number;
  blindDeduction: number;
}): GameSnapshot[] {
  if (isRichSnapshot(args.gamePoints)) return args.gamePoints;

  const legacy = Array.isArray(args.gamePoints) ? (args.gamePoints as any[]) : [];
  const sideA = args.lineups.filter((l) => l.team_id === args.teamAId);
  const sideB = args.lineups.filter((l) => l.team_id === args.teamBId);
  const pinsA = args.handicapTeamId && args.handicapTeamId === args.teamAId ? args.handicapPins : 0;
  const pinsB = args.handicapTeamId && args.handicapTeamId === args.teamBId ? args.handicapPins : 0;

  return [1, 2, 3].map((game) => {
    const a_scratch = scratchForGame(sideA, game, args.blindDeduction);
    const b_scratch = scratchForGame(sideB, game, args.blindDeduction);
    const legacyRow = legacy.find((r) => Number(r?.game) === game) ?? {};
    return {
      game,
      a_scratch,
      b_scratch,
      a_hdcp: a_scratch + pinsA,
      b_hdcp: b_scratch + pinsB,
      a: Number(legacyRow.a) || 0,
      b: Number(legacyRow.b) || 0,
    };
  });
}
