import { describe, expect, it } from "vitest";
import {
  isParticipationExempt,
  participationMinimums,
  teamGameOpportunities,
  type ParticipationMatchRow,
  type ParticipationRosterRow,
} from "./participation";
import { BOWLER_BOARDS, boardLeaders, milestoneBoard, milestoneLeaders } from "./leaderboards";

const match = (
  week: number,
  third: number,
  a: string | null,
  b: string | null,
  over: Partial<ParticipationMatchRow> = {},
): ParticipationMatchRow => ({
  status: "final",
  is_bye: false,
  team_a_id: a,
  team_b_id: b,
  weeks: { week_number: week, third },
  ...over,
});

const spot = (
  team: string,
  bowler: string,
  from = 1,
  to: number | null = null,
): ParticipationRosterRow => ({
  team_id: team,
  bowler_id: bowler,
  effective_from_week: from,
  effective_to_week: to,
});

const row = (bowler_id: string, games: number, extra: Record<string, any> = {}) => ({
  id: bowler_id,
  bowler_id,
  games,
  sets: Math.floor(games / 3),
  frames: games * 10,
  complete_games: games,
  team_games: games,
  bowlers: { full_name: bowler_id, slug: bowler_id, is_sub: false },
  average: 100,
  high_game: 150,
  high_set: 400,
  strikes: 20,
  spares: 20,
  clean_games: 2,
  longest_strike_streak: 4,
  ...extra,
});

const board = (key: string) => BOWLER_BOARDS.find((b) => b.key === key)!;

describe("teamGameOpportunities", () => {
  it("counts 3 team games per finalized non-bye match", () => {
    const matches = [1, 2, 3, 4, 5, 6].map((w) => match(w, w <= 3 ? 1 : 2, "t1", "t2"));
    const spots = [spot("t1", "b1")];
    expect(teamGameOpportunities(matches, spots, "full").get("b1")).toBe(18);
    expect(participationMinimums(matches, spots, "full").get("b1")).toBe(12);
  });

  it("ignores byes and unfinalized matches", () => {
    const matches = [
      match(1, 1, "t1", "t2"),
      match(2, 1, "t1", null, { is_bye: true }),
      match(3, 1, "t1", "t2", { status: "scheduled" }),
    ];
    expect(teamGameOpportunities(matches, [spot("t1", "b1")], "full").get("b1")).toBe(3);
  });

  it("counts only matches in the requested third", () => {
    const matches = [match(1, 1, "t1", "t2"), match(2, 1, "t1", "t2"), match(8, 2, "t1", "t2")];
    const spots = [spot("t1", "b1")];
    expect(teamGameOpportunities(matches, spots, "third_1").get("b1")).toBe(6);
    expect(teamGameOpportunities(matches, spots, "third_2").get("b1")).toBe(3);
  });

  it("gives a newly added team with fewer played matches its own denominator", () => {
    const matches = [
      match(1, 1, "old", "other"),
      match(2, 1, "old", "other"),
      match(2, 1, "new", "other2"),
    ];
    const spots = [spot("old", "b1"), spot("new", "b2", 2)];
    const mins = participationMinimums(matches, spots, "full");
    expect(mins.get("b1")).toBe(4);
    expect(mins.get("b2")).toBe(2);
  });

  it("accumulates opportunities across a mid-season transfer", () => {
    const matches = [1, 2, 3, 4].map((w) => match(w, 1, w <= 2 ? "t1" : "t2", "other"));
    const spots = [spot("t1", "b1", 1, 2), spot("t2", "b1", 3)];
    expect(teamGameOpportunities(matches, spots, "full").get("b1")).toBe(12);
  });

  it("deduplicates overlapping roster rows for the same bowler", () => {
    const matches = [match(1, 1, "t1", "t2")];
    const spots = [spot("t1", "b1"), spot("t1", "b1")];
    expect(teamGameOpportunities(matches, spots, "full").get("b1")).toBe(3);
  });
});

describe("participation filtering on boards", () => {
  const mins = new Map([
    ["b12", 12],
    ["b11", 12],
  ]);
  const rows = [row("b12", 12), row("b11", 11)];

  it("filters a bowler under the minimum from Average", () => {
    const ids = boardLeaders(board("avg"), rows, 5, { minGames: mins }).map((r) => r.bowler_id);
    expect(ids).toEqual(["b12"]);
  });

  it("requires a minimum entry to exist for the bowler", () => {
    const orphan = [row("nope", 30)];
    expect(boardLeaders(board("avg"), orphan, 5, { minGames: mins })).toHaveLength(0);
  });

  it("exempt boards ignore the minimum", () => {
    for (const key of ["strikes", "sparect", "clean", "streak", "marks"]) {
      expect(isParticipationExempt(key)).toBe(true);
      const ids = boardLeaders(board(key), rows, 5, { minGames: mins }).map((r) => r.bowler_id);
      expect(ids).toContain("b11");
    }
  });

  it("weekly calls omit the map and stay unchanged", () => {
    const ids = boardLeaders(board("avg"), rows, 5, {}).map((r) => r.bowler_id);
    expect(ids).toEqual(expect.arrayContaining(["b11", "b12"]));
  });

  it("subs remain excluded from season/third boards", () => {
    const withSub = [
      ...rows,
      row("sub1", 20, { bowlers: { full_name: "sub1", slug: "sub1", is_sub: true } }),
    ];
    const ids = boardLeaders(board("avg"), withSub, 5, { minGames: new Map([["sub1", 1], ["b12", 12]]) }).map(
      (r) => r.bowler_id,
    );
    expect(ids).not.toContain("sub1");
  });
});

describe("High Game / High Set milestone behavior", () => {
  it("stays exempt and unchanged", () => {
    expect(isParticipationExempt("hg")).toBe(true);
    expect(isParticipationExempt("hs")).toBe(true);
    const ms = milestoneBoard("hg")!;
    const events = [
      { event_id: "e1", full_name: "A", slug: "a", score: 210, week_number: 1, is_sub: false },
      { event_id: "e2", full_name: "B", slug: "b", score: 190, week_number: 2, is_sub: false },
    ];
    expect(milestoneLeaders(ms, events as any, { includeSubs: false })).toHaveLength(2);
  });
});

describe("Fewest Opens participation gating", () => {
  const opens = BOWLER_BOARDS.find((b) => b.key === "opens")!;
  const row = (id: string, games: number, o: number) => ({
    id, bowler_id: id, games, frames: games * 10, opens: o,
    bowlers: { full_name: id, slug: id, is_sub: false },
  });
  it("is not exempt from the 2/3 rule", () => {
    expect(isParticipationExempt("opens")).toBe(false);
  });
  it("hides a bowler below the minimum even with the fewest opens", () => {
    const rows = [row("Short", 5, 1), row("Full", 9, 20)];
    const min = new Map([["Short", 6], ["Full", 6]]);
    expect(boardLeaders(opens, rows, 5, { minGames: min }).map((r: any) => r.bowler_id)).toEqual(["Full"]);
  });
  it("weekly boards (no minimum map) keep everyone, sorted ascending", () => {
    const rows = [row("Full", 9, 20), row("Short", 5, 1)];
    expect(boardLeaders(opens, rows, 5, { minGames: null }).map((r: any) => r.bowler_id)).toEqual(["Short", "Full"]);
  });
  it("existing exemptions unchanged", () => {
    for (const k of ["hg", "hs", "strikes", "sparect", "clean", "streak", "marks"]) expect(isParticipationExempt(k)).toBe(true);
  });
});

describe("2/3 minimum — Don-like scenarios", () => {
  const weeks = (n: number) => Array.from({ length: n }, (_, i) => match(i + 1, 1, "T", "X"));
  const spot = (from: number, to: number | null = null, team = "T"): ParticipationRosterRow =>
    ({ team_id: team, bowler_id: "D", effective_from_week: from, effective_to_week: to });
  it("rostered all 7 weeks: 21 opportunities, minimum 14", () => {
    expect(teamGameOpportunities(weeks(7), [spot(1)], "full").get("D")).toBe(21);
    expect(participationMinimums(weeks(7), [spot(1)], "full").get("D")).toBe(14);
  });
  it.each([[2, false], [4, false], [5, true]])("%i weeks bowled (x3 games) vs 14", (w, ok) => {
    expect(w * 3 >= participationMinimums(weeks(7), [spot(1)], "full").get("D")!).toBe(ok);
  });
  it("late joiner from week 6 only accrues weeks 6-7", () => {
    expect(participationMinimums(weeks(7), [spot(6)], "full").get("D")).toBe(4);
  });
  it("transfer accrues each team's weeks once; overlapping rows don't double count", () => {
    const ms = [...weeks(4), ...[5, 6, 7].map((w) => match(w, 1, "U", "X"))];
    expect(teamGameOpportunities(ms, [spot(1, 4), spot(1, 4), spot(5, null, "U")], "full").get("D")).toBe(21);
  });
});
