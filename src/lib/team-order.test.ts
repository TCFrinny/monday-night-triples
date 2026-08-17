import { describe, expect, it } from "vitest";
import { compareTeamNames, sortTeamsByName } from "./team-order";

describe("team ordering", () => {
  it("orders #1..#18 naturally, not lexically", () => {
    const names = Array.from({ length: 18 }, (_, i) => `#${i + 1} TEAM`);
    const lexical = [...names].sort();
    expect(lexical[1]).toBe("#10 TEAM");
    expect(sortTeamsByName(lexical.map((name) => ({ name }))).map((t) => t.name)).toEqual(names);
  });

  it("handles plain numbering and missing names", () => {
    expect(sortTeamsByName([{ name: "10 Team" }, { name: "2 Team" }]).map((t) => t.name)).toEqual([
      "2 Team",
      "10 Team",
    ]);
    expect(compareTeamNames({ name: null }, { name: "#1" })).toBeLessThan(0);
  });

  it("does not mutate the input array", () => {
    const input = [{ name: "#3" }, { name: "#1" }];
    sortTeamsByName(input);
    expect(input[0]!.name).toBe("#3");
  });
});
