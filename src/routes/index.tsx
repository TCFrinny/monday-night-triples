import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/page-shell";
import { EmptyState, PositionRoundBadge, Stat, TeamLink } from "@/components/league/ui";
import {
  activeSeasonQuery,
  announcementsQuery,
  bowlerStatsQuery,
  recentResultsQuery,
  seasonMatchSummaryQuery,
  standingsQuery,
  weeksQuery,
} from "@/lib/queries";
import {
  SCOPE_LABELS,
  formatAverage,
  formatPoints,
  formatRecord,
  recordFromPoints,
  scopeForThird,
  thirdForWeek,
} from "@/lib/league";
import { DEFAULT_LEAGUE_NAME, resolveLeagueName } from "@/lib/branding";
import { orderStandingsRows } from "@/lib/standings-order";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${DEFAULT_LEAGUE_NAME} — Duckpin League at AMF Dundalk` },
      {
        name: "description",
        content:
          `Official home of the ${DEFAULT_LEAGUE_NAME} duckpin league at AMF Dundalk: live standings, weekly schedule, results, team rosters and bowler statistics.`,
      },
      { property: "og:title", content: `${DEFAULT_LEAGUE_NAME} — Duckpin League at AMF Dundalk` },
      {
        property: "og:description",
        content: `Standings, schedule, results and duckpin statistics for the ${DEFAULT_LEAGUE_NAME} league.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { data: season } = useQuery(activeSeasonQuery);
  const leagueName = resolveLeagueName(season);
  const { data: weeks } = useQuery(weeksQuery(season?.id));
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));
  const { data: results } = useQuery(recentResultsQuery(season?.id));
  const { data: news } = useQuery(announcementsQuery(season?.id));

  const finalWeeks = (matches ?? []).filter((m: any) => m.status === "final").map((m: any) => m.weeks.week_number);
  const lastWeek = finalWeeks.length ? Math.max(...finalWeeks) : 0;
  const boundaries = season?.third_boundaries ?? [12, 24, 36];
  const currentThird = thirdForWeek(Math.max(1, lastWeek || 1), boundaries);
  const scope = scopeForThird(currentThird);

  const { data: standingsRaw } = useQuery(standingsQuery(season?.id, scope));
  const standings = orderStandingsRows((standingsRaw ?? []) as any[]) as any[];
  const { data: bowlerStats } = useQuery(bowlerStatsQuery(season?.id, "full"));

  const nextWeek = (weeks ?? []).find((w: any) => w.week_number > lastWeek);
  const nextMatches = (matches ?? []).filter((m: any) => m.weeks.id === nextWeek?.id);
  const minGames = season?.establishment_threshold ?? 15;
  const avgLeaders = [...(bowlerStats ?? [])]
    .filter((r: any) => (r.games ?? 0) >= minGames)
    .sort((a: any, b: any) => Number(b.average) - Number(a.average))
    .slice(0, 5);

  if (!season) {
    return (
      <PageShell eyebrow="AMF Dundalk" title={leagueName}>
        <EmptyState
          title="No active season"
          hint="An administrator can create a season, add teams and generate the schedule from the Admin area."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={`AMF Dundalk · ${season.season_name}`}
      title={leagueName}
      description="Three-person duckpin teams, 80% team handicap, seven points a week. Everything below updates the moment a sheet is finalized."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Weeks completed" value={`${lastWeek} of ${season.total_weeks ?? weeks?.length ?? 0}`} />
        <Stat label="Current third" value={`${currentThird}${currentThird === 1 ? "st" : currentThird === 2 ? "nd" : "rd"}`} gold />
        <Stat label="Teams" value={(standings ?? []).length} />
        <Stat label="Next week" value={nextWeek ? `Week ${nextWeek.week_number}` : "Season complete"} />
      </div>

      {!!(news ?? []).length && (
        <div className="mt-8 space-y-3">
          {(news ?? []).slice(0, 3).map((n: any) => (
            <div key={n.id} className="panel border-l-2 border-l-gold p-4">
              <p className="font-display text-sm uppercase tracking-wide text-gold">{n.title}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{n.message}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg uppercase text-foreground">
              {SCOPE_LABELS[scope]} standings
            </h2>
            <Link to="/standings" className="text-xs text-primary hover:underline">
              Full standings →
            </Link>
          </div>
          {!(standings ?? []).length ? (
            <EmptyState title="Standings appear after week 1" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="py-2">#</th>
                  <th className="py-2">Team</th>
                  <th className="py-2 text-right">W-L</th>
                  <th className="py-2 text-right">HDCP Pinfall</th>
                </tr>
              </thead>
              <tbody>
                {(standings ?? []).slice(0, 6).map((r: any) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className={r.rank === 1 ? "py-2 stat-num text-gold" : "py-2 stat-num"}>{r.rank}</td>
                    <td className="py-2">
                      <TeamLink team={r.teams} />
                    </td>
                    <td className="py-2 text-right stat-num text-primary">
                      {formatRecord(recordFromPoints(Number(r.points), Number(r.matches_played)))}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {Number(r.hdcp_pinfall).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg uppercase text-foreground">Average leaders</h2>
            <Link to="/stats" className="text-xs text-primary hover:underline">
              All stats →
            </Link>
          </div>
          <ol className="space-y-2 text-sm">
            {avgLeaders.map((r: any, i: number) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className={i === 0 ? "stat-num w-5 text-gold" : "stat-num w-5 text-muted-foreground"}>
                  {i + 1}
                </span>
                <Link
                  to="/bowlers/$slug"
                  params={{ slug: r.bowlers?.slug ?? "" }}
                  className="truncate hover:text-primary hover:underline"
                >
                  {r.bowlers?.full_name}
                </Link>
                <span className="ml-auto stat-num text-primary">{formatAverage(r.average)}</span>
              </li>
            ))}
            {!avgLeaders.length && (
              <li className="text-xs text-muted-foreground">
                Averages qualify after {minGames} games.
              </li>
            )}
          </ol>
        </section>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg uppercase text-foreground">
              {nextWeek ? `Week ${nextWeek.week_number} matchups` : "Schedule"}
            </h2>
            <Link to="/schedule" className="text-xs text-primary hover:underline">
              Schedule →
            </Link>
          </div>
          <div className="panel divide-y divide-border/60">
            {nextMatches.map((m: any) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="w-14 text-xs text-muted-foreground">{m.lane_pair ?? "—"}</span>
                <span className="flex-1">
                  <TeamLink team={m.team_a} /> <span className="text-muted-foreground">vs</span>{" "}
                  {m.is_bye ? <span className="text-muted-foreground">Bye</span> : <TeamLink team={m.team_b} />}
                </span>
                {nextWeek?.is_position_round && <PositionRoundBadge />}
              </div>
            ))}
            {!nextMatches.length && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No upcoming matchups scheduled.
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg uppercase text-foreground">Latest results</h2>
            <Link to="/results" className="text-xs text-primary hover:underline">
              All results →
            </Link>
          </div>
          <div className="panel divide-y divide-border/60">
            {(results ?? []).slice(0, 6).map((m: any) => (
              <Link
                key={m.id}
                to="/match/$matchId"
                params={{ matchId: m.id }}
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-secondary/30"
              >
                <span className="w-16 text-xs text-muted-foreground">Wk {m.weeks.week_number}</span>
                <span className="flex-1 truncate">
                  {m.team_a?.name} <span className="text-muted-foreground">vs</span> {m.team_b?.name ?? "Bye"}
                </span>
                <span className="stat-num text-primary">
                  {formatPoints(Number(m.points_a))}–{formatPoints(Number(m.points_b))}
                </span>
              </Link>
            ))}
            {!(results ?? []).length && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No finalized matches yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
