import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { EmptyState, MovementIndicator, ScopeTabs, TeamLink } from "@/components/league/ui";
import { activeSeasonQuery, standingsQuery, seasonMatchSummaryQuery } from "@/lib/queries";
import {
  SCOPE_LABELS,
  formatGamesBehind,
  formatRecordValue,
  gamesBehind,
  recordFromPoints,
  thirdForWeek,
  type StandingsScope,
} from "@/lib/league";

export const Route = createFileRoute("/standings")({
  head: () => ({
    meta: [
      { title: "Standings — Monday Night Triples" },
      {
        name: "description",
        content:
          "Team points and handicap pinfall standings by third and full season for the Monday Night Triples duckpin league at AMF Dundalk.",
      },
      { property: "og:title", content: "Standings — Monday Night Triples" },
      {
        property: "og:description",
        content: "Team points and handicap pinfall standings by third and full season.",
      },
    ],
  }),
  component: StandingsPage,
});

function StandingsTable({ rows, title, note }: { rows: any[]; title: string; note?: string }) {
  if (!rows.length) {
    return <EmptyState title={`No ${title.toLowerCase()} yet`} hint="Standings appear once matches are finalized." />;
  }
  const leaderRow = rows.find((r) => r.rank === 1) ?? rows[0];
  const leader = recordFromPoints(Number(leaderRow.points), Number(leaderRow.matches_played));
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="font-display text-lg uppercase tracking-wide text-foreground">{title}</h2>
        {note && <span className="eyebrow">{note}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="w-16 px-5 py-2">Rank</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2 text-right">W</th>
              <th className="px-3 py-2 text-right">L</th>
              <th className="px-3 py-2 text-right">GB</th>
              <th className="px-3 py-2 text-right">HDCP Pinfall</th>
              <th className="px-5 py-2 text-right">Scratch Pinfall</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rec = recordFromPoints(Number(r.points), Number(r.matches_played));
              return (
                <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                  <td className="px-5 py-2.5">
                    <span className={r.rank === 1 ? "stat-num text-gold" : "stat-num text-foreground"}>
                      {r.rank}
                    </span>
                    <span className="ml-2 text-xs">
                      <MovementIndicator rank={r.rank} previous={r.previous_rank} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <TeamLink team={r.teams} />
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right text-base">{formatRecordValue(rec.wins)}</td>
                  <td className="stat-num px-3 py-2.5 text-right text-base text-muted-foreground">
                    {formatRecordValue(rec.losses)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.rank === 1 ? "—" : formatGamesBehind(gamesBehind(leader, rec))}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.hdcp_pinfall.toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.scratch_pinfall.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function StandingsPage() {
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));

  const lastFinalWeek = (matches ?? [])
    .filter((m: any) => m.status === "final")
    .reduce((max: number, m: any) => Math.max(max, m.weeks.week_number), 0);
  const currentThird = thirdForWeek(Math.max(1, lastFinalWeek || 1), season?.third_boundaries ?? [12, 24, 36]);
  const [scope, setScope] = useState<StandingsScope>(`third_${currentThird}` as StandingsScope);

  const { data: scoped } = useQuery(standingsQuery(season?.id, scope));
  const { data: full } = useQuery(standingsQuery(season?.id, "full"));

  const boundaries = season?.third_boundaries ?? [12, 24, 36];
  const thirdComplete = (t: number) => lastFinalWeek >= (boundaries[t - 1] ?? 99);

  if (!season) {
    return (
      <PageShell eyebrow="League table" title="Standings">
        <EmptyState title="No active season" hint="An administrator needs to create and activate a season." />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={`${season.season_name} · ${season.center_name}`}
      title="Standings"
      description="Ranked by wins, with handicap pinfall as the tiebreaker. W-L comes from the seven points a night."
    >
      <div className="mb-5">
        <ScopeTabs
          value={scope}
          onChange={setScope}
          options={[1, 2, 3].map((t) => ({
            value: `third_${t}` as StandingsScope,
            label: SCOPE_LABELS[`third_${t}` as StandingsScope],
            ...(thirdComplete(t) ? { note: "Final" } : {}),
          }))}
        />
      </div>

      <StandingsTable
        rows={scoped ?? []}
        title={SCOPE_LABELS[scope]}
        {...(thirdComplete(Number(scope.slice(-1))) ? { note: "Final" } : { note: "Active" })}
      />

      <div className="mt-10">
        <StandingsTable rows={full ?? []} title="Full Season" note="Never resets" />
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Thirds run weeks 1–{boundaries[0]}, {(boundaries[0] ?? 12) + 1}–{boundaries[1]}, and{" "}
        {(boundaries[1] ?? 24) + 1}–{boundaries[2]}. Active-third standings reset after each third;
        historical results are never erased.{" "}
        <Link to="/schedule" className="text-primary underline-offset-4 hover:underline">
          View the schedule
        </Link>
        .
      </p>
    </PageShell>
  );
}
