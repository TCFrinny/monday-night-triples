import { describe, expect, it } from "vitest";
import { currentThirdScope, latestFinalizedWeek } from "@/lib/report-progress";

describe("print report progress", () => {
  it("uses the latest finalized league week", () => {
    const rows = [
      { status: "final", weeks: { week_number: 4 } },
      { status: "scheduled", weeks: { week_number: 20 } },
      { status: "final", weeks: { week_number: 7 } },
    ];
    expect(latestFinalizedWeek(rows)).toBe(7);
    expect(currentThirdScope(rows, [6, 12, 18])).toBe("third_2");
  });

  it("selects the first third during preseason", () => {
    expect(latestFinalizedWeek([])).toBe(0);
    expect(currentThirdScope([], [12, 24, 36])).toBe("third_1");
  });
});