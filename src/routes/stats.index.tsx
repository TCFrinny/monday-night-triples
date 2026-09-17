import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileDown } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { EmptyState, ScopeTabs } from "@/components/league/ui";

import {
  activeSeasonQuery,
  bowlerStatsQuery,
  milestoneEventsQuery,
  rosterSpotsQuery,
  seasonMatchSummaryQuery,
  teamStatsQuery,
} from "@/lib/queries";
import { PARTICIPATION_NOTE, participationMinimums } from "@/lib/participation";
import { SCOPE_LABELS } from "@/lib/league";
import { BOWLER_BOARDS, TEAM_BOARDS, defaultWeek, finalizedWeeks, weeklyScope } from "@/lib/leaderboards";
import type { StandingsScope } from "@/lib/league";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";
import { buttonVariants } from "@/components/ui/button";
import { LeaderboardGrid } from "@/components/reports/leaderboard-grid";

export const Route = createFileRoute("/stats/")({
  head: () => ({
    meta: [
      { title: `Stats & Leaders — ${DEFAULT_LEAGUE_NAME}` },
      {
        name: "description",
        content:
          "Advanced duckpin leaderboards: averages, marks, consistency (std. dev.), pins lost per game, first five, last five, big opening, big finish and clutch frames for bowlers and teams.",
      },
      { property: "og:title", content: `Stats & Leaders — ${DEFAULT_LEAGUE_NAME}` },
      {
        property: "og:description",
        content:
          "Bowler and team leaderboards for consistency, pins lost, segment scoring, clutch marks, strikes, spares and opens.",
      },
    ],
  }),
  component: StatsPage,
});




function StatsPage() {
  const { data: season } = useQuery(activeSeasonQuery);
  const [view, setView] = useState<"season" | "weekly">("season");
  const [scope, setScope] = useState<StandingsScope>("full");
  const [mode, setMode] = useState<"bowlers" | "teams">("bowlers");
  const [week, setWeek] = useState<number | null>(null);
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));

  // Only finalized, non-bye matches produce a selectable week; default to the
  // latest one so an unbowled future week is never preselected.
  const weeks = finalizedWeeks(matches as any);
  const selectedWeek = week !== null && weeks.includes(week) ? week : defaultWeek(weeks);
  const weekly = view === "weekly";
  const activeScope = weekly ? (selectedWeek ? weeklyScope(selectedWeek) : "__none__") : scope;

  const { data: bowlerStats } = useQuery(bowlerStatsQuery(season?.id, activeScope));
  const { data: teamStats } = useQuery(teamStatsQuery(season?.id, activeScope));

  const boards = mode === "bowlers" ? BOWLER_BOARDS : TEAM_BOARDS;
  const rows: any[] =
    (weekly && !selectedWeek ? [] : (mode === "bowlers" ? bowlerStats : teamStats)) ?? [];
  // Weekly individual rankings include substitutes who actually bowled;
  // season and third boards keep excluding them.
  const includeSubs = weekly && mode === "bowlers";

  // High Game / High Set cards list actual performances, so they read the
  // event views instead of the one-max-per-entity cache rows.
  const gameKind = mode === "bowlers" ? "bowler_game" : "team_game";
  const setKind = mode === "bowlers" ? "bowler_set" : "team_set";
  const { data: gameEvents } = useQuery(milestoneEventsQuery(gameKind, season?.id, activeScope));
  const { data: setEvents } = useQuery(milestoneEventsQuery(setKind, season?.id, activeScope));
  const eventsFor = (kind: string): any[] =>
    (kind === gameKind ? gameEvents : kind === setKind ? setEvents : []) ?? [];

  // Season/Third individual boards require 2/3 of the team's completed games.
  // Weekly and team boards are untouched.
  const { data: rosterSpots } = useQuery(rosterSpotsQuery(season?.id));
  const participationActive = !weekly && mode === "bowlers";
  const minGames = participationActive
    ? participationMinimums(matches as any, (rosterSpots as any) ?? [], scope)
    : null;




  return (
    <PageShell
      eyebrow={season?.season_name ?? ""}
      title="Stats & Leaders"
      description="Every bowler and team with finalized games appears from Week 1 onward. All figures are scratch unless labelled HDCP."
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1 inline-flex items-center gap-1.5"><FileDown className="h-4 w-4" /> Print / Export</span>
        <Link to="/stats/print/bowlers" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>Bowlers — Full Season</Link>
        <Link to="/stats/print/teams" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>Teams — Full Season</Link>
        <Link to="/stats/print/all-bowlers" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>All Bowlers — Rostered + Subs</Link>
      </div>
      <div className="mb-5 flex flex-wrap gap-3">
        <ScopeTabs
          value={view}
          onChange={setView}
          options={[
            { value: "season", label: "Season / Third Leaders" },
            { value: "weekly", label: "Weekly Leaders" },
          ]}
        />
        <ScopeTabs
          value={mode}
          onChange={setMode}
          options={[
            { value: "bowlers", label: "Bowlers" },
            { value: "teams", label: "Teams" },
          ]}
        />
        {weekly ? (
          weeks.length > 0 && (
            <ScopeTabs
              value={String(selectedWeek ?? "")}
              onChange={(v) => setWeek(Number(v))}
              options={weeks.map((w) => ({ value: String(w), label: `Week ${w}` }))}
            />
          )
        ) : (
          <ScopeTabs
            value={scope}
            onChange={setScope}
            options={(["third_1", "third_2", "third_3", "full"] as StandingsScope[]).map((s) => ({
              value: s,
              label: SCOPE_LABELS[s],
            }))}
          />
        )}
      </div>

      {weekly && (
        <p className="mb-4 text-xs text-muted-foreground">
          {mode === "bowlers"
            ? "Weekly individual rankings include substitutes who actually bowled this week. Season and third leaderboards continue to exclude substitutes."
            : "Weekly team rankings include every performance credited to the team that week, substitutes included."}
        </p>
      )}

      {!rows.length ? (

        <EmptyState
          title={weekly ? "No finalized matches for this week" : "No statistics yet"}
          hint="Leaderboards populate once matches are finalized."
        />
      ) : (
        <LeaderboardGrid boards={boards} rows={rows} mode={mode} eventsFor={eventsFor} includeSubs={includeSubs} showEventWeeks={!weekly} />
      )}
    </PageShell>
  );
}
