import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState, ScopeTabs } from "@/components/league/ui";
import { laneStatsQuery } from "@/lib/queries";
import { SCOPE_LABELS, type StandingsScope } from "@/lib/league";
import { defaultWeek, weeklyScope } from "@/lib/leaderboards";
import {
  formatPoa,
  laneOpenPct,
  laneSparePct,
  laneStrikePct,
  laneTenBoxPct,
  sortLaneRows,
  type LaneRow,
} from "@/lib/lane-data";

/** Public Lane Data table: one row per lane pair for the selected scope. */
export function LaneData({
  seasonId,
  weeks,
}: {
  seasonId: string | undefined;
  weeks: number[];
}) {
  const [view, setView] = useState<"season" | "weekly">("season");
  const [scope, setScope] = useState<StandingsScope>("full");
  const [week, setWeek] = useState<number | null>(null);

  const selectedWeek = week !== null && weeks.includes(week) ? week : defaultWeek(weeks);
  const weekly = view === "weekly";
  const activeScope = weekly ? (selectedWeek ? weeklyScope(selectedWeek) : "__none__") : scope;

  const { data } = useQuery(laneStatsQuery(seasonId, activeScope));
  const rows = sortLaneRows(((data as LaneRow[] | undefined) ?? []) as LaneRow[]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-3">
        <ScopeTabs
          value={view}
          onChange={setView}
          options={[
            { value: "season", label: "Season / Third" },
            { value: "weekly", label: "Weekly" },
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

      <p className="mb-4 text-xs text-muted-foreground">
        Lane figures cover finalized, non-bye matches only. Blind scores are excluded; substitutes
        are included because this measures the lanes, not individual eligibility. POA compares each
        game to the bowler&apos;s applicable average recorded for that match.
      </p>

      {!rows.length ? (
        <EmptyState
          title="No lane data for this scope"
          hint="Lane performance appears once matches are finalized."
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {rows.map((r) => (
              <div key={r.lane_pair} className="panel p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-lg uppercase text-foreground">
                    Lanes {r.lane_pair}
                  </h3>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {r.games} games · {r.frames} frames
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Cell label="Pair Average" value={Number(r.average).toFixed(2)} highlight />
                  <Cell label="Pair POA" value={formatPoa(r.poa)} highlight />
                  <Cell label="Strike %" value={`${laneStrikePct(r)}%`} highlight />
                  <Cell label="First Ball" value={Number(r.first_ball_avg).toFixed(2)} highlight />
                  <Cell label="Spare %" value={`${laneSparePct(r)}%`} />
                  <Cell label="Open %" value={`${laneOpenPct(r)}%`} />
                  <Cell label="10-Box %" value={`${laneTenBoxPct(r)}%`} />
                  <Cell label="Pins Lost / G" value={Number(r.pins_lost_per_game).toFixed(2)} />
                  <Cell label="High Game" value={String(r.high_scratch_game)} />
                  <Cell label="First Balls" value={String(r.first_ball_count)} />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left font-display text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-3 py-2">Lanes</th>
                  <th className="px-3 py-2 text-right">Pair Avg</th>
                  <th className="px-3 py-2 text-right">POA</th>
                  <th className="px-3 py-2 text-right">Strike %</th>
                  <th className="px-3 py-2 text-right">1st Ball Avg</th>
                  <th className="px-3 py-2 text-right">Spare %</th>
                  <th className="px-3 py-2 text-right">Open %</th>
                  <th className="px-3 py-2 text-right">10-Box %</th>
                  <th className="px-3 py-2 text-right">Pins Lost / G</th>
                  <th className="px-3 py-2 text-right">High Game</th>
                  <th className="px-3 py-2 text-right">Games</th>
                  <th className="px-3 py-2 text-right">Frames</th>
                  <th className="px-3 py-2 text-right">1st Balls</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lane_pair} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-display uppercase text-foreground">
                      {r.lane_pair}
                    </td>
                    <td className="stat-num px-3 py-2 text-right text-primary">
                      {Number(r.average).toFixed(2)}
                    </td>
                    <td className="stat-num px-3 py-2 text-right text-gold">{formatPoa(r.poa)}</td>
                    <td className="stat-num px-3 py-2 text-right text-primary">
                      {laneStrikePct(r)}%
                    </td>
                    <td className="stat-num px-3 py-2 text-right text-primary">
                      {Number(r.first_ball_avg).toFixed(2)}
                    </td>
                    <td className="stat-num px-3 py-2 text-right text-foreground">
                      {laneSparePct(r)}%
                    </td>
                    <td className="stat-num px-3 py-2 text-right text-foreground">
                      {laneOpenPct(r)}%
                    </td>
                    <td className="stat-num px-3 py-2 text-right text-foreground">
                      {laneTenBoxPct(r)}%
                    </td>
                    <td className="stat-num px-3 py-2 text-right text-foreground">
                      {Number(r.pins_lost_per_game).toFixed(2)}
                    </td>
                    <td className="stat-num px-3 py-2 text-right text-foreground">
                      {r.high_scratch_game}
                    </td>
                    <td className="stat-num px-3 py-2 text-right text-muted-foreground">
                      {r.games}
                    </td>
                    <td className="stat-num px-3 py-2 text-right text-muted-foreground">
                      {r.frames}
                    </td>
                    <td className="stat-num px-3 py-2 text-right text-muted-foreground">
                      {r.first_ball_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Cell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={`stat-num mt-0.5 text-base ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
