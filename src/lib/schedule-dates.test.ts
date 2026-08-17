import { describe, expect, it } from "vitest";
import {
  addDays,
  generateWeekDates,
  normalizeSkipDates,
  shiftPreview,
  validateShift,
  type WeekRow,
} from "./schedule-dates";

const dates = (rows: { bowl_date: string }[]) => rows.map((r) => r.bowl_date);

describe("generateWeekDates", () => {
  it("advances 7 days at a time with no skips", () => {
    const rows = generateWeekDates("2026-09-07", 4);
    expect(dates(rows)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(rows.map((r) => r.week_number)).toEqual([1, 2, 3, 4]);
  });

  it("skips one blackout date in the middle", () => {
    const rows = generateWeekDates("2026-09-07", 4, ["2026-09-21"]);
    expect(dates(rows)).toEqual(["2026-09-07", "2026-09-14", "2026-09-28", "2026-10-05"]);
  });

  it("skips consecutive blackout dates", () => {
    const rows = generateWeekDates("2026-09-07", 4, ["2026-09-14", "2026-09-21"]);
    expect(dates(rows)).toEqual(["2026-09-07", "2026-09-28", "2026-10-05", "2026-10-12"]);
  });

  it("skips a blackout equal to the start date", () => {
    const rows = generateWeekDates("2026-09-07", 3, ["2026-09-07"]);
    expect(dates(rows)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("handles multiple non-adjacent skips", () => {
    const rows = generateWeekDates("2026-09-07", 5, ["2026-09-21", "2026-10-12"]);
    expect(dates(rows)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-28",
      "2026-10-05",
      "2026-10-19",
    ]);
  });

  it("creates no phantom weeks and keeps week numbers contiguous", () => {
    const rows = generateWeekDates("2026-09-07", 6, ["2026-09-14", "2026-10-12"]);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.week_number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(dates(rows)).not.toContain("2026-09-14");
    expect(dates(rows)).not.toContain("2026-10-12");
  });

  it("ignores blank/duplicate skip entries", () => {
    expect(normalizeSkipDates([" 2026-09-21 ", "2026-09-21", ""])).toEqual(["2026-09-21"]);
    expect(dates(generateWeekDates("2026-09-07", 2, ["", "  "]))).toEqual([
      "2026-09-07",
      "2026-09-14",
    ]);
  });

  it("adds days without timezone drift", () => {
    expect(addDays("2026-03-08", 7)).toBe("2026-03-15");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});

const weeks: WeekRow[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  id: `w${n}`,
  week_number: n,
  bowl_date: addDays("2026-09-07", (n - 1) * 7),
}));

describe("shiftPreview", () => {
  it("maps old -> new dates for the selected week and later only", () => {
    const rows = shiftPreview(weeks, 5, 7);
    expect(rows.map((r) => r.week_number)).toEqual([5, 6, 7]);
    expect(rows[0]).toMatchObject({ from: "2026-10-05", to: "2026-10-12" });
    expect(rows[2]).toMatchObject({ from: "2026-10-19", to: "2026-10-26" });
  });

  it("leaves weeks 1-4 untouched", () => {
    const moved = new Set(shiftPreview(weeks, 5, 7).map((r) => r.week_number));
    expect([1, 2, 3, 4].some((n) => moved.has(n))).toBe(false);
  });

  it("supports multi-week shifts", () => {
    expect(shiftPreview(weeks, 6, 14)[0]).toMatchObject({ from: "2026-10-12", to: "2026-10-26" });
  });
});

describe("validateShift", () => {
  it("accepts an unfinalized week", () => {
    expect(
      validateShift({ weeks, finalizedWeekNumbers: [1, 2, 3, 4], fromWeekNumber: 5, days: 7 }),
    ).toBeNull();
  });

  it("blocks shifting a finalized week", () => {
    const msg = validateShift({
      weeks,
      finalizedWeekNumbers: [1, 2, 3, 4, 5],
      fromWeekNumber: 5,
      days: 7,
    });
    expect(msg).toMatch(/finalized results/i);
  });

  it("blocks a shift that would move any later finalized week", () => {
    expect(
      validateShift({ weeks, finalizedWeekNumbers: [7], fromWeekNumber: 5, days: 7 }),
    ).toMatch(/Week 7/);
  });

  it("requires whole-week, forward shifts of an existing week", () => {
    expect(validateShift({ weeks, finalizedWeekNumbers: [], fromWeekNumber: 99, days: 7 })).toMatch(
      /Select a league week/,
    );
    expect(validateShift({ weeks, finalizedWeekNumbers: [], fromWeekNumber: 5, days: 3 })).toMatch(
      /multiples of 7/,
    );
    expect(validateShift({ weeks, finalizedWeekNumbers: [], fromWeekNumber: 5, days: -7 })).toMatch(
      /forward/,
    );
    expect(validateShift({ weeks, finalizedWeekNumbers: [], fromWeekNumber: 5, days: 0 })).toMatch(
      /how far/,
    );
  });
});
