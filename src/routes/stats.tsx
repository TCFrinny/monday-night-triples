import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { EmptyState, ScopeTabs } from "@/components/league/ui";
import {
  activeSeasonQuery,
  bowlerStatsQuery,
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
  weeklyScope,
} from "@/lib/leaderboards";
import type { StandingsScope } from "@/lib/league";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Stats & Leaders — Monday Night Triples" },
      {
        name: "description",
        content:
          "Advanced duckpin leaderboards: averages, marks, consistency (std. dev.), pins lost per game, first five, last five, big opening, big finish and clutch frames for bowlers and teams.",
      },
      { property: "og:title", content: "Stats & Leaders — Monday Night Triples" },
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


  return (
    <PageShell
      eyebrow={season?.season_name ?? ""}
      title="Stats & Leaders"
      description="Every bowler and team with finalized games appears from Week 1 onward. All figures are scratch unless labelled HDCP."
    >
      <div className="mb-5 flex flex-wrap gap-3">
        <ScopeTabs
          value={mode}
          onChange={setMode}
          options={[
            { value: "bowlers", label: "Bowlers" },
            { value: "teams", label: "Teams" },
          ]}
        />
        <ScopeTabs
          value={scope}
          onChange={setScope}
          options={(["third_1", "third_2", "third_3", "full"] as StandingsScope[]).map((s) => ({
            value: s,
            label: SCOPE_LABELS[s],
          }))}
        />
      </div>

      {!rows.length ? (
        <EmptyState title="No statistics yet" hint="Leaderboards populate once matches are finalized." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => {
            const eligible = boardLeaders(board, rows);

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
