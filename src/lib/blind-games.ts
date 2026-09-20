/**
 * Per-game blind semantics.
 *
 * Blindness is a property of ONE GAME (`bowler_games.is_blind`), never of the
 * whole lineup. A bowler can roll games 1–2 and be blind for game 3; the
 * lineup keeps its identity (bowler_id stays set) and only the blind game is
 * excluded from individual statistics.
 *
 * Legacy compatibility: older matches stored a full-match blind as
 * `match_lineups.participation = 'blind'` with `bowler_id = null`. When a
 * lineup has no per-game row yet, that legacy flag still means "all games
 * blind". Once per-game rows exist they are authoritative.
 */

import { blindScore } from "@/lib/league";
import { scoreGame, type Frame } from "@/lib/duckpin";

export interface BlindLineupLike {
  participation?: string | null;
  applicable_average?: number | string | null;
  bowler_games?: { game_number: number; is_blind?: boolean | null }[] | null;
}

/**
 * True when THIS game is blind. A stored game row wins; with no row, a legacy
 * lineup-level blind covers every game.
 */
export function isGameBlind(lineup: BlindLineupLike | null | undefined, gameNumber: number): boolean {
  if (!lineup) return false;
  const g = (lineup.bowler_games ?? []).find((x) => x.game_number === gameNumber);
  if (g) return Boolean(g.is_blind);
  return lineup.participation === "blind";
}

/** Blind value for one game from the lineup's stored applicable average. */
export function gameBlindValue(
  lineup: BlindLineupLike | null | undefined,
  blindDeduction: number,
): number {
  if (!lineup) return 0;
  return blindScore(Number(lineup.applicable_average) || 0, blindDeduction);
}

/**
 * Scratch for one game: the blind value when the game is blind, otherwise the
 * sheet score. Other games are never affected by this game's blind state.
 */
export function gameScratch(args: {
  lineup: BlindLineupLike | null | undefined;
  gameNumber: number;
  frames: Frame[] | undefined;
  blindDeduction: number;
}): number {
  if (isGameBlind(args.lineup, args.gameNumber)) {
    return gameBlindValue(args.lineup, args.blindDeduction);
  }
  return args.frames ? scoreGame(args.frames).total : 0;
}

export interface BlindTogglePlan {
  isBlind: boolean;
  blindValue: number;
}

/**
 * What to persist when an admin toggles one game. Only this game's row is
 * written; frames for other games are never touched.
 */
export function planBlindToggle(args: {
  lineup: BlindLineupLike;
  gameNumber: number;
  makeBlind: boolean;
  blindDeduction: number;
}): BlindTogglePlan {
  return {
    isBlind: args.makeBlind,
    blindValue: args.makeBlind ? gameBlindValue(args.lineup, args.blindDeduction) : 0,
  };
}
