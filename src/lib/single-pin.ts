import type { Ball, Frame } from "@/lib/duckpin";
import { formatPercentValue, percentage } from "@/lib/percentages";

export interface SinglePinCounts {
  single_pin_attempts: number;
  single_pin_conversions: number;
}

/** Only the first rack of a frame counts; bonus balls never start attempts. */
export function singlePinFrame(balls: Ball[], fullBlind = false): SinglePinCounts {
  const first = balls[0];
  const second = balls[1];
  const attempt = !fullBlind && !!first && !first.isBlind && first.pins === 9;
  return {
    single_pin_attempts: Number(attempt),
    single_pin_conversions: Number(attempt && !!second && !second.isBlind && second.pins === 1),
  };
}

export function singlePinTotals(games: { frames: Frame[]; isBlind?: boolean }[]): SinglePinCounts {
  return games.reduce((total, game) => {
    for (const frame of game.frames) {
      const counts = singlePinFrame(frame.balls, game.isBlind);
      total.single_pin_attempts += counts.single_pin_attempts;
      total.single_pin_conversions += counts.single_pin_conversions;
    }
    return total;
  }, { single_pin_attempts: 0, single_pin_conversions: 0 });
}

/** Rank on the exact ratio, not the rounded display value. */
export function singlePinPercentage(row: Partial<SinglePinCounts> | null | undefined): number {
  const attempts = Number(row?.single_pin_attempts) || 0;
  return percentage(Number(row?.single_pin_conversions) || 0, attempts);
}

export function formatSinglePin(row: Partial<SinglePinCounts> | null | undefined): string {
  const attempts = Number(row?.single_pin_attempts) || 0;
  return attempts > 0
    ? `${formatPercentValue(singlePinPercentage(row))} (${row?.single_pin_conversions ?? 0}/${attempts})`
    : "—";
}