import { describe, expect, it } from "vitest";
import {
  BOWLER_BOARDS,
  TEAM_BOARDS,
  boardLeaders,
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
} from "./leaderboards";

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
});
