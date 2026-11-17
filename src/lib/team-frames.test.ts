import { describe, expect, it } from "vitest";
import { countTeamFrames, type TeamFrameGame } from "./team-frames";
import { BOWLER_BOARDS, TEAM_BOARDS, boardLeaders } from "./leaderboards";

const frame = (outcome: string, frameNumber = 4, anyBlind = false) => ({ outcome, frameNumber, anyBlind });
const game = (id: string, frames = [frame("strike")], extra: Partial<TeamFrameGame> = {}): TeamFrameGame => ({
  gameId: id, teamId: "team", matchId: "match", gameNumber: 1, week: 1, third: 1,
  status: "final", isBye: false, isBlind: false, frames, ...extra,
});
const count = (games: TeamFrameGame[]) => countTeamFrames(games).get("team") ?? 0;

describe("Team Frames actual-bowler rules", () => {
  it("counts three real strikes once", () => expect(count([game("a"), game("b"), game("c")])).toBe(1));
  it("counts strike plus two spares", () => expect(count([game("a"), game("b", [frame("spare")]), game("c", [frame("spare")])])).toBe(1));
  it.each(["open", "ten_box", "incomplete"])("a real %s blocks the frame", (outcome) =>
    expect(count([game("a"), game("b"), game("c", [frame(outcome)])])).toBe(0));
  it("ignores one full blind when both actual bowlers mark", () =>
    expect(count([game("a"), game("b"), game("c", [], { isBlind: true })])).toBe(1));
  it("a blind cannot compensate for an actual open", () =>
    expect(count([game("a"), game("b", [frame("open")]), game("c", [frame("strike")], { isBlind: true })])).toBe(0));
  it("synthetic blind strikes never create marks without actual marks", () =>
    expect(count([game("a", []), game("b", []), game("c", [frame("strike")], { isBlind: true })])).toBe(0));
  it("a substitute game is required normally regardless of identity", () =>
    expect(count([game("rostered"), game("substitute"), game("other")])).toBe(1));
  it("real marks before a withdrawal count while later B marks block", () => {
    const realAndBlind = [frame("strike", 4), frame("spare", 5, true)];
    const real = [frame("spare", 4), frame("strike", 5)];
    expect(count([game("a", real), game("b", real), game("withdrawn", realAndBlind)])).toBe(1);
  });
  it("any B ball blocks even a tenth-frame strike outcome", () =>
    expect(count([game("a", [frame("strike", 10)]), game("b", [frame("spare", 10)]), game("c", [frame("strike", 10, true)])])).toBe(0));
  it("a missing withdrawn frame blocks rather than reducing required bowlers", () =>
    expect(count([game("a"), game("b"), game("withdrawn", [])])).toBe(0));
  it("allows one actual mark with two full blinds", () =>
    expect(count([game("a"), game("b", [], { isBlind: true }), game("c", [], { isBlind: true })])).toBe(1));
  it("all three full blinds produce zero", () =>
    expect(count(["a", "b", "c"].map((id) => game(id, [frame("strike")], { isBlind: true })))).toBe(0));
  it("marks in different numbered frames do not count", () =>
    expect(count([game("a", [frame("strike", 1)]), game("b", [frame("spare", 2)]), game("c", [frame("strike", 3)])])).toBe(0));
  it("a nominal real mark after first B remains blocked", () => {
    const frames = [frame("strike", 4), frame("spare", 5)];
    expect(count([game("a", frames), game("b", frames), game("hybrid", [frame("open", 3, true), ...frames])])).toBe(0);
  });
  it("accumulates across numbered frames and games, max ten per game", () => {
    const frames = Array.from({ length: 10 }, (_, i) => frame("strike", i + 1));
    const games = [1, 2, 3].flatMap((gameNumber) => ["a", "b", "c"].map((id) => game(`${id}${gameNumber}`, frames, { gameNumber })));
    expect(count(games)).toBe(30);
  });
  it("duplicate games/frames and tenth bonuses do not double count", () => {
    const a = game("a", [frame("strike", 10), frame("strike", 10), frame("strike", 11)]);
    expect(count([a, a, game("b", a.frames), game("c", a.frames)])).toBe(1);
  });
  it.each(["in_progress", "scheduled"])("excludes %s matches", (status) =>
    expect(count([game("a", undefined, { status }), game("b", undefined, { status })])).toBe(0));
  it("excludes byes", () => expect(count([game("a", undefined, { isBye: true }), game("b", undefined, { isBye: true })])).toBe(0));
  it("keeps teams and matches separate", () =>
    expect(count([game("a"), game("b", [frame("open")], { teamId: "other" }), game("c", [frame("open")], { matchId: "other" })])).toBe(1));
  it("full, third and weekly filters use league scopes", () => {
    const games = [1, 2].flatMap((week) => ["a", "b"].map((id) => game(`${id}${week}`, undefined, { week, third: week, matchId: `m${week}` })));
    expect(count(games)).toBe(2);
    expect(countTeamFrames(games, { third: 1 }).get("team")).toBe(1);
    expect(countTeamFrames(games, { week: 2 }).get("team")).toBe(1);
    expect(countTeamFrames(games, { week: 3 }).size).toBe(0);
  });
});

describe("Team Frames shared leaderboard", () => {
  const board = TEAM_BOARDS.find((b) => b.key === "tframes");
  if (!board) throw new Error("Missing Team Frames board");
  it("ranks raw counts descending and expands fifth-position ties", () => {
    const rows = [3, 5, 4, 7, 6, 3, 2].map((team_frames, id) => ({ id, team_frames, matches: 1 }));
    expect(boardLeaders(board, rows).map((r) => r.team_frames)).toEqual([7, 6, 5, 4, 3, 3]);
    expect(board.value(rows[0])).toBe(3);
    expect(board.secondaryValue).toBeUndefined();
  });
  it("includes zero counts for played teams without a participation gate", () => {
    expect(boardLeaders(board, [{ team_frames: 0, matches: 1 }])).toHaveLength(1);
    expect(boardLeaders(board, [{ team_frames: 10, matches: 0 }])).toHaveLength(0);
  });
  it("does not add an individual ranking rule", () => {
    expect(BOWLER_BOARDS.some((b) => b.key === "tframes")).toBe(false);
  });
  it("places the team count immediately after HDCP set without reordering other metrics", () => {
    const hdcpSetIndex = TEAM_BOARDS.findIndex((b) => b.key === "thhs");
    expect(hdcpSetIndex).toBeGreaterThanOrEqual(0);
    expect(TEAM_BOARDS[hdcpSetIndex + 1]?.key).toBe("tframes");
    expect(TEAM_BOARDS.map((b) => b.key)).toEqual([
      "tavg", "thavg", "thg", "thhg", "ths", "thhs", "tframes", "tstrike", "tspare",
      "ttenbox", "tmark", "topen", "tstrikes", "tsparect", "topens", "tpinslost",
      "tconsistency", "tfirst5", "tlast5", "tbigopen", "tbigfinish", "tclutch", "tmarks",
      "tfb", "tfb8", "tfb9", "tsplitconv", "tsinglepin", "tsplits",
    ]);
  });
});