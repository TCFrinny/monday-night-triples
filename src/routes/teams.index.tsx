import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/league/ui";
import { activeSeasonQuery, teamStandingRowsQuery, teamsQuery } from "@/lib/queries";
import { formatRecord, recordFromPoints, thirdForWeek } from "@/lib/league";
import { useProjections } from "@/hooks/use-projections";
import { seasonMatchSummaryQuery } from "@/lib/queries";

export const Route = createFileRoute("/teams/")({
  head: () => ({
    meta: [
      { title: "Teams — Monday Night Triples" },
      {
        name: "description",
        content:
          "Every triples team at AMF Dundalk with current-third and full-season rank, team average and the three active rostered bowlers.",
      },
      { property: "og:title", content: "Teams — Monday Night Triples" },
      {
        property: "og:description",
        content: "Team directory with rank, points, team average and active rosters.",
      },
    ],
  }),
  component: TeamsPage,
});

function TeamsPage() {
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: teams } = useQuery(teamsQuery(season?.id));
  const { data: standings } = useQuery(teamStandingRowsQuery(season?.id));
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));
  const { teamMap } = useProjections();

  const lastFinalWeek = (matches ?? [])
    .filter((m: any) => m.status === "final")
    .reduce((max: number, m: any) => Math.max(max, m.weeks.week_number), 0);
  const third = thirdForWeek(Math.max(1, lastFinalWeek || 1), season?.third_boundaries ?? [12, 24, 36]);
  const scope = `third_${third}`;

  const find = (teamId: string, s: string) =>
    (standings ?? []).find((r: any) => r.team_id === teamId && r.scope === s);

  if (!teams?.length) {
    return (
      <PageShell eyebrow="Rosters" title="Teams">
        <EmptyState title="No teams yet" hint="An administrator can add teams and assign three active bowlers each." />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={season?.season_name ?? ""}
      title="Teams"
      description="Three bowlers per team. Tap a team for roster history and full statistics."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t: any) => {
          const cur = find(t.id, scope);
          const full = find(t.id, "full");
          const proj = teamMap.get(t.id);
          return (
            <Link
              key={t.id}
              to="/teams/$slug"
              params={{ slug: t.slug }}
              className="panel p-5 transition-colors hover:border-primary/60"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-semibold uppercase text-foreground">{t.name}</h2>
                <span className={cur?.rank === 1 ? "stat-num text-2xl text-gold" : "stat-num text-2xl text-foreground"}>
                  #{cur?.rank ?? "—"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Third W-L</p>
                  <p className="stat-num text-base text-foreground">
                    {cur ? formatRecord(recordFromPoints(Number(cur.points), Number(cur.matches_played))) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Season #{full?.rank ?? "—"}</p>
                  <p className="stat-num text-base text-foreground">
                    {full ? formatRecord(recordFromPoints(Number(full.points), Number(full.matches_played))) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Team avg</p>
                  <p className="stat-num text-base text-primary">{proj?.average ?? "—"}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                {(proj?.bowlers ?? []).map((b) => (
                  <li key={b.id}>
                    {b.full_name}{" "}
                    <span className="text-xs text-primary">{Math.floor(b.applicable)}</span>
                  </li>
                ))}
              </ul>
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}
