/**
 * Lane Data — public lane-pair performance derived from `lane_stats_cache`.
 *
 * Every figure is built DB-side by `refresh_lane_aggregates_impl` from
 * finalized, non-bye matches only. Blind games are excluded from pinfall,
 * game counts and frame stats; substitutes ARE included because this measures
 * the lane, not individual eligibility.
 *
 * Pair POA uses `match_lineups.applicable_average` — the historical average
 * snapshot stored when the match was scored — never a bowler's current average.
 */
import { pct } from "@/lib/duckpin";

export interface LaneRow {
  lane_pair: string;
  lane_sort: number;
  games: number;
  pinfall: number;
  average: number;
  poa: number;
  high_scratch_game: number;
  frames: number;
  strikes: number;
  spares: number;
  ten_boxes: number;
  opens: number;
  spare_attempts: number;
  first_ball_pins: number;
  first_ball_count: number;
  first_ball_avg: number;
  pins_lost: number;
  pins_lost_per_game: number;
}

/** Natural lane ordering: leading pair number first, label as tiebreak. */
export function sortLaneRows<T extends { lane_pair: string; lane_sort?: number | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const sa = a.lane_sort ?? laneSortKey(a.lane_pair);
    const sb = b.lane_sort ?? laneSortKey(b.lane_pair);
    if (sa !== sb) return sa - sb;
    return a.lane_pair.localeCompare(b.lane_pair);
  });
}

/** First number found in a lane label ("29-30" -> 29); 0 when purely textual. */
export function laneSortKey(label: string | null | undefined): number {
  const m = /(\d+)/.exec(label ?? "");
  return m ? Number(m[1]) : 0;
}

export const laneStrikePct = (r: LaneRow) => pct(r.strikes, r.frames);
export const laneSparePct = (r: LaneRow) => pct(r.spares, r.spare_attempts);
export const laneOpenPct = (r: LaneRow) => pct(r.opens, r.frames);
export const laneTenBoxPct = (r: LaneRow) => pct(r.ten_boxes, r.frames);

/** Signed POA display: +4.11 / -2.33 / 0.00 */
export function formatPoa(v: number | string): string {
  const n = Number(v) || 0;
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}`;
}
