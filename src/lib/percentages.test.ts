import { describe, expect, it } from "vitest";
import { formatPercent, percentage } from "./percentages";
import { BOWLER_BOARDS, TEAM_BOARDS, boardLeaders, type Leader } from "./leaderboards";
import { formatAverage } from "./league";
import { formatPoa, laneStrikePct, type LaneRow } from "./lane-data";

function board(key: string): Leader {
  const b = [...BOWLER_BOARDS, ...TEAM_BOARDS].find((b) => b.key === key);
  if (!b) throw new Error(`Missing ${key}`);
  return b;
}
const row = (id: string, makes: number, attempts: number) => ({
  bowler_id: id, games: 30, splits: attempts, split_conversions: makes,
  single_pin_attempts: attempts, single_pin_conversions: makes,
});

describe("percentage ranking and formatting", () => {
  it.each([
    [BOWLER_BOARDS, "split", "singlepin"],
    [TEAM_BOARDS, "tsplitconv", "tsinglepin"],
  ] as const)("conversion board order is split then single pin", (boards, split, single) => {
    const keys = boards.map((b) => b.key);
    expect(keys.indexOf(single)).toBe(keys.indexOf(split) + 1);
  });
  it.each([[2, 3, "66.67%"], [1, 2, "50.00%"], [0, 3, "0.00%"], [0, 0, "0.00%"]] as const)("formats %i/%i exactly", (makes, attempts, expected) => expect(formatPercent(makes, attempts)).toBe(expected));
  it("keeps percentages unrounded for ranking", () => expect(percentage(2, 3)).toBeCloseTo(66.6666666667));
  it.each(["split", "tsplitconv", "singlepin", "tsinglepin"])("%s puts more makes first only for exact ties", (key) => {
    const rows = [row("small", 1, 2), row("big", 10, 20), row("same", 10, 20), row("higher", 2, 3)];
    expect(boardLeaders(board(key), rows).map((r) => r.bowler_id)).toEqual(["higher", "big", "same", "small"]);
  });
  it.each(["split", "tsplitconv", "singlepin", "tsinglepin"])("%s expands primary cutoff ties regardless of makes", (key) => {
    const rows = [row("a", 10, 10), row("b", 9, 10), row("c", 8, 10), row("d", 7, 10), row("small", 3, 5), row("large", 60, 100)];
    expect(boardLeaders(board(key), rows).map((r) => r.bowler_id)).toEqual(["a", "b", "c", "d", "large", "small"]);
  });
  it.each(["split", "tsplitconv", "singlepin", "tsinglepin"])("%s does not tie distinct ratios with equal display", (key) => {
    const rows = [row("a", 10, 10), row("b", 9, 10), row("c", 8, 10), row("d", 7, 10), row("higher", 50001, 100000), row("lower", 1, 2)];
    expect(formatPercent(50001, 100000)).toBe("50.00%");
    expect(boardLeaders(board(key), rows).map((r) => r.bowler_id)).toEqual(["a", "b", "c", "d", "higher"]);
  });
  it("non-percentage averages and POA are unchanged", () => {
    expect(formatAverage(130.333)).toBe("130.33");
    expect(formatPoa(4.11)).toBe("+4.11");
  });
  it("lane ratios retain precision for the common formatter", () => expect(formatPercent(laneStrikePct({ strikes: 2, frames: 3 } as LaneRow), 100)).toBe("66.67%"));
});