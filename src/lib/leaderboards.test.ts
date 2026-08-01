import { describe, expect, it } from "vitest";
import { BOWLER_BOARDS, TEAM_BOARDS, boardLeaders, individualRows } from "./leaderboards";

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
    };
    for (const board of TEAM_BOARDS) {
      expect(boardLeaders(board, [teamRow])).toHaveLength(1);
    }
    expect(individualRows([teamRow])).toHaveLength(1);
  });
});
