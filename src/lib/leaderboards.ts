import { formatAverage } from "@/lib/league";
import { pct } from "@/lib/duckpin";

export type Leader = {
  key: string;
  title: string;
  note?: string;
  value: (r: any) => number;
  fmt?: (r: any) => string;
  /** Row qualifies for this board — based on the board's own denominator,
   *  never on the handicap establishment threshold. */
  eligible?: (r: any) => boolean;
  /** Rank ascending (smallest value is #1) for metrics where lower is better. */
  lowerIsBetter?: boolean;
};

const num = (v: any) => Number(v) || 0;
const dec2 = (v: any) => (Number(v) || 0).toFixed(2);
const hasGames = (r: any) => num(r.games) > 0;
const hasFrames = (r: any) => num(r.frames) > 0;
const hasCompleteGames = (r: any) => num(r.complete_games) > 0;
const hasTeamGames = (r: any) => num(r.team_games) > 0;

export const BOWLER_BOARDS: Leader[] = [
  {
    key: "avg",
    title: "Average",
    value: (r) => Number(r.average),
    fmt: (r) => formatAverage(r.average),
    eligible: hasGames,
  },
  { key: "hg", title: "High Game", value: (r) => r.high_game, eligible: hasGames },
  { key: "hs", title: "High Set", value: (r) => r.high_set, eligible: (r) => num(r.sets) > 0 },
  {
    key: "pf",
    title: "Total Pinfall",
    value: (r) => r.pinfall,
    fmt: (r) => num(r.pinfall).toLocaleString(),
    eligible: hasGames,
  },
  {
    key: "strike",
    title: "Strike %",
    value: (r) => pct(r.strikes, r.frames),
    fmt: (r) => `${pct(r.strikes, r.frames)}%`,
    eligible: hasFrames,
  },
  {
    key: "spare",
    title: "Spare %",
    value: (r) => pct(r.spares, r.spare_attempts),
    fmt: (r) => `${pct(r.spares, r.spare_attempts)}%`,
    eligible: (r) => num(r.spare_attempts) > 0,
  },
  {
    key: "mark",
    title: "Mark %",
    value: (r) => pct(r.strikes + r.spares, r.frames),
    fmt: (r) => `${pct(r.strikes + r.spares, r.frames)}%`,
    eligible: hasFrames,
  },
  {
    key: "tenbox",
    title: "10-Box %",
    value: (r) => pct(r.ten_boxes, r.frames),
    fmt: (r) => `${pct(r.ten_boxes, r.frames)}%`,
    eligible: hasFrames,
  },
  {
    key: "fb",
    title: "First-Ball Average",
    value: (r) => (r.first_ball_count ? Number(r.first_ball_pins) / r.first_ball_count : 0),
    fmt: (r) =>
      r.first_ball_count ? (Number(r.first_ball_pins) / r.first_ball_count).toFixed(2) : "—",
    eligible: (r) => num(r.first_ball_count) > 0,
  },
  {
    key: "split",
    title: "Split Conversion %",
    value: (r) => pct(r.split_conversions, r.splits),
    fmt: (r) => `${pct(r.split_conversions, r.splits)}% (${r.split_conversions}/${r.splits})`,
    eligible: (r) => num(r.splits) > 0,
  },
  { key: "streak", title: "Longest Strike Streak", value: (r) => r.longest_strike_streak, eligible: hasFrames },
  { key: "clean", title: "Clean Games", value: (r) => r.clean_games, eligible: hasGames },
  { key: "strikes", title: "Most Strikes", value: (r) => num(r.strikes), eligible: hasFrames },
  { key: "sparect", title: "Most Spares", value: (r) => num(r.spares), eligible: hasFrames },
  {
    key: "opens",
    title: "Fewest Opens",
    value: (r) => num(r.opens),
    eligible: hasFrames,
    lowerIsBetter: true,
  },
  {
    key: "openpct",
    title: "Open %",
    value: (r) => pct(r.opens, r.frames),
    fmt: (r) => `${pct(r.opens, r.frames)}%`,
    eligible: hasFrames,
    lowerIsBetter: true,
  },
  {
    key: "pinslost",
    title: "Pins Lost / Game",
    value: (r) => Number(r.pins_lost_per_game) || 0,
    fmt: (r) => dec2(r.pins_lost_per_game),
    eligible: hasGames,
    lowerIsBetter: true,
  },

  {
    key: "consistency",
    title: "Consistency (Std. Dev.)",
    note: "Spread of scratch game scores — lower means steadier.",
    value: (r) => Number(r.score_stddev) || 0,
    fmt: (r) => dec2(r.score_stddev),
    eligible: hasCompleteGames,
    lowerIsBetter: true,
  },
  {
    key: "first5",
    title: "First 5 (Pins / Game)",
    value: (r) => Number(r.first5_avg) || 0,
    fmt: (r) => dec2(r.first5_avg),
    eligible: hasCompleteGames,
  },
  {
    key: "last5",
    title: "Last 5 (Pins / Game)",
    value: (r) => Number(r.last5_avg) || 0,
    fmt: (r) => dec2(r.last5_avg),
    eligible: hasCompleteGames,
  },
  {
    key: "bigopen",
    title: "Big Opening (Pins / Game)",
    note: "Pins through frame 3, per complete game.",
    value: (r) => Number(r.big_opening_avg) || 0,
    fmt: (r) => dec2(r.big_opening_avg),
    eligible: hasCompleteGames,
  },
  {
    key: "bigfinish",
    title: "Big Finish (Pins / Game)",
    note: "Pins in frames 8–10, per complete game.",
    value: (r) => Number(r.big_finish_avg) || 0,
    fmt: (r) => dec2(r.big_finish_avg),
    eligible: hasCompleteGames,
  },
  {
    key: "clutch",
    title: "Clutch % (Frames 9–10)",
    note: "Marks in completed frames 9–10 as a share of those frames.",
    value: (r) => pct(r.clutch_marks, r.clutch_frames),
    fmt: (r) => `${pct(r.clutch_marks, r.clutch_frames)}%`,
    eligible: (r) => num(r.clutch_frames) > 0,
  },

  {
    key: "marks",
    title: "Total Marks",
    value: (r) => num(r.strikes) + num(r.spares),
    eligible: hasFrames,
  },
];

const hasMatches = (r: any) => num(r.matches) > 0;

export const TEAM_BOARDS: Leader[] = [

  {
    key: "tavg",
    title: "Team Scratch Average",
    value: (r) => Number(r.scratch_avg),
    fmt: (r) => formatAverage(r.scratch_avg),
    eligible: hasMatches,
  },
  {
    key: "thavg",
    title: "Team HDCP Average",
    value: (r) => Number(r.hdcp_avg),
    fmt: (r) => formatAverage(r.hdcp_avg),
    eligible: hasMatches,
  },
  {
    key: "thg",
    title: "Team High Scratch Game",
    value: (r) => r.high_scratch_game,
    eligible: hasMatches,
  },
  {
    key: "thhg",
    title: "Team High HDCP Game",
    value: (r) => r.high_hdcp_game,
    eligible: hasMatches,
  },
  {
    key: "ths",
    title: "Team High Scratch Set",
    value: (r) => r.high_scratch_set,
    eligible: hasMatches,
  },
  {
    key: "thhs",
    title: "Team High HDCP Set",
    value: (r) => r.high_hdcp_set,
    eligible: hasMatches,
  },
  {
    key: "tstrike",
    title: "Team Strike %",
    value: (r) => pct(r.strikes, r.frames),
    fmt: (r) => `${pct(r.strikes, r.frames)}%`,
    eligible: hasFrames,
  },
  {
    key: "tspare",
    title: "Team Spare %",
    value: (r) => pct(r.spares, r.spare_attempts),
    fmt: (r) => `${pct(r.spares, r.spare_attempts)}%`,
    eligible: (r) => num(r.spare_attempts) > 0,
  },
  {
    key: "ttenbox",
    title: "Team 10-Box %",
    value: (r) => pct(r.ten_boxes, r.frames),
    fmt: (r) => `${pct(r.ten_boxes, r.frames)}%`,
    eligible: hasFrames,
  },
  {
    key: "tmark",
    title: "Team Mark %",
    value: (r) => pct(num(r.strikes) + num(r.spares), r.frames),
    fmt: (r) => `${pct(num(r.strikes) + num(r.spares), r.frames)}%`,
    eligible: hasFrames,
  },
  {
    key: "topen",
    title: "Team Open %",
    value: (r) => pct(r.opens, r.frames),
    fmt: (r) => `${pct(r.opens, r.frames)}%`,
    eligible: hasFrames,
    lowerIsBetter: true,
  },
  { key: "tstrikes", title: "Team Strikes", value: (r) => num(r.strikes), eligible: hasFrames },
  { key: "tsparect", title: "Team Spares", value: (r) => num(r.spares), eligible: hasFrames },
  {
    key: "topens",
    title: "Fewest Team Opens",
    value: (r) => num(r.opens),
    eligible: hasFrames,
    lowerIsBetter: true,
  },
  {
    key: "tpinslost",
    title: "Team Pins Lost / Game",
    value: (r) => Number(r.pins_lost_per_game) || 0,
    fmt: (r) => dec2(r.pins_lost_per_game),
    eligible: hasTeamGames,
    lowerIsBetter: true,
  },

  {
    key: "tconsistency",
    title: "Team Consistency (Std. Dev.)",
    note: "Spread of team scratch game totals — lower means steadier.",
    value: (r) => Number(r.score_stddev) || 0,
    fmt: (r) => dec2(r.score_stddev),
    eligible: hasTeamGames,
    lowerIsBetter: true,
  },
  {
    key: "tfirst5",
    title: "Team First 5 (Pins / Game)",
    value: (r) => Number(r.first5_avg) || 0,
    fmt: (r) => dec2(r.first5_avg),
    eligible: hasTeamGames,
  },
  {
    key: "tlast5",
    title: "Team Last 5 (Pins / Game)",
    value: (r) => Number(r.last5_avg) || 0,
    fmt: (r) => dec2(r.last5_avg),
    eligible: hasTeamGames,
  },
  {
    key: "tbigopen",
    title: "Team Big Opening (Pins / Game)",
    note: "Pins through frame 3 for all three bowlers, per team game.",
    value: (r) => Number(r.big_opening_avg) || 0,
    fmt: (r) => dec2(r.big_opening_avg),
    eligible: hasTeamGames,
  },
  {
    key: "tbigfinish",
    title: "Team Big Finish (Pins / Game)",
    note: "Pins in frames 8–10 for all three bowlers, per team game.",
    value: (r) => Number(r.big_finish_avg) || 0,
    fmt: (r) => dec2(r.big_finish_avg),
    eligible: hasTeamGames,
  },
  {
    key: "tclutch",
    title: "Team Clutch % (Frames 9–10)",
    note: "Marks in completed frames 9–10 as a share of those frames, all bowlers including subs.",
    value: (r) => pct(r.clutch_marks, r.clutch_frames),
    fmt: (r) => `${pct(r.clutch_marks, r.clutch_frames)}%`,
    eligible: (r) => num(r.clutch_frames) > 0,
  },

  {
    key: "tmarks",
    title: "Team Total Marks",
    value: (r) => num(r.strikes) + num(r.spares),
    eligible: hasFrames,
  },


  {
    key: "tfb",
    title: "Team First-Ball Average",
    value: (r) => (num(r.first_ball_count) ? num(r.first_ball_pins) / num(r.first_ball_count) : 0),
    fmt: (r) =>
      num(r.first_ball_count)
        ? (num(r.first_ball_pins) / num(r.first_ball_count)).toFixed(2)
        : "—",
    eligible: (r) => num(r.first_ball_count) > 0,
  },
  {
    key: "tfb8",
    title: "Team 8+ First-Ball %",
    value: (r) => pct(r.first_ball_eight_plus, r.first_ball_count),
    fmt: (r) => `${pct(r.first_ball_eight_plus, r.first_ball_count)}%`,
    eligible: (r) => num(r.first_ball_count) > 0,
  },
  {
    key: "tfb9",
    title: "Team 9+ First-Ball %",
    value: (r) => pct(r.first_ball_nine_plus, r.first_ball_count),
    fmt: (r) => `${pct(r.first_ball_nine_plus, r.first_ball_count)}%`,
    eligible: (r) => num(r.first_ball_count) > 0,
  },
  {
    key: "tsplitconv",
    title: "Team Split Conversion %",
    value: (r) => pct(r.split_conversions, r.splits),
    fmt: (r) => `${pct(r.split_conversions, r.splits)}% (${r.split_conversions}/${r.splits})`,
    eligible: (r) => num(r.splits) > 0,
  },
  {
    key: "tsplits",
    title: "Team Splits Left",
    value: (r) => num(r.splits),
    fmt: (r) => num(r.splits).toLocaleString(),
    eligible: hasFrames,
  },
];


/** Substitute bowlers never appear on individual leaderboards (all scopes).
 *  Their stats stay intact in the cache and still count toward team boards. */
export const isSubRow = (r: any) => r?.bowlers?.is_sub === true;

/** Rows eligible for individual leaderboards — subs removed. */
export function individualRows<T>(rows: T[]): T[] {
  return rows.filter((r) => !isSubRow(r));
}

/** Rows that qualify for a board, best first (ascending when lower is better).
 *  Sub-attributed bowler rows are dropped here so no board can leak them. */
export function boardLeaders(board: Leader, rows: any[], limit = 5) {
  const dir = board.lowerIsBetter ? -1 : 1;
  return individualRows(rows)
    .filter((r) => (board.eligible ? board.eligible(r) : true))
    .sort((a, b) => (board.value(b) - board.value(a)) * dir)
    .slice(0, limit);
}


/** Reference implementations of the segment metrics computed in the aggregate
 *  cache refresh. Kept here so the SQL formulas stay documented and testable. */
export interface GameCumulatives {
  /** Cumulative score through frame 3. */
  c3: number;
  /** Cumulative score through frame 5. */
  c5: number;
  /** Cumulative score through frame 7. */
  c7: number;
  /** Final scratch score of the complete game. */
  final: number;
}

export function gameSegments(g: GameCumulatives) {
  return {
    first5: g.c5,
    last5: g.final - g.c5,
    bigOpening: g.c3,
    bigFinish: g.final - g.c7,
  };
}

/** Average of a segment across complete games (team totals are summed first). */
export function segmentAverage(
  games: GameCumulatives[],
  key: keyof ReturnType<typeof gameSegments>,
) {
  if (!games.length) return 0;
  return games.reduce((s, g) => s + gameSegments(g)[key], 0) / games.length;
}

/** A game actually rolled by a bowler (blinds are never included). The
 *  `is_complete` flag is deliberately ignored: eligibility is decided by the
 *  frame data that is actually present, because a finalized match can contain
 *  a fully-scored game whose flag was never flipped. */
export interface RolledGame extends Partial<GameCumulatives> {
  /** Number of frames recorded for the game. */
  frames: number;
  /** Frames still marked incomplete. */
  incompleteFrames?: number;
  /** Stored completion flag — informational only. */
  is_complete?: boolean;
}

/** A rolled game contributes to segment metrics only with 10 scored frames
 *  and the cumulative values the formulas need. */
export function isSegmentEligible(g: RolledGame): g is RolledGame & GameCumulatives {
  return (
    g.frames === 10 &&
    !g.incompleteFrames &&
    [g.c3, g.c5, g.c7, g.final].every((v) => typeof v === "number")
  );
}

/** Segment totals for one team game, or null when any rolled bowler game in
 *  that team game lacks segment data. Missing data is never counted as zero —
 *  the whole team game drops out of the average instead. */
export function teamGameSegmentTotals(games: RolledGame[]) {
  if (!games.length || !games.every(isSegmentEligible)) return null;
  return games.reduce(
    (acc, g) => {
      const seg = gameSegments(g as GameCumulatives);
      return {
        first5: acc.first5 + seg.first5,
        last5: acc.last5 + seg.last5,
        bigOpening: acc.bigOpening + seg.bigOpening,
        bigFinish: acc.bigFinish + seg.bigFinish,
      };
    },
    { first5: 0, last5: 0, bigOpening: 0, bigFinish: 0 },
  );
}

/** Average a team segment across team games, skipping incomplete team games. */
export function teamSegmentAverage(
  teamGames: RolledGame[][],
  key: keyof ReturnType<typeof gameSegments>,
) {
  const totals = teamGames
    .map(teamGameSegmentTotals)
    .filter((t): t is NonNullable<typeof t> => t !== null);
  if (!totals.length) return 0;
  return totals.reduce((s, t) => s + t[key], 0) / totals.length;
}

export interface FrameLike {
  frame_number: number;
  outcome: "strike" | "spare" | "ten_box" | "open" | "incomplete";
  balls?: number[];
}

const isClutchFrame = (f: FrameLike) => f.frame_number === 9 || f.frame_number === 10;

/** Marks recorded in frames 9 and 10 only. */
export function clutchMarks(frames: FrameLike[]) {
  return frames.filter(
    (f) => isClutchFrame(f) && (f.outcome === "strike" || f.outcome === "spare"),
  ).length;
}

/** Completed frame 9–10 opportunities (incomplete frames don't count). */
export function clutchOpportunities(frames: FrameLike[]) {
  return frames.filter((f) => isClutchFrame(f) && f.outcome !== "incomplete").length;
}

/** Clutch percentage: marks / completed frame 9–10 opportunities. */
export function clutchPct(frames: FrameLike[]) {
  return pct(clutchMarks(frames), clutchOpportunities(frames));
}


/** Pins left standing after the final ball of a frame. */
export function framePinsLost(f: FrameLike) {
  if (f.outcome !== "open") return 0;
  return Math.max(0, 10 - (f.balls ?? []).reduce((s, p) => s + p, 0));
}

export function pinsLost(frames: FrameLike[]) {
  return frames.reduce((s, f) => s + framePinsLost(f), 0);
}

/** A finalized team game: scratch total of the three bowler games (subs
 *  included) plus the handicap pins that team received for that match. */
export interface TeamGameTotal {
  scratch: number;
  /** Handicap pins awarded to this team for the match (0 when giving). */
  handicap: number;
}

export const teamGameHdcpTotal = (g: TeamGameTotal) => g.scratch + g.handicap;

/** High HDCP Game = the largest single finalized team game total with handicap. */
export function highHdcpGame(games: TeamGameTotal[]) {
  if (!games.length) return 0;
  return Math.max(...games.map(teamGameHdcpTotal));
}
