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
};

const num = (v: any) => Number(v) || 0;
const hasGames = (r: any) => num(r.games) > 0;
const hasFrames = (r: any) => num(r.frames) > 0;

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
    note: "Spares only — ten pins on ball 1 is a strike, never a spare.",
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
    note: "Ten pins down using all three balls — scored 10, no bonus.",
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
];

export const TEAM_BOARDS: Leader[] = [
  {
    key: "tavg",
    title: "Team Scratch Average",
    value: (r) => Number(r.scratch_avg),
    fmt: (r) => formatAverage(r.scratch_avg),
    eligible: (r) => num(r.matches) > 0,
  },
  {
    key: "thg",
    title: "Team High Scratch Game",
    value: (r) => r.high_scratch_game,
    eligible: (r) => num(r.matches) > 0,
  },
  {
    key: "ths",
    title: "Team High Scratch Set",
    value: (r) => r.high_scratch_set,
    eligible: (r) => num(r.matches) > 0,
  },
  {
    key: "thhs",
    title: "Team High HDCP Set",
    value: (r) => r.high_hdcp_set,
    eligible: (r) => num(r.matches) > 0,
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
];

/** Rows that qualify for a board, best first. */
export function boardLeaders(board: Leader, rows: any[], limit = 5) {
  return rows
    .filter((r) => (board.eligible ? board.eligible(r) : true))
    .sort((a, b) => board.value(b) - board.value(a))
    .slice(0, limit);
}
