import { supabase } from "@/integrations/supabase/client";
import { isGameBlind } from "@/lib/blind-games";
import { framesFromRows } from "@/components/league/ui";
import { scoreGame, type Frame } from "@/lib/duckpin";
import { blindScore, teamAverage, teamHandicap, truncateAverage } from "@/lib/league";
import { buildGameSnapshot } from "@/lib/results";
import { computeTriplesPoints, parseDecisions, teamFrameOne, type RolloffDecisions, type TeamFrameOne } from "@/lib/rolloff";


/** Persist one bowler game: replaces its frames and balls with the current sheet. */
export async function saveBowlerGame(args: {
  lineupId: string;
  gameNumber: number;
  frames: Frame[];
  isBlind: boolean;
  blindValue?: number;
}) {
  const scored = scoreGame(args.frames);
  const scratch = args.isBlind ? (args.blindValue ?? 0) : scored.total;
  const complete = args.isBlind ? true : scored.complete;

  const existing = await supabase
    .from("bowler_games")
    .select("id")
    .eq("lineup_id", args.lineupId)
    .eq("game_number", args.gameNumber)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  let gameId = existing.data?.id;
  if (gameId) {
    const upd = await supabase
      .from("bowler_games")
      .update({ scratch_score: scratch, is_blind: args.isBlind, is_complete: complete })
      .eq("id", gameId);
    if (upd.error) throw new Error(upd.error.message);
    const del = await supabase.from("frames").delete().eq("game_id", gameId);
    if (del.error) throw new Error(del.error.message);
  } else {
    const ins = await supabase
      .from("bowler_games")
      .insert({
        lineup_id: args.lineupId,
        game_number: args.gameNumber,
        scratch_score: scratch,
        is_blind: args.isBlind,
        is_complete: complete,
      })
      .select("id")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    gameId = ins.data.id;
  }

  if (args.isBlind) return { gameId, scratch };

  const frameRows = scored.frames
    .filter((f) => f.balls.length > 0)
    .map((f) => ({
      game_id: gameId!,
      frame_number: f.frameNumber,
      outcome: f.outcome,
      frame_score: f.frameScore,
      cumulative_score: f.cumulative ?? 0,
      is_split: f.isSplit,
      split_converted: f.splitConverted,
      first_ball_pins: f.firstBallPins,
    }));
  if (frameRows.length) {
    const insertedFrames = await supabase.from("frames").insert(frameRows).select("id, frame_number");
    if (insertedFrames.error) throw new Error(insertedFrames.error.message);
    const idByFrame = new Map<number, string>();
    for (const r of insertedFrames.data) idByFrame.set(r.frame_number, r.id);
    const ballRows = scored.frames.flatMap((f) =>
      f.balls.map((b, i) => ({
        frame_id: idByFrame.get(f.frameNumber)!,
        ball_number: i + 1,
        pins: b.pins,
        is_split: Boolean(b.isSplit),
      })),
    ).filter((r) => r.frame_id);
    if (ballRows.length) {
      const ib = await supabase.from("balls").insert(ballRows);
      if (ib.error) throw new Error(ib.error.message);
    }
  }
  return { gameId, scratch };
}

export interface LineupInput {
  id: string;
  team_id: string;
  slot: number;
  participation: string;
  applicable_average: number;
  bowler_games: { game_number: number; scratch_score: number; is_blind: boolean }[];
}

/**
 * Finalize a match: team averages from truncated applicable averages, 80% team
 * handicap to the lower-average team, seven points decided on handicap scores.
 */
export async function finalizeMatch(args: {
  matchId: string;
  seasonId: string;
  teamAId: string;
  teamBId: string;
  lineups: LineupInput[];
  handicapPercent: number;
  blindDeduction: number;
  /** Team frame-1 natural scores for games 2 and 3 (roll-offs for tied G1/G2). */
  frameOne: Partial<Record<2 | 3, { a: TeamFrameOne; b: TeamFrameOne }>>;
  /** Stored manual roll-off winners; stale ones are dropped. */
  decisions: RolloffDecisions;
}) {
  const side = (teamId: string) => args.lineups.filter((l) => l.team_id === teamId);
  const scratchFor = (lineups: LineupInput[], game: number) =>
    lineups.reduce((sum, l) => {
      const g = l.bowler_games.find((x) => x.game_number === game);
      if (g) return sum + g.scratch_score;
      if (l.participation === "blind")
        return sum + blindScore(l.applicable_average, args.blindDeduction);
      return sum;
    }, 0);

  const a = side(args.teamAId);
  const b = side(args.teamBId);
  const avgA = teamAverage(a.map((l) => Number(l.applicable_average)));
  const avgB = teamAverage(b.map((l) => Number(l.applicable_average)));
  const hcp = teamHandicap(avgA, avgB, args.handicapPercent);

  const scratchA = [1, 2, 3].map((g) => scratchFor(a, g));
  const scratchB = [1, 2, 3].map((g) => scratchFor(b, g));
  const hdcpA = scratchA.map((s) => s + (hcp.receivingSide === "a" ? hcp.pins : 0));
  const hdcpB = scratchB.map((s) => s + (hcp.receivingSide === "b" ? hcp.pins : 0));
  // Triples never splits ties: roll-offs decide tied games and the set.
  const points = computeTriplesPoints({
    hdcpA,
    hdcpB,
    handicap: hcp,
    frameOne: args.frameOne,
    decisions: args.decisions,
  });
  if (points.pending.length) throw new Error(points.pending.join(" · "));

  const upd = await supabase
    .from("matches")
    .update({
      status: "final",
      team_a_average: avgA,
      team_b_average: avgB,
      handicap_team_id:
        hcp.receivingSide === "a" ? args.teamAId : hcp.receivingSide === "b" ? args.teamBId : null,
      handicap_pins: hcp.pins,
      scratch_total_a: scratchA.reduce((x, y) => x + y, 0),
      scratch_total_b: scratchB.reduce((x, y) => x + y, 0),
      hdcp_total_a: hdcpA.reduce((x, y) => x + y, 0),
      hdcp_total_b: hdcpB.reduce((x, y) => x + y, 0),
      points_a: points.totalA,
      points_b: points.totalB,
      game_points: buildGameSnapshot({
        scratchA,
        scratchB,
        hdcpA,
        hdcpB,
        gamePoints: points.gamePoints,
      }),

      rolloff_decisions: points.decisions,
      finalized_at: new Date().toISOString(),
    })
    .eq("id", args.matchId);
  if (upd.error) throw new Error(upd.error.message);

  await refreshAggregates(args.seasonId);
  return points;
}

export async function unfinalizeMatch(matchId: string, seasonId: string) {
  const upd = await supabase
    .from("matches")
    .update({ status: "in_progress", finalized_at: null, points_a: 0, points_b: 0 })
    .eq("id", matchId);
  if (upd.error) throw new Error(upd.error.message);
  await refreshAggregates(seasonId);
}

export async function refreshAggregates(seasonId: string) {
  const { error } = await supabase.rpc("refresh_season_aggregates", { p_season_id: seasonId });
  if (error) throw new Error(error.message);
}

export interface EntryCorrectionResult {
  oldAverage: number;
  newAverage: number;
  snapshotsUpdated: number;
  matchesRecalculated: number;
}

/**
 * Retroactive entering-average correction. The RPC atomically updates the
 * bowler's entry average and every entry-source lineup snapshot; each
 * affected finalized match is then re-finalized with the existing Triples
 * rules (scores/frames untouched, rolloff decisions preserved or cleared by
 * the normal sanitization), and Singles is rebuilt from the corrected
 * lineup averages.
 */
export async function applyEntryAverageCorrection(args: {
  bowlerId: string;
  newAverage: number;
  seasonId: string;
  fetchMatchDetail: (matchId: string) => Promise<{ match: any; lineups: any[] }>;
}): Promise<EntryCorrectionResult> {
  const { data, error } = await supabase.rpc("correct_entry_average", {
    p_bowler_id: args.bowlerId,
    p_new_average: args.newAverage,
  });
  if (error) throw new Error(error.message);
  const result = data as {
    old_average: number;
    new_average: number;
    snapshots_updated: number;
    match_ids: string[];
  };

  let recalculated = 0;
  for (const matchId of result.match_ids ?? []) {
    const detail = await args.fetchMatchDetail(matchId);
    if (detail.match.status !== "final") continue; // unfinalized: snapshot only
    const season = detail.match.weeks?.seasons;
    const frameOneFor = (teamId: string, g: number) =>
      teamFrameOne(
        [1, 2, 3].map((slot) => {
          const l = (detail.lineups ?? []).find((x: any) => x.team_id === teamId && x.slot === slot);
          const game = l?.bowler_games?.find((x: any) => x.game_number === g);
          return {
            blind: l ? isGameBlind(l, g) : false,
            frames: game ? framesFromRows(game.frames) : null,
          };
        }),
      );
    await finalizeMatch({
      matchId,
      seasonId: args.seasonId,
      teamAId: detail.match.team_a_id,
      teamBId: detail.match.team_b_id,
      lineups: (detail.lineups ?? []).map((l: any) => ({
        id: l.id,
        team_id: l.team_id,
        slot: l.slot,
        participation: l.participation,
        applicable_average: Number(l.applicable_average),
        bowler_games: (l.bowler_games ?? []).map((g: any) => ({
          game_number: g.game_number,
          scratch_score: g.scratch_score,
          is_blind: g.is_blind,
        })),
      })),
      handicapPercent: Number(season?.handicap_percent ?? 80),
      blindDeduction: Number(season?.blind_deduction ?? 10),
      frameOne: {
        2: { a: frameOneFor(detail.match.team_a_id, 2), b: frameOneFor(detail.match.team_b_id, 2) },
        3: { a: frameOneFor(detail.match.team_a_id, 3), b: frameOneFor(detail.match.team_b_id, 3) },
      },
      decisions: parseDecisions(detail.match.rolloff_decisions),
    });
    recalculated += 1;
  }

  // Re-finalizing an already-final match does not fire the non-final→final
  // Singles trigger, so rebuild Singles explicitly from the corrected
  // lineup averages (scratch games unchanged).
  const singles = await supabase.rpc("refresh_singles", { p_season_id: args.seasonId });
  if (singles.error) throw new Error(singles.error.message);

  return {
    oldAverage: Number(result.old_average),
    newAverage: Number(result.new_average),
    snapshotsUpdated: Number(result.snapshots_updated),
    matchesRecalculated: recalculated,
  };
}

/** Truncated applicable average helper for display in admin tables. */
export const trunc = truncateAverage;
