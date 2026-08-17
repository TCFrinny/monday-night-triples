import { describe, expect, it } from "vitest";
import { addDays, formatDateOnly, formatDateOnlyLong, generateWeekDates, normalizeSkipDates, planWeekDates, shiftPreview, type WeekRow, validateShift } from "./schedule-dates";

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

describe("planWeekDates (regenerating dates over an existing schedule)", () => {
  const thirdFor = (n: number) => (n <= 12 ? 1 : n <= 24 ? 2 : 3);
  const posFor = (n: number) => [12, 24, 36].includes(n);
  const existing36 = Array.from({ length: 36 }, (_, i) => ({
    id: `w${i + 1}`,
    week_number: i + 1,
    bowl_date: addDays("2026-07-31", i * 7),
  }));

  it("updates existing week rows in place instead of skipping them", () => {
    const generated = generateWeekDates("2026-09-07", 36, []);
    const plan = planWeekDates({ existing: existing36, generated, thirdFor, isPositionRoundFor: posFor });
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(36);
    expect(plan.rows[0]).toMatchObject({ week_number: 1, bowl_date: "2026-09-07", action: "update", id: "w1", from: "2026-07-31" });
    expect(plan.rows.every((r) => r.id)).toBe(true);
  });

  it("inserts only genuinely missing weeks and keeps ids for the rest", () => {
    const plan = planWeekDates({
      existing: existing36.slice(0, 4),
      generated: generateWeekDates("2026-09-07", 36, []),
      thirdFor,
      isPositionRoundFor: posFor,
    });
    expect(plan.updates).toHaveLength(4);
    expect(plan.inserts).toHaveLength(32);
    expect(plan.updates.map((r) => r.id)).toEqual(["w1", "w2", "w3", "w4"]);
  });

  it("honours skip dates when regenerating", () => {
    const plan = planWeekDates({
      existing: existing36,
      generated: generateWeekDates("2026-09-07", 36, ["2026-09-21"]),
      thirdFor,
      isPositionRoundFor: posFor,
    });
    expect(plan.rows.slice(0, 4).map((r) => r.bowl_date)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-28",
      "2026-10-05",
    ]);
    expect(plan.rows.some((r) => r.bowl_date === "2026-09-21")).toBe(false);
  });

  it("protects finalized weeks and regenerates the rest", () => {
    const plan = planWeekDates({
      existing: existing36,
      generated: generateWeekDates("2026-09-07", 36, []),
      finalizedWeekNumbers: [1, 2],
      thirdFor,
      isPositionRoundFor: posFor,
    });
    expect(plan.lockedWeekNumbers).toEqual([1, 2]);
    expect(plan.rows.some((r) => r.week_number <= 2)).toBe(false);
    expect(plan.rows[0]!.week_number).toBe(3);
  });

  it("reports extra weeks beyond total_weeks without deleting them", () => {
    const plan = planWeekDates({
      existing: [...existing36, { id: "w37", week_number: 37, bowl_date: "2027-05-17" }],
      generated: generateWeekDates("2026-09-07", 36, []),
      thirdFor,
      isPositionRoundFor: posFor,
    });
    expect(plan.extraWeekNumbers).toEqual([37]);
    expect(plan.rows).toHaveLength(36);
  });

  it("marks matching dates unchanged and assigns third / position round", () => {
    const generated = generateWeekDates("2026-07-31", 36, []);
    const plan = planWeekDates({ existing: existing36, generated, thirdFor, isPositionRoundFor: posFor });
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(36);
    expect(plan.rows[11]).toMatchObject({ week_number: 12, third: 1, is_position_round: true });
    expect(plan.rows[24]).toMatchObject({ week_number: 25, third: 3, is_position_round: false });
  });
});

describe("formatDateOnly (no timezone shift)", () => {
  it("renders 2026-08-31 as Monday, August 31, 2026", () => {
    expect(formatDateOnlyLong("2026-08-31", "en-US")).toBe("Monday, August 31, 2026");
    expect(formatDateOnly("2026-08-31", { dateStyle: "medium" }, "en-US")).toBe("Aug 31, 2026");
  });

  it("survives DST boundaries", () => {
    expect(formatDateOnlyLong("2026-03-08", "en-US")).toBe("Sunday, March 8, 2026");
    expect(formatDateOnlyLong("2026-03-09", "en-US")).toBe("Monday, March 9, 2026");
    expect(formatDateOnlyLong("2026-11-01", "en-US")).toBe("Sunday, November 1, 2026");
    expect(formatDateOnlyLong("2026-11-02", "en-US")).toBe("Monday, November 2, 2026");
  });

  it("accepts timestamp-ish input and rejects junk", () => {
    expect(formatDateOnly("2026-08-31T00:00:00Z", { dateStyle: "medium" }, "en-US")).toBe("Aug 31, 2026");
    expect(formatDateOnly(null)).toBe("");
    expect(formatDateOnly("nope")).toBe("");
  });
});
