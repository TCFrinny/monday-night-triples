/** Reference for team_frame_scope_counts: full blinds are not required;
 * hybrid games remain required, with any blind-assisted frame blocking marks. */
export interface TeamFrameGame {
  gameId: string;
  teamId: string;
  matchId: string;
  gameNumber: number;
  week: number;
  third: number;
  status: string;
  isBye: boolean;
  isBlind: boolean;
  frames: { frameNumber: number; outcome: string; anyBlind: boolean }[];
}

export function countTeamFrames(
  games: TeamFrameGame[],
  scope: { third?: number; week?: number } = {},
): Map<string, number> {
  const groups = new Map<string, Map<string, TeamFrameGame>>();
  for (const game of games) {
    if (game.status !== "final" || game.isBye || game.isBlind) continue;
    if (scope.third !== undefined && game.third !== scope.third) continue;
    if (scope.week !== undefined && game.week !== scope.week) continue;
    const key = JSON.stringify([game.teamId, game.matchId, game.gameNumber]);
    const group = groups.get(key) ?? new Map<string, TeamFrameGame>();
    group.set(game.gameId, game);
    groups.set(key, group);
  }
  const counts = new Map<string, number>();
  for (const group of groups.values()) {
    const actual = [...group.values()];
    const first = actual[0];
    if (!first) continue;
    let count = 0;
    if (actual.length >= 2) {
      for (let n = 1; n <= 10; n++) {
        if (actual.every((g) => g.frames.some((f) =>
          f.frameNumber === n && !f.anyBlind && (f.outcome === "strike" || f.outcome === "spare"),
        ))) count++;
      }
    }
    counts.set(first.teamId, (counts.get(first.teamId) ?? 0) + count);
  }
  return counts;
}