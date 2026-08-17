import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { EmptyState, ScopeTabs } from "@/components/league/ui";

import {
  activeSeasonQuery,
  bowlerStatsQuery,
  milestoneEventsQuery,
  seasonMatchSummaryQuery,
  teamStatsQuery,
} from "@/lib/queries";
import { SCOPE_LABELS } from "@/lib/league";
import {
  BOWLER_BOARDS,
  TEAM_BOARDS,
  boardLeaders,
  defaultWeek,
  finalizedWeeks,
  milestoneBoard,
  milestoneLeaders,
  weeklyScope,
} from "@/lib/leaderboards";
import type { StandingsScope } from "@/lib/league";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";

export const Route = createFileRoute("/stats")({
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




  return (
    <PageShell
      eyebrow={season?.season_name ?? ""}
      title="Stats & Leaders"
      description="Every bowler and team with finalized games appears from Week 1 onward. All figures are scratch unless labelled HDCP."
    >
      <div className="mb-5 flex flex-wrap gap-3">
        <ScopeTabs
          value={view}
          onChange={setView}
          options={[
            { value: "season", label: "Season / Third Leaders" },
            { value: "weekly", label: "Weekly Leaders" },
          ]}
        />
        {(
          <ScopeTabs
            value={mode}
            onChange={setMode}
            options={[
              { value: "bowlers", label: "Bowlers" },
              { value: "teams", label: "Teams" },
            ]}
          />
        )}
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => {
            const ms = milestoneBoard(board.key);
            if (ms) {
              const events = milestoneLeaders(ms, eventsFor(ms.kind) as any, { includeSubs });
              return (
                <div key={board.key} className="panel p-5">
                  <h2 className="font-display text-base uppercase tracking-wide text-foreground">
                    {board.title}
                  </h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Top 5, plus every {ms.threshold}+ performance in this scope.
                  </p>
                  <ol className="mt-3 space-y-1.5 text-sm">
                    {events.map((e: any, i: number) => (
                      <li key={e.event_id} className="flex items-center gap-2">
                        <span
                          className={
                            i === 0 ? "stat-num w-5 text-gold" : "stat-num w-5 text-muted-foreground"
                          }
                        >
                          {i + 1}
                        </span>
                        {ms.entity === "bowler" ? (
                          <Link
                            to="/bowlers/$slug"
                            params={{ slug: e.slug ?? "" }}
                            className="truncate text-foreground hover:text-primary hover:underline"
                          >
                            {e.full_name ?? "—"}
                          </Link>
                        ) : (
                          <Link
                            to="/teams/$slug"
                            params={{ slug: e.slug ?? "" }}
                            className="truncate text-foreground hover:text-primary hover:underline"
                          >
                            {e.name ?? "—"}
                          </Link>
                        )}
                        {!weekly && e.week_number != null && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            Week {e.week_number}
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-1.5">
                          {Number(e.score) >= ms.threshold && (
                            <span className="rounded-sm bg-primary/15 px-1 text-[10px] uppercase tracking-wide text-primary">
                              {ms.threshold}+
                            </span>
                          )}
                          <span className="stat-num text-primary">{e.score}</span>
                        </span>
                      </li>
                    ))}
                    {!events.length && <li className="text-xs text-muted-foreground">No data yet.</li>}
                  </ol>
                </div>
              );
            }
            const eligible = boardLeaders(board, rows, 5, { includeSubs });


            return (
              <div key={board.key} className="panel p-5">
                <h2 className="font-display text-base uppercase tracking-wide text-foreground">
                  {board.title}
                </h2>
                {board.note && <p className="mt-1 text-[11px] text-muted-foreground">{board.note}</p>}
                <ol className="mt-3 space-y-1.5 text-sm">
                  {eligible.map((r, i) => (
                    <li key={r.id ?? i} className="flex items-center gap-2">
                      <span className={i === 0 ? "stat-num w-5 text-gold" : "stat-num w-5 text-muted-foreground"}>
                        {i + 1}
                      </span>
                      {mode === "bowlers" ? (
                        <Link
                          to="/bowlers/$slug"
                          params={{ slug: r.bowlers?.slug ?? "" }}
                          className="truncate text-foreground hover:text-primary hover:underline"
                        >
                          {r.bowlers?.full_name ?? "—"}
                        </Link>
                      ) : (
                        <Link
                          to="/teams/$slug"
                          params={{ slug: r.teams?.slug ?? "" }}
                          className="truncate text-foreground hover:text-primary hover:underline"
                        >
                          {r.teams?.name ?? "—"}
                        </Link>
                      )}
                      <span className="ml-auto stat-num text-primary">
                        {board.fmt ? board.fmt(r) : board.value(r)}
                      </span>
                    </li>
                  ))}
                  {!eligible.length && (
                    <li className="text-xs text-muted-foreground">No data yet.</li>
                  )}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
