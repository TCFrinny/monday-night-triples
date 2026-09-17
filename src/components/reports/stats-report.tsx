import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/league/ui";
import { LeaderboardGrid } from "@/components/reports/leaderboard-grid";
import { ReportShell } from "@/components/reports/report-shell";
import { BOWLER_BOARDS, TEAM_BOARDS } from "@/lib/leaderboards";
import {
  activeSeasonQuery,
  bowlerStatsQuery,
  milestoneEventsQuery,
  rosterSpotsQuery,
  seasonMatchSummaryQuery,
  teamStatsQuery,
  type MilestoneEventKind,
} from "@/lib/queries";
import { latestFinalizedWeek } from "@/lib/report-progress";
import { participationMinimums } from "@/lib/participation";

export function StatsReport({ mode }: { mode: "bowlers" | "teams" }) {
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));
  const { data: bowlerRows } = useQuery(bowlerStatsQuery(season?.id, "full"));
  const { data: teamRows } = useQuery(teamStatsQuery(season?.id, "full"));
  const { data: bowlerGames } = useQuery(milestoneEventsQuery("bowler_game", season?.id, "full"));
  const { data: bowlerSets } = useQuery(milestoneEventsQuery("bowler_set", season?.id, "full"));
  const { data: teamGames } = useQuery(milestoneEventsQuery("team_game", season?.id, "full"));
  const { data: teamSets } = useQuery(milestoneEventsQuery("team_set", season?.id, "full"));
  const eventSets: Record<MilestoneEventKind, any[]> = {
    bowler_game: bowlerGames ?? [], bowler_set: bowlerSets ?? [], team_game: teamGames ?? [], team_set: teamSets ?? [],
  };
  const rows = mode === "bowlers" ? bowlerRows ?? [] : teamRows ?? [];
  const boards = mode === "bowlers" ? BOWLER_BOARDS : TEAM_BOARDS;
  // Same full-season 2/3 participation rule as the on-screen bowler boards.
  const { data: rosterSpots } = useQuery(rosterSpotsQuery(season?.id));
  const minGames = mode === "bowlers"
    ? participationMinimums(matches as any, (rosterSpots as any) ?? [], "full")
    : null;

  return <ReportShell
    season={season}
    title={`Stats — ${mode === "bowlers" ? "Bowlers" : "Teams"} · Full Season`}
    latestWeek={latestFinalizedWeek(matches)}
    backTo="/stats"
    orientation="landscape"
    reportType="stats"
  >
    {!rows.length ? <EmptyState title="No statistics yet" hint="Leaderboards populate once matches are finalized." /> : (
      <LeaderboardGrid
        boards={boards}
        rows={rows}
        mode={mode}
        eventsFor={(kind) => eventSets[kind as MilestoneEventKind] ?? []}
        includeSubs={false}
        minGames={minGames}
        printable
      />
    )}
  </ReportShell>;
}