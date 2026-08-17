import { describe, expect, it } from "vitest";
import {
  BOWLER_BOARDS,
  TEAM_BOARDS,
  highHdcpGame,
  boardLeaders,
  defaultWeek,
  finalizedWeeks,
  weeklyScope,
  clutchMarks,
  clutchOpportunities,
  clutchPct,
  framePinsLost,
  gameSegments,
  individualRows,
  isSegmentEligible,
  pinsLost,
  segmentAverage,
  teamGameSegmentTotals,
  teamSegmentAverage,
  topFivePlusMilestones,
  MILESTONE_BOARDS,
  milestoneBoard,
  milestoneLeaders,
} from "./leaderboards";
import { eventScopeFilter } from "./queries";

const bowlerRow = (name: string, is_sub: boolean, average: number) => ({
  id: name,
  bowlers: { id: name, full_name: name, slug: name.toLowerCase(), is_sub },
  games: 9,
  sets: 3,
  average,
  high_game: 140,
  high_set: 380,
  pinfall: 1080,
  frames: 90,
  strikes: 20,
  spares: 15,
  ten_boxes: 10,
  opens: 45,
  spare_attempts: 70,
  first_ball_pins: 630,
  first_ball_count: 90,
  splits: 5,
  split_conversions: 2,
  longest_strike_streak: 3,
  clean_games: 1,
  complete_games: 3,
  pins_lost: 12,
  pins_lost_per_game: 4,
  score_stddev: 10,
  first5_avg: 60,
  last5_avg: 60,
  big_opening_avg: 36,
  big_finish_avg: 40,
  clutch_marks: 3,
  clutch_frames: 6,
});

const rostered = bowlerRow("Rostered Ray", false, 120);
const sub = bowlerRow("Sub Sam", true, 199);

describe("individual leaderboards exclude subs", () => {
  it("keeps rostered bowlers and drops subs on every board", () => {
    for (const board of BOWLER_BOARDS) {
      const names = boardLeaders(board, [rostered, sub]).map((r) => r.bowlers.full_name);
      expect(names).toContain("Rostered Ray");
      expect(names).not.toContain("Sub Sam");
    }
  });

  it("filters regardless of scope because it is row-based, not scope-based", () => {
    for (const scope of ["third_1", "third_2", "third_3", "full"]) {
      const rows = [
        { ...rostered, scope },
        { ...sub, scope },
      ];
      expect(individualRows(rows)).toHaveLength(1);
      expect(boardLeaders(BOWLER_BOARDS[0]!, rows)[0]!.bowlers.is_sub).toBe(false);
    }
  });
});

describe("team leaderboards keep sub-attributed performance", () => {
  it("team rows are untouched and remain eligible", () => {
    const teamRow = {
      id: "t1",
      teams: { id: "t1", name: "Pin Pals", slug: "pin-pals" },
      matches: 1,
      points: 5,
      points_possible: 7,
      game_points: 4,
      set_points: 1,
      scratch_pinfall: 1303,
      hdcp_pinfall: 1303,
      scratch_avg: 434.3,
      hdcp_avg: 434.3,
      high_scratch_game: 467,
      high_hdcp_game: 467,
      high_scratch_set: 1303,
      high_hdcp_set: 1303,
      // includes frames thrown by a sub representing this team
      frames: 90,
      strikes: 25,
      spares: 18,
      ten_boxes: 9,
      opens: 38,
      spare_attempts: 65,
      first_ball_pins: 650,
      first_ball_count: 90,
      first_ball_eight_plus: 40,
      first_ball_nine_plus: 30,
      splits: 6,
      split_conversions: 3,
      team_games: 3,
      pins_lost: 36,
      pins_lost_per_game: 12,
      score_stddev: 14,
      first5_avg: 180,
      last5_avg: 190,
      big_opening_avg: 100,
      big_finish_avg: 120,
      clutch_marks: 9,
      clutch_frames: 18,
    };
    for (const board of TEAM_BOARDS) {
      expect(boardLeaders(board, [teamRow])).toHaveLength(1);
    }
    expect(individualRows([teamRow])).toHaveLength(1);
  });
});

const advBowler = (name: string, over: Record<string, any> = {}) => ({
  ...bowlerRow(name, false, 120),
  complete_games: 3,
  opens: 10,
  pins_lost_per_game: 4,
  score_stddev: 10,
  first5_avg: 60,
  last5_avg: 60,
  big_opening_avg: 36,
  big_finish_avg: 40,
  clutch_marks: 3,
  clutch_frames: 6,
  ...over,
});

const board = (key: string) => [...BOWLER_BOARDS, ...TEAM_BOARDS].find((b) => b.key === key)!;

describe("lower-is-better boards rank the smallest value first", () => {
  const rows = [
    advBowler("High", { opens: 20, frames: 100, pins_lost_per_game: 9, score_stddev: 30 }),
    advBowler("Low", { opens: 5, frames: 100, pins_lost_per_game: 1, score_stddev: 2 }),
  ];

  it.each(["opens", "openpct", "pinslost", "consistency"])("%s ranks Low first", (key) => {
    const b = board(key);
    expect(b.lowerIsBetter).toBe(true);
    expect(boardLeaders(b, rows)[0]!.bowlers.full_name).toBe("Low");
  });

  it("team open boards are ascending too", () => {
    for (const key of ["topen", "topens", "tpinslost", "tconsistency"]) {
      expect(board(key).lowerIsBetter).toBe(true);
    }
  });
});

describe("segment formulas", () => {
  const game = { c3: 30, c5: 55, c7: 80, final: 118 };

  it("derives first 5, last 5, big opening and big finish from cumulative scores", () => {
    expect(gameSegments(game)).toEqual({
      first5: 55,
      last5: 63,
      bigOpening: 30,
      bigFinish: 38,
    });
  });

  it("averages segments across complete games", () => {
    const games = [game, { c3: 20, c5: 45, c7: 70, final: 100 }];
    expect(segmentAverage(games, "first5")).toBe(50);
    expect(segmentAverage(games, "last5")).toBe((63 + 55) / 2);
    expect(segmentAverage(games, "bigOpening")).toBe(25);
    expect(segmentAverage(games, "bigFinish")).toBe((38 + 30) / 2);
    expect(segmentAverage([], "first5")).toBe(0);
  });
});

describe("clutch marks and pins lost", () => {
  const frames = [
    { frame_number: 1, outcome: "strike" as const },
    { frame_number: 8, outcome: "spare" as const },
    { frame_number: 9, outcome: "strike" as const },
    { frame_number: 9, outcome: "ten_box" as const },
    { frame_number: 10, outcome: "spare" as const },
    { frame_number: 10, outcome: "open" as const, balls: [4, 2, 1] },
  ];

  it("counts only marks in frames 9 and 10", () => {
    expect(clutchMarks(frames)).toBe(2);
  });

  it("loses no pins on strikes, spares and 10-boxes", () => {
    expect(framePinsLost({ frame_number: 4, outcome: "ten_box", balls: [3, 4, 3] })).toBe(0);
    expect(framePinsLost({ frame_number: 4, outcome: "strike", balls: [10] })).toBe(0);
    expect(framePinsLost({ frame_number: 4, outcome: "spare", balls: [6, 4] })).toBe(0);
  });

  it("counts standing pins after the final ball of an open frame", () => {
    expect(framePinsLost({ frame_number: 4, outcome: "open", balls: [3, 2, 1] })).toBe(4);
    expect(pinsLost(frames)).toBe(3);
  });
});

describe("new boards keep existing sub and team behaviour", () => {
  const subRow = { ...advBowler("Sub Sam"), bowlers: { ...bowlerRow("Sub Sam", true, 199).bowlers } };

  it("excludes subs from every new individual board", () => {
    const rows = [advBowler("Rostered Ray"), subRow];
    for (const key of [
      "strikes",
      "sparect",
      "opens",
      "openpct",
      "pinslost",
      "consistency",
      "first5",
      "last5",
      "bigopen",
      "bigfinish",
      "clutch",
      "marks",
    ]) {
      const names = boardLeaders(board(key), rows).map((r) => r.bowlers.full_name);
      expect(names).toEqual(["Rostered Ray"]);
    }
  });

  it("keeps sub-attributed team frames on every new team board", () => {
    const teamRow = {
      id: "t1",
      teams: { id: "t1", name: "Pin Pals", slug: "pin-pals" },
      matches: 1,
      // frames below include frames thrown by a sub representing the team
      frames: 90,
      strikes: 25,
      spares: 18,
      opens: 30,
      team_games: 3,
      pins_lost_per_game: 12,
      score_stddev: 14,
      first5_avg: 180,
      last5_avg: 190,
      big_opening_avg: 100,
      big_finish_avg: 120,
      clutch_marks: 9,
      clutch_frames: 18,
    };
    for (const key of [
      "tstrikes",
      "tsparect",
      "topens",
      "topen",
      "tpinslost",
      "tconsistency",
      "tfirst5",
      "tlast5",
      "tbigopen",
      "tbigfinish",
      "tclutch",
      "tmarks",
    ]) {
      expect(boardLeaders(board(key), [teamRow])).toHaveLength(1);
    }
    expect(board("tmarks").value(teamRow)).toBe(43);
  });
});

describe("card notes", () => {
  it("has no note on spare %, 10-box %, team open or pins-lost boards", () => {
    for (const key of ["spare", "tenbox", "tspare", "ttenbox", "topen", "pinslost", "tpinslost"]) {
      expect(board(key).note).toBeUndefined();
    }
  });
});

describe("removed team cards", () => {
  it("drops standings-style cards from team leaderboards", () => {
    const keys = TEAM_BOARDS.map((b) => b.key);
    for (const key of ["twins", "tpctw", "tgp", "tsp", "tscrpf", "thdcppf"]) {
      expect(keys).not.toContain(key);
    }
  });
});

describe("team segment eligibility (Sortino William regression)", () => {
  // Week 1 raw data: Jeff Kapper game 2 was stored with is_complete = false
  // even though all ten frames were scored, which dropped his 67-pin First 5
  // out of the team-game numerator while still dividing by three team games.
  const g = (c3: number, c5: number, c7: number, final: number, over = {}) => ({
    frames: 10,
    c3,
    c5,
    c7,
    final,
    ...over,
  });

  const week1 = [
    [g(77, 103, 129, 157), g(35, 59, 87, 115), g(27, 55, 80, 125)],
    [g(28, 67, 87, 91, { is_complete: false }), g(46, 70, 96, 133), g(38, 64, 91, 119)],
    [g(42, 61, 107, 160), g(26, 47, 63, 91), g(49, 72, 97, 133)],
  ];

  it("counts a fully-scored game flagged incomplete", () => {
    expect(isSegmentEligible(g(28, 67, 87, 91, { is_complete: false }))).toBe(true);
    expect(teamGameSegmentTotals(week1[1]!)!.first5).toBe(201);
    expect(teamSegmentAverage(week1, "first5")).toBeCloseTo(199.33, 2);
  });

  it("never treats missing bowler segment data as zero", () => {
    const partial = [g(77, 103, 129, 157), g(35, 59, 87, 115), { frames: 4, c3: 20 }];
    expect(teamGameSegmentTotals(partial)).toBeNull();
    // the partial team game drops out entirely instead of dragging the average down
    expect(teamSegmentAverage([week1[0]!, partial], "first5")).toBe(217);
  });
});

describe("clutch percentage", () => {
  const frames = [
    { frame_number: 9, outcome: "strike" as const },
    { frame_number: 9, outcome: "open" as const, balls: [3, 2, 1] },
    { frame_number: 10, outcome: "spare" as const },
    { frame_number: 10, outcome: "incomplete" as const },
    { frame_number: 8, outcome: "strike" as const },
  ];

  it("uses only completed frames 9-10 as the denominator", () => {
    expect(clutchMarks(frames)).toBe(2);
    expect(clutchOpportunities(frames)).toBe(3);
    expect(clutchPct(frames)).toBe(66.7);
  });

  it("ranks higher percentage first for bowlers and teams", () => {
    for (const key of ["clutch", "tclutch"]) {
      const b = board(key);
      expect(b.lowerIsBetter).toBeUndefined();
      const rows = [
        { ...advBowler("Cold"), clutch_marks: 2, clutch_frames: 10 },
        { ...advBowler("Hot"), clutch_marks: 8, clutch_frames: 10 },
      ];
      expect(boardLeaders(b, rows)[0]!.bowlers.full_name).toBe("Hot");
      expect(b.fmt!(rows[1]!)).toBe("80%");
      expect(b.eligible!({ clutch_frames: 0 })).toBe(false);
    }
  });

  it("includes substitute-thrown frames in team clutch", () => {
    const teamRow = { clutch_marks: 12, clutch_frames: 18 }; // 18 = 3 bowlers x 3 games x 2 frames, one a sub
    expect(board("tclutch").value(teamRow)).toBe(66.7);
    expect(boardLeaders(board("tclutch"), [teamRow])).toHaveLength(1);
  });

  it("High HDCP Game uses the max team game total including handicap", () => {
    const games = [
      { scratch: 397, handicap: 8 },
      { scratch: 372, handicap: 8 },
      { scratch: 384, handicap: 8 },
    ];
    expect(highHdcpGame(games)).toBe(405);
    expect(highHdcpGame([])).toBe(0);

    const b = board("thhg");
    const row = { matches: 1, high_hdcp_game: highHdcpGame(games) };
    expect(b.value(row)).toBe(405);
    expect(b.value(row)).not.toBe(0);
    expect(boardLeaders(b, [row])).toHaveLength(1);
    // ranks the higher handicap game first
    const other = { matches: 1, high_hdcp_game: highHdcpGame([{ scratch: 467, handicap: 0 }]) };
    expect(boardLeaders(b, [row, other]).map((r: any) => r.high_hdcp_game)).toEqual([467, 405]);
  });
});


describe("weekly leaderboards", () => {
  const matches = [
    { status: "final", is_bye: false, weeks: { week_number: 1 } },
    { status: "final", is_bye: false, weeks: { week_number: 2 } },
    { status: "final", is_bye: true, weeks: { week_number: 3 } },
    { status: "scheduled", is_bye: false, weeks: { week_number: 4 } },
  ];

  it("lists only weeks with finalized, non-bye play", () => {
    expect(finalizedWeeks(matches)).toEqual([1, 2]);
    expect(finalizedWeeks([])).toEqual([]);
  });

  it("defaults to the latest finalized week", () => {
    expect(defaultWeek(finalizedWeeks(matches))).toBe(2);
    expect(defaultWeek([])).toBeNull();
  });

  it("builds the cache scope key for a week", () => {
    expect(weeklyScope(7)).toBe("week_7");
  });

  it("includes subs on weekly individual boards but not season boards", () => {
    const board = BOWLER_BOARDS.find((b) => b.key === "avg")!;
    const season = boardLeaders(board, [rostered, sub]).map((r) => r.bowlers.full_name);
    const week = boardLeaders(board, [rostered, sub], 5, { includeSubs: true }).map(
      (r) => r.bowlers.full_name,
    );
    expect(season).not.toContain("Sub Sam");
    expect(week[0]).toBe("Sub Sam");
    expect(week).toContain("Rostered Ray");
  });

  it("keeps lower-is-better ordering when subs are included", () => {
    const board = BOWLER_BOARDS.find((b) => b.lowerIsBetter)!;
    const rows = [rostered, { ...sub, ...zeroed(board) }];
    const ranked = boardLeaders(board, rows, 5, { includeSubs: true });
    expect(board.value(ranked[0]!)).toBeLessThanOrEqual(board.value(ranked[1]!));
  });
});

function zeroed(board: any) {
  return { pins_lost: 0, pins_lost_per_game: 0, score_stddev: 0, opens: 0 };
}

describe("milestone performance cards", () => {
  const ev = (id: string, score: number, over: Record<string, any> = {}) => ({
    event_id: id,
    score,
    week_number: 1,
    full_name: "Ray",
    slug: "ray",
    is_sub: false,
    ...over,
  });

  it("shows all 7 events when 7 clear the threshold", () => {
    const events = Array.from({ length: 7 }, (_, i) => ev(`g${i}`, 200 + i));
    expect(topFivePlusMilestones(events, 200)).toHaveLength(7);
  });

  it("still shows the normal top 5 when only 3 clear the threshold", () => {
    const events = [
      ev("a", 250),
      ev("b", 210),
      ev("c", 200),
      ev("d", 150),
      ev("e", 140),
      ev("f", 130),
    ];
    const out = topFivePlusMilestones(events, 200);
    expect(out).toHaveLength(5);
    expect(out.map((e) => e.event_id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("exact threshold scores qualify (200 / 500 / 1500)", () => {
    for (const t of [200, 500, 1500]) {
      const events = [
        ...Array.from({ length: 5 }, (_, i) => ev(`top${i}`, t + 100 + i)),
        ev("exact", t),
        ev("below", t - 1),
      ];
      const out = topFivePlusMilestones(events, t);
      expect(out.map((e) => e.event_id)).toContain("exact");
      expect(out.map((e) => e.event_id)).not.toContain("below");
    }
  });

  it("lets the same bowler appear twice for distinct events but dedupes one event", () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) => ev(`o${i}`, 300 + i, { full_name: "Other" })),
      ev("x1", 210),
      ev("x2", 205),
      ev("x1", 210),
    ];
    const out = topFivePlusMilestones(events, 200);
    expect(out.filter((e) => e['full_name'] === "Ray")).toHaveLength(2);
    expect(out.filter((e) => e.event_id === "x1")).toHaveLength(1);
  });

  it("is deterministic on ties", () => {
    const events = [ev("b", 200), ev("a", 200), ev("c", 200)];
    expect(topFivePlusMilestones(events, 200).map((e) => e.event_id)).toEqual(["a", "b", "c"]);
  });

  it("configures the four special cards with the requested thresholds", () => {
    expect(MILESTONE_BOARDS.map((b) => [b.key, b.threshold, b.kind])).toEqual([
      ["hg", 200, "bowler_game"],
      ["hs", 500, "bowler_set"],
      ["thg", 500, "team_game"],
      ["ths", 1500, "team_set"],
    ]);
    expect(milestoneBoard("avg")).toBeUndefined();
  });

  it("excludes subs on season/third individual cards and keeps them weekly", () => {
    const events = [ev("r", 210), ev("s", 260, { full_name: "Sub Sam", is_sub: true })];
    const b = milestoneBoard("hg")!;
    expect(milestoneLeaders(b, events).map((e) => e['full_name'])).toEqual(["Ray"]);
    expect(milestoneLeaders(b, events, { includeSubs: true }).map((e) => e['full_name'])).toEqual([
      "Sub Sam",
      "Ray",
    ]);
  });

  it("keeps sub-thrown performance on team cards", () => {
    const events = [ev("t1", 520, { name: "Pin Pals", is_sub: true })];
    expect(milestoneLeaders(milestoneBoard("thg")!, events)).toHaveLength(1);
  });

  it("leaves every other card on the normal top 5", () => {
    const rows = Array.from({ length: 8 }, (_, i) => advBowler(`B${i}`, { average: 300 - i }));
    expect(boardLeaders(board("avg"), rows)).toHaveLength(5);
  });
});

describe("event scope filters", () => {
  it("maps leaderboard scopes onto the event views", () => {
    expect(eventScopeFilter("full")).toEqual({});
    expect(eventScopeFilter("third_2")).toEqual({ third: 2 });
    expect(eventScopeFilter("week_7")).toEqual({ week: 7 });
  });
});
