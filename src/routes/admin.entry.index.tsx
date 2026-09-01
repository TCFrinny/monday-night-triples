import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { activeSeasonQuery, seasonMatchSummaryQuery, weeksQuery } from "@/lib/queries";
import { sortMatchesByActualLane } from "@/lib/lane-slots";
import { EmptyState } from "@/components/league/ui";

export const Route = createFileRoute("/admin/entry/")({
  component: EntryIndex,
});

function EntryIndex() {
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: weeks } = useQuery(weeksQuery(season?.id));
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));
  const [weekId, setWeekId] = useState("");

  const selected = weekId || (weeks ?? [])[0]?.id || "";
  const rows = sortMatchesByActualLane(
    (matches ?? []).filter((m: any) => m.weeks.id === selected),
  );


  if (!season) return <p className="text-sm text-muted-foreground">Create a season first.</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selected}
          onChange={(e) => setWeekId(e.target.value)}
          className="rounded-md border border-border bg-card px-2 py-2 text-sm"
        >
          {(weeks ?? []).map((w: any) => (
            <option key={w.id} value={w.id}>
              Week {w.week_number} — {w.bowl_date}
            </option>
          ))}
        </select>
      </div>

      {!rows.length ? (
        <EmptyState title="No matchups for this week" hint="Add matchups on the Schedule tab." />
      ) : (
        <ul className="panel divide-y divide-border/60">
          {rows.map((m: any) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="w-16 text-xs text-muted-foreground">{m.lane_pair ?? "—"}</span>
              <span className="flex-1">
                {m.team_a?.name} vs {m.is_bye ? "Bye" : m.team_b?.name}
              </span>
              <span className="text-xs uppercase text-muted-foreground">{m.status}</span>
              {!m.is_bye && (
                <Link
                  to="/admin/entry/$matchId"
                  params={{ matchId: m.id }}
                  className="rounded-md border border-primary/60 px-3 py-1 font-display text-xs uppercase tracking-[0.12em] text-primary"
                >
                  {m.status === "final" ? "Review" : "Enter scores"}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
