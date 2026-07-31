import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { EmptyState, ScopeTabs } from "@/components/league/ui";
import { activeSeasonQuery, bowlerStatsQuery, bowlersQuery } from "@/lib/queries";
import { formatAverage } from "@/lib/league";

export const Route = createFileRoute("/bowlers/")({
  head: () => ({
    meta: [
      { title: "Bowlers — Monday Night Triples" },
      {
        name: "description",
        content:
          "Searchable directory of rostered bowlers and the sub pool with current averages, games, high game and high set.",
      },
      { property: "og:title", content: "Bowlers — Monday Night Triples" },
      {
        property: "og:description",
        content: "Rostered bowlers and sub pool with averages, games, high game and high set.",
      },
    ],
  }),
  component: BowlersPage,
});

function BowlersPage() {
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: bowlers } = useQuery(bowlersQuery(season?.id));
  const { data: stats } = useQuery(bowlerStatsQuery(season?.id, "full"));
  const [tab, setTab] = useState<"rostered" | "subs">("rostered");
  const [q, setQ] = useState("");

  const statBy = new Map<string, any>();
  for (const s of stats ?? []) statBy.set(s.bowler_id, s);

  const rows = (bowlers ?? [])
    .filter((b: any) => (tab === "subs" ? b.is_sub : !b.is_sub))
    .filter((b: any) => b.full_name.toLowerCase().includes(q.toLowerCase()));

  if (!bowlers?.length) {
    return (
      <PageShell eyebrow="Individuals" title="Bowlers">
        <EmptyState title="No bowlers yet" hint="An administrator can add rostered bowlers and the sub pool." />
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow={season?.season_name ?? ""} title="Bowlers" description="Averages are calculated from official finalized results.">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ScopeTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "rostered", label: "Rostered Bowlers" },
            { value: "subs", label: "Subs" },
          ]}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search bowlers…"
          maxLength={80}
          className="ml-auto w-full max-w-xs rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-5 py-2">Name</th>
              <th className="px-3 py-2">{tab === "subs" ? "Pool" : "Team"}</th>
              <th className="px-3 py-2 text-right">Current Avg</th>
              <th className="px-3 py-2 text-right">Games</th>
              <th className="px-3 py-2 text-right">High Game</th>
              <th className="px-5 py-2 text-right">High Set</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b: any) => {
              const s = statBy.get(b.id);
              const team = (b.roster_spots ?? []).find((r: any) => r.effective_to_week === null)?.teams;
              return (
                <tr key={b.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                  <td className="px-5 py-2.5">
                    <Link
                      to="/bowlers/$slug"
                      params={{ slug: b.slug }}
                      className="text-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      {b.full_name}
                    </Link>
                    {!b.is_active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {b.is_sub ? "Sub Pool" : (team?.name ?? "—")}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-primary">
                    {s?.games ? formatAverage(s.average) : `${formatAverage(b.entry_average)} (entry)`}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s?.games ?? 0}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s?.high_game || "—"}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{s?.high_set || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
