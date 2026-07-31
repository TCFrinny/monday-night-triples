import { supabase } from "@/integrations/supabase/client";
import { scoreGame, type Frame } from "@/lib/duckpin";
import { blindScore, computeMatchPoints, teamAverage, teamHandicap, truncateAverage } from "@/lib/league";

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
  const points = computeMatchPoints(hdcpA, hdcpB);

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
      game_points: points.gamePoints,
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

/** Truncated applicable average helper for display in admin tables. */
export const trunc = truncateAverage;
