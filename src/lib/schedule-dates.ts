/**
 * Schedule calendar helpers: blackout-aware week date generation and
 * in-season postponement (date shifting) previews/validation.
 *
 * Dates are handled as plain ISO `YYYY-MM-DD` strings in local terms so that
 * no timezone conversion can slide a bowling date by a day.
 */

export const DAY_MS = 86_400_000;

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toISODate(new Date(parseISODate(iso).getTime() + days * DAY_MS));
}

export interface GeneratedWeekDate {
  week_number: number;
  bowl_date: string;
}

/**
 * Assigns dates to weeks 1..totalWeeks in 7-day increments from `startDate`.
 * A candidate date present in `skipDates` is never assigned to a league week;
 * the calendar advances another 7 days instead. Skipped dates create no
 * phantom weeks and week numbers stay contiguous.
 */
export function generateWeekDates(
  startDate: string,
  totalWeeks: number,
  skipDates: readonly string[] = [],
): GeneratedWeekDate[] {
  const skip = new Set(skipDates.map((d) => d.trim()).filter(Boolean));
  const out: GeneratedWeekDate[] = [];
  let candidate = startDate;
  for (let n = 1; n <= totalWeeks; n++) {
    let guard = 0;
    while (skip.has(candidate)) {
      candidate = addDays(candidate, 7);
      if (++guard > 520) throw new Error("Too many consecutive skipped dates.");
    }
    out.push({ week_number: n, bowl_date: candidate });
    candidate = addDays(candidate, 7);
  }
  return out;
}

export function normalizeSkipDates(dates: readonly string[]): string[] {
  return Array.from(new Set(dates.map((d) => d.trim()).filter(Boolean))).sort();
}

export interface WeekRow {
  id: string;
  week_number: number;
  bowl_date: string | null;
}

export interface ShiftRow {
  id: string;
  week_number: number;
  from: string | null;
  to: string | null;
}

/** Old -> new date mapping for the selected week and every later week. */
export function shiftPreview(
  weeks: readonly WeekRow[],
  fromWeekNumber: number,
  days: number,
): ShiftRow[] {
  return weeks
    .filter((w) => w.week_number >= fromWeekNumber)
    .slice()
    .sort((a, b) => a.week_number - b.week_number)
    .map((w) => ({
      id: w.id,
      week_number: w.week_number,
      from: w.bowl_date,
      to: w.bowl_date ? addDays(w.bowl_date, days) : null,
    }));
}

export interface ShiftValidationInput {
  weeks: readonly WeekRow[];
  /** Week numbers that already contain at least one finalized match. */
  finalizedWeekNumbers: readonly number[];
  fromWeekNumber: number;
  days: number;
}

/** Returns an error message when the requested shift would rewrite played history. */
export function validateShift({
  weeks,
  finalizedWeekNumbers,
  fromWeekNumber,
  days,
}: ShiftValidationInput): string | null {
  if (!weeks.some((w) => w.week_number === fromWeekNumber)) {
    return "Select a league week to postpone.";
  }
  if (!Number.isInteger(days) || days === 0) return "Choose how far to shift the schedule.";
  if (days % 7 !== 0) return "Shifts must be a whole number of weeks (multiples of 7 days).";
  if (days < 0) return "Only forward postponements are supported.";
  const blocked = finalizedWeekNumbers.filter((n) => n >= fromWeekNumber).sort((a, b) => a - b);
  if (blocked.length) {
    return `Week ${blocked[0]} already has finalized results. Postponing it would rewrite played history — choose a later, unfinalized week.`;
  }
  return null;
}
