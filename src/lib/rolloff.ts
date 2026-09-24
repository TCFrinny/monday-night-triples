/**
 * Triples roll-off rules (confirmed by the league president).
 *
 * Triples ties are NEVER split:
 * - Tied G1/G2: decided by each team's FIRST FRAME of the NEXT game (natural
 *   frame score incl. strike/spare bonus). The team that normally receives the
 *   match handicap gets floor(10% of the per-game handicap); the other gets 0.
 *   If that roll-off is itself tied (or can't be scored because a bowler is
 *   blind in the next game) an admin picks the winner.
 * - Tied G3 and tied set: admin picks the roll-off winner manually.
 * Roll-offs never add pinfall — they only decide who gets the points.
 *
 * Singles is separate and still splits ties (see computeMatchPoints / singles).
 */
import { scoreGame, type Frame } from "@/lib/duckpin";
import type { HandicapResult } from "@/lib/league";

export type Side = "a" | "b";
export type RolloffKey = "game1" | "game2" | "game3" | "set";
export type RolloffDecisions = Partial<Record<RolloffKey, Side>>;

export function parseDecisions(raw: unknown): RolloffDecisions {
  const out: RolloffDecisions = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of ["game1", "game2", "game3", "set"] as const) {
    const v = (raw as Record<string, unknown>)[k];
    if (v === "a" || v === "b") out[k] = v;
  }
  return out;
}

/** Roll-off handicap = 10% of the normal per-game team handicap, rounded down. */
export function rolloffHandicap(pins: number): number {
  return Math.floor((Math.max(0, pins) * 10) / 100);
}

/** Natural score of frame 1 (incl. bonus), or null when not yet scoreable. */
export function frameOneNatural(frames: Frame[] | null | undefined): number | null {
  if (!frames) return null;
  const f = scoreGame(frames).frames[0];
  return f && f.cumulative !== null ? f.frameScore : null;
}

export interface TeamFrameOne {
  score: number | null;
  /** Why it couldn't be scored: "blind" (no frames exist) or "incomplete". */
  reason?: "blind" | "incomplete";
}

/** Sum each bowler's natural frame 1 for one team's next game. */
export function teamFrameOne(bowlers: { blind: boolean; frames: Frame[] | null }[]): TeamFrameOne {
  if (bowlers.some((b) => b.blind)) return { score: null, reason: "blind" };
  let total = 0;
  for (const b of bowlers) {
    const s = frameOneNatural(b.frames);
    if (s === null) return { score: null, reason: "incomplete" };
    total += s;
  }
  return bowlers.length ? { score: total } : { score: null, reason: "incomplete" };
}

export interface GameRolloff {
  method: "auto" | "manual" | "pending";
  /** For G1/G2 automatic roll-offs. */
  nextGame?: number;
  aScratch?: number | null;
  bScratch?: number | null;
  aHdcp?: number;
  bHdcp?: number;
  aTotal?: number | null;
  bTotal?: number | null;
  /** Auto roll-off computed but tied. */
  autoTied?: boolean;
  /** A manual choice is allowed/required here. */
  manualAllowed: boolean;
  winner: Side | null;
  message: string | null;
}

export interface TriplesGameResult {
  game: number;
  a: number;
  b: number;
  tied: boolean;
  rolloff: GameRolloff | null;
}

export interface TriplesPoints {
  gamePoints: TriplesGameResult[];
  set: { tied: boolean; winner: Side | null; a: number; b: number; manualAllowed: boolean; message: string | null };
  setPointA: number;
  setPointB: number;
  totalA: number;
  totalB: number;
  /** Human-readable reasons finalization must wait. Empty = ready. */
  pending: string[];
  /** Only the manual decisions that currently apply (stale ones dropped). */
  decisions: RolloffDecisions;
}

export function computeTriplesPoints(args: {
  hdcpA: number[];
  hdcpB: number[];
  handicap: HandicapResult;
  /** Team frame-1 results for games 2 and 3. */
  frameOne: Partial<Record<2 | 3, { a: TeamFrameOne; b: TeamFrameOne }>>;
  decisions?: RolloffDecisions;
}): TriplesPoints {
  const dec = args.decisions ?? {};
  const used: RolloffDecisions = {};
  const pending: string[] = [];
  const roHcp = rolloffHandicap(args.handicap.pins);
  const aHcp = args.handicap.receivingSide === "a" ? roHcp : 0;
  const bHcp = args.handicap.receivingSide === "b" ? roHcp : 0;

  const gamePoints: TriplesGameResult[] = [0, 1, 2].map((i) => {
    const game = i + 1;
    const a = args.hdcpA[i] ?? 0;
    const b = args.hdcpB[i] ?? 0;
    if (a !== b) return { game, a: a > b ? 2 : 0, b: b > a ? 2 : 0, tied: false, rolloff: null };

    const key = `game${game}` as RolloffKey;
    let ro: GameRolloff;
    if (game < 3) {
      const next = (game + 1) as 2 | 3;
      const f = args.frameOne[next];
      const fa = f?.a ?? { score: null, reason: "incomplete" as const };
      const fb = f?.b ?? { score: null, reason: "incomplete" as const };
      const base = { nextGame: next, aScratch: fa.score, bScratch: fb.score, aHdcp: aHcp, bHdcp: bHcp };
      if (fa.score !== null && fb.score !== null) {
        const aTotal = fa.score + aHcp;
        const bTotal = fb.score + bHcp;
        if (aTotal !== bTotal) {
          ro = { ...base, method: "auto", aTotal, bTotal, manualAllowed: false, winner: aTotal > bTotal ? "a" : "b", message: null };
        } else {
          ro = { ...base, method: "pending", aTotal, bTotal, autoTied: true, manualAllowed: true, winner: null, message: `Game ${game} roll-off still tied — choose winner` };
        }
      } else if (fa.reason === "blind" || fb.reason === "blind") {
        ro = { ...base, method: "pending", manualAllowed: true, winner: null, message: `Game ${game} roll-off can't be scored (blind bowler in Game ${next}) — choose winner` };
      } else {
        ro = { ...base, method: "pending", manualAllowed: false, winner: null, message: `Game ${game} is tied — finish frame 1 of Game ${next} for every bowler to decide the roll-off` };
      }
    } else {
      ro = { method: "pending", manualAllowed: true, winner: null, message: "Game 3 is tied — choose the roll-off winner" };
    }
    if (ro.method === "pending" && ro.manualAllowed && dec[key]) {
      used[key] = dec[key];
      ro = { ...ro, method: "manual", winner: dec[key]!, message: null };
    }
    if (ro.message) pending.push(ro.message);
    return { game, a: ro.winner === "a" ? 2 : 0, b: ro.winner === "b" ? 2 : 0, tied: true, rolloff: ro };
  });

  const setA = args.hdcpA.reduce((x, y) => x + y, 0);
  const setB = args.hdcpB.reduce((x, y) => x + y, 0);
  const setTied = setA === setB;
  let setWinner: Side | null = setTied ? (dec.set ?? null) : setA > setB ? "a" : "b";
  if (setTied && dec.set) used.set = dec.set;
  const setMessage = setTied && !setWinner ? "Set is tied — choose the roll-off winner" : null;
  if (setMessage) pending.push(setMessage);
  const setPointA = setWinner === "a" ? 1 : 0;
  const setPointB = setWinner === "b" ? 1 : 0;

  return {
    gamePoints,
    set: { tied: setTied, winner: setWinner, a: setA, b: setB, manualAllowed: setTied, message: setMessage },
    setPointA,
    setPointB,
    totalA: gamePoints.reduce((s, g) => s + g.a, 0) + setPointA,
    totalB: gamePoints.reduce((s, g) => s + g.b, 0) + setPointB,
    pending,
    decisions: used,
  };
}
