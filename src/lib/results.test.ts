import { describe, expect, it } from "vitest";
import { boardLeaders, BOWLER_BOARDS } from "@/routes/stats";
import { resolveGameSnapshot, buildGameSnapshot, isRichSnapshot } from "@/lib/results";

const board = (key: string) => BOWLER_BOARDS.find((b) => b.key === key)!;

// Real Week 1 cache row (Nick Lloyd) after one finalized match.
const nick = {
  id: "n1",
  bowlers: { full_name: "Nick Lloyd", slug: "nick-lloyd" },
  games: 3,
  sets: 1,
  pinfall: 508,
  average: 169.33,
  high_game: 180,
  high_set: 508,
  frames: 30,
  strikes: 9,
  spares: 13,
  spare_attempts: 21,
  ten_boxes: 4,
  opens: 4,
  clean_games: 0,
  first_ball_pins: 210,
  first_ball_count: 30,
  splits: 8,
  split_conversions: 2,
  longest_strike_streak: 3,
};

describe("stats leaderboard eligibility", () => {
  it("shows a 3-game bowler on average and percentage boards immediately", () => {
    for (const key of ["avg", "strike", "spare", "mark", "tenbox", "fb", "split", "hg", "hs", "pf"]) {
      expect(boardLeaders(board(key), [nick]).length, key).toBe(1);
    }
  });

  it("uses frames as the denominator for strike/mark/10-box, not games>=15", () => {
    const noFrames = { ...nick, frames: 0 };
    expect(boardLeaders(board("strike"), [noFrames])).toHaveLength(0);
    expect(boardLeaders(board("mark"), [noFrames])).toHaveLength(0);
    expect(boardLeaders(board("tenbox"), [noFrames])).toHaveLength(0);
    expect(boardLeaders(board("avg"), [noFrames])).toHaveLength(1);
  });

  it("uses spare attempts, first balls and splits as their own denominators", () => {
    expect(boardLeaders(board("spare"), [{ ...nick, spare_attempts: 0 }])).toHaveLength(0);
    expect(boardLeaders(board("fb"), [{ ...nick, first_ball_count: 0 }])).toHaveLength(0);
    expect(boardLeaders(board("split"), [{ ...nick, splits: 0 }])).toHaveLength(0);
    expect(boardLeaders(board("split"), [nick])).toHaveLength(1);
  });

  it("keeps rows whose value is legitimately zero", () => {
    const zero = { ...nick, strikes: 0, clean_games: 0, longest_strike_streak: 0 };
    expect(boardLeaders(board("strike"), [zero])).toHaveLength(1);
    expect(boardLeaders(board("clean"), [zero])).toHaveLength(1);
    expect(boardLeaders(board("streak"), [zero])).toHaveLength(1);
  });
});

describe("results per-game totals", () => {
  const TEAM_A = "warehime";
  const TEAM_B = "sortino";
  const lineups = [
    { team_id: TEAM_A, participation: "rostered", applicable_average: 140, bowler_games: [
      { game_number: 1, scratch_score: 130 },
      { game_number: 2, scratch_score: 160 },
      { game_number: 3, scratch_score: 150 },
    ] },
    { team_id: TEAM_A, participation: "rostered", applicable_average: 140, bowler_games: [
      { game_number: 1, scratch_score: 129 },
      { game_number: 2, scratch_score: 154 },
      { game_number: 3, scratch_score: 149 },
    ] },
    { team_id: TEAM_A, participation: "rostered", applicable_average: 140, bowler_games: [
      { game_number: 1, scratch_score: 129 },
      { game_number: 2, scratch_score: 153 },
      { game_number: 3, scratch_score: 149 },
    ] },
    { team_id: TEAM_B, participation: "rostered", applicable_average: 130, bowler_games: [
      { game_number: 1, scratch_score: 133 },
      { game_number: 2, scratch_score: 113 },
      { game_number: 3, scratch_score: 128 },
    ] },
    { team_id: TEAM_B, participation: "rostered", applicable_average: 130, bowler_games: [
      { game_number: 1, scratch_score: 132 },
      { game_number: 2, scratch_score: 113 },
      { game_number: 3, scratch_score: 128 },
    ] },
    { team_id: TEAM_B, participation: "rostered", applicable_average: 130, bowler_games: [
      { game_number: 1, scratch_score: 132 },
      { game_number: 2, scratch_score: 113 },
      { game_number: 3, scratch_score: 128 },
    ] },
  ];

  const legacyArgs = {
    gamePoints: [
      { game: 1, a: 0, b: 2 },
      { game: 2, a: 2, b: 0 },
      { game: 3, a: 2, b: 0 },
    ],
    lineups,
    teamAId: TEAM_A,
    teamBId: TEAM_B,
    handicapTeamId: TEAM_B,
    handicapPins: 8,
    blindDeduction: 10,
  };

  it("derives the known Week 1 totals from legacy {game,a,b} rows", () => {
    const snap = resolveGameSnapshot(legacyArgs);
    expect(snap.map((g) => g.a_scratch)).toEqual([388, 467, 448]);
    expect(snap.map((g) => g.b_scratch)).toEqual([397, 339, 384]);
    expect(snap.map((g) => g.a_hdcp)).toEqual([388, 467, 448]);
    expect(snap.map((g) => g.b_hdcp)).toEqual([405, 347, 392]);
    expect(snap.reduce((s, g) => s + g.a_hdcp, 0)).toBe(1303);
    expect(snap.reduce((s, g) => s + g.b_hdcp, 0)).toBe(1144);
    // points preserved from the legacy snapshot
    expect(snap.map((g) => `${g.a}-${g.b}`)).toEqual(["0-2", "2-0", "2-0"]);
  });

  it("prefers a stored rich snapshot over derivation", () => {
    const rich = buildGameSnapshot({
      scratchA: [388, 467, 448],
      scratchB: [397, 339, 384],
      hdcpA: [388, 467, 448],
      hdcpB: [405, 347, 392],
      gamePoints: [
        { game: 1, a: 0, b: 2 },
        { game: 2, a: 2, b: 0 },
        { game: 3, a: 2, b: 0 },
      ],
    });
    expect(isRichSnapshot(rich)).toBe(true);
    const snap = resolveGameSnapshot({ ...legacyArgs, gamePoints: rich, lineups: [] });
    expect(snap).toEqual(rich);
  });

  it("fills blind bowlers with average minus the deduction when no game row exists", () => {
    const snap = resolveGameSnapshot({
      ...legacyArgs,
      lineups: [
        { team_id: TEAM_A, participation: "blind", applicable_average: 120.9, bowler_games: [] },
      ],
      handicapTeamId: null,
      handicapPins: 0,
    });
    expect(snap[0]!.a_scratch).toBe(110);
  });
});
