import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/page-shell";
import { EmptyState, Stat, TeamLink } from "@/components/league/ui";
import {
  activeSeasonQuery,
  teamHistoryQuery,
  teamStandingRowsQuery,
  teamStatsQuery,
  teamsQuery,
} from "@/lib/queries";
import { formatPoints, formatRecord, recordFromPoints } from "@/lib/league";
import { pct } from "@/lib/duckpin";
import { useProjections } from "@/hooks/use-projections";

export const Route = createFileRoute("/teams/$slug")({
  head: () => ({
    meta: [
      { title: "Team Profile — Monday Night Triples" },
      {
        name: "description",
        content:
          "Roster, roster history, standings snapshots, team bowling statistics and week-by-week results for a Monday Night Triples team.",
      },
      { property: "og:title", content: "Team Profile — Monday Night Triples" },
      {
        property: "og:description",
        content: "Roster history, standings snapshots and team bowling statistics.",
      },
    ],
  }),
  component: TeamProfile,
});

function TeamProfile() {
  const { slug } = Route.useParams();
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: teams } = useQuery(teamsQuery(season?.id));
  const team = (teams ?? []).find((t: any) => t.slug === slug);
  const { data: standings } = useQuery(teamStandingRowsQuery(season?.id));
  const { data: fullStats } = useQuery(teamStatsQuery(season?.id, "full"));
  const { data: history } = useQuery(teamHistoryQuery(team?.id));
  const { teamMap } = useProjections();

  if (!teams) return <PageShell title="Team">Loading…</PageShell>;
  if (!team) {
    return (
      <PageShell title="Team">
        <EmptyState title="Team not found" />
      </PageShell>
    );
  }

  const stats = (fullStats ?? []).find((s: any) => s.team_id === team.id);
  const rows = (standings ?? []).filter((r: any) => r.team_id === team.id);
  const full = rows.find((r: any) => r.scope === "full");
  const proj = teamMap.get(team.id);
  const activeRoster = (team.roster_spots ?? [])
    .filter((r: any) => r.effective_to_week === null)
    .sort((a: any, b: any) => a.slot - b.slot);
  const pastRoster = (team.roster_spots ?? []).filter((r: any) => r.effective_to_week !== null);

  return (
    <PageShell eyebrow={season?.season_name ?? ""} title={team.name}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Full season rank" value={`#${full?.rank ?? "—"}`} gold={full?.rank === 1} />
        <Stat label="Points" value={full ? formatPoints(Number(full.points)) : "—"} />
        <Stat label="Team average" value={proj?.average ?? "—"} />
        <Stat
          label="Point %"
          value={stats?.points_possible ? `${pct(Number(stats.points), Number(stats.points_possible))}%` : "—"}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 font-display text-lg uppercase text-foreground">Active roster</h2>
          <ul className="space-y-2 text-sm">
            {(proj?.bowlers ?? []).map((b) => (
              <li key={b.id} className="flex items-center justify-between">
                <Link
                  to="/bowlers/$slug"
                  params={{ slug: b.slug }}
                  className="text-foreground hover:text-primary hover:underline"
                >
                  {b.full_name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {Math.floor(b.applicable)} · {b.source === "entry" ? "entry avg" : "current avg"} ·{" "}
                  {b.games} games
                </span>
              </li>
            ))}
            {!activeRoster.length && <li className="text-muted-foreground">No bowlers assigned.</li>}
          </ul>
          {pastRoster.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 font-display text-sm uppercase tracking-wide text-muted-foreground">
                Roster history
              </h3>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {pastRoster.map((r: any, i: number) => (
                  <li key={i}>
                    Slot {r.slot} · {r.bowlers?.full_name} · weeks {r.effective_from_week}–
                    {r.effective_to_week}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="mb-3 font-display text-lg uppercase text-foreground">Standings snapshots</h2>
          <table className="w-full text-sm">
            <tbody>
              {["third_1", "third_2", "third_3", "full"].map((s) => {
                const r = rows.find((x: any) => x.scope === s);
                return (
                  <tr key={s} className="border-b border-border/60 last:border-0">
                    <td className="py-2 font-display uppercase text-muted-foreground">
                      {s === "full" ? "Full Season" : `${s.slice(-1)} Third`}
                    </td>
                    <td className="py-2 text-right">#{r?.rank ?? "—"}</td>
                    <td className="py-2 text-right stat-num">
                      {r ? formatPoints(Number(r.points)) : "—"}
                    </td>
                    <td className="py-2 text-right text-muted-foreground tabular-nums">
                      {r?.hdcp_pinfall?.toLocaleString() ?? "—"} hdcp
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="mb-3 mt-10 font-display text-xl uppercase text-foreground">Team bowling stats</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Aggregated from every ball thrown for this team, including subs and excluding blinds.
      </p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Scratch avg" value={stats?.scratch_avg ?? "—"} />
        <Stat label="HDCP avg" value={stats?.hdcp_avg ?? "—"} />
        <Stat label="High scratch game" value={stats?.high_scratch_game || "—"} gold />
        <Stat label="High scratch set" value={stats?.high_scratch_set || "—"} gold />
        <Stat label="High HDCP set" value={stats?.high_hdcp_set || "—"} />
        <Stat label="Scratch pinfall" value={(stats?.scratch_pinfall ?? 0).toLocaleString()} />
        <Stat label="Strike %" value={`${pct(stats?.strikes ?? 0, stats?.frames ?? 0)}%`} />
        <Stat label="Spare %" value={`${pct(stats?.spares ?? 0, stats?.spare_attempts ?? 0)}%`} />
        <Stat label="10-box %" value={`${pct(stats?.ten_boxes ?? 0, stats?.frames ?? 0)}%`} />
        <Stat
          label="Mark %"
          value={`${pct((stats?.strikes ?? 0) + (stats?.spares ?? 0), stats?.frames ?? 0)}%`}
        />
        <Stat label="Open %" value={`${pct(stats?.opens ?? 0, stats?.frames ?? 0)}%`} />
        <Stat
          label="First-ball avg"
          value={
            stats?.first_ball_count
              ? (Number(stats.first_ball_pins) / Number(stats.first_ball_count)).toFixed(2)
              : "—"
          }
        />
        <Stat label="8+ first ball" value={`${pct(stats?.first_ball_eight_plus ?? 0, stats?.first_ball_count ?? 0)}%`} />
        <Stat label="9+ first ball" value={`${pct(stats?.first_ball_nine_plus ?? 0, stats?.first_ball_count ?? 0)}%`} />
        <Stat label="Split attempts" value={stats?.splits ?? 0} />
        <Stat label="Split conversions" value={stats?.split_conversions ?? 0} />
        <Stat
          label="Split conv %"
          value={`${pct(stats?.split_conversions ?? 0, stats?.splits ?? 0)}%`}
        />
        <Stat label="Points won" value={stats ? formatPoints(Number(stats.points)) : "—"} />
      </div>

      <h2 className="mb-3 mt-10 font-display text-xl uppercase text-foreground">Team history</h2>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-5 py-2">Week</th>
              <th className="px-3 py-2">Opponent</th>
              <th className="px-3 py-2">Lanes</th>
              <th className="px-3 py-2">HDCP</th>
              <th className="px-5 py-2 text-right">Result</th>
            </tr>
          </thead>
          <tbody>
            {(history ?? [])
              .sort((a: any, b: any) => a.weeks.week_number - b.weeks.week_number)
              .map((m: any) => {
                const isA = m.team_a?.id === team.id;
                const opp = isA ? m.team_b : m.team_a;
                const mine = isA ? m.points_a : m.points_b;
                const theirs = isA ? m.points_b : m.points_a;
                return (
                  <tr key={m.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-2">{m.weeks.week_number}</td>
                    <td className="px-3 py-2">
                      <TeamLink team={opp} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{m.lane_pair ?? "—"}</td>
                    <td className="px-3 py-2 text-gold">
                      {m.handicap_pins > 0
                        ? `${m.handicap_team_id === team.id ? "+" : "opp +"}${m.handicap_pins}`
                        : "none"}
                    </td>
                    <td className="px-5 py-2 text-right">
                      <Link
                        to="/match/$matchId"
                        params={{ matchId: m.id }}
                        className="stat-num text-primary hover:underline"
                      >
                        {formatPoints(Number(mine))} — {formatPoints(Number(theirs))}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            {!(history ?? []).length && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">
                  No finalized matches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Individual contributions and subs used are listed inside each match detail.
      </p>
    </PageShell>
  );
}
