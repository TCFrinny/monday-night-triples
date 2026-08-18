import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { BowlerLink, EmptyState, PositionRoundBadge, ScopeTabs } from "@/components/league/ui";
import {
  activeSeasonQuery,
  singlesConfigQuery,
  singlesMatchesQuery,
  singlesResultsQuery,
  singlesStandingsQuery,
} from "@/lib/queries";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";
import { formatDateOnly } from "@/lib/schedule-dates";
import { SINGLES_RULES, formatSinglesPoints, isSinglesPositionWeek } from "@/lib/singles";

export const Route = createFileRoute("/singles")({
  head: () => ({
    meta: [
      { title: `Singles — ${DEFAULT_LEAGUE_NAME}` },
      {
        name: "description",
        content: `Internal Singles competition for ${DEFAULT_LEAGUE_NAME}: head-to-head standings, weekly schedule and results scored from the league's Triples sheets.`,
      },
      { property: "og:title", content: `Singles — ${DEFAULT_LEAGUE_NAME}` },
      {
        property: "og:description",
        content: "Head-to-head Singles standings, schedule and results inside the duckpin triples league.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SinglesPage,
});

type Tab = "standings" | "schedule" | "results";

function SinglesPage() {
  const [tab, setTab] = useState<Tab>("standings");
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: config } = useQuery(singlesConfigQuery(season?.id));
  const { data: standings } = useQuery(singlesStandingsQuery(season?.id));
  const { data: matches } = useQuery(singlesMatchesQuery(season?.id));
  const { data: results } = useQuery(singlesResultsQuery(season?.id));

  const positionWeeks = config?.position_weeks ?? SINGLES_RULES.mandatoryPositionWeeks;

  if (!season) {
    return (
      <PageShell eyebrow="Secondary competition" title="Singles">
        <EmptyState title="No active season" hint="An administrator needs to activate a season first." />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={`${season.season_name} · Head to head`}
      title="Singles"
      description={`One-on-one competition riding on the Triples weeks. Three points a night — one per game, no set point. Handicap is ${SINGLES_RULES.handicapPercent}% of ${SINGLES_RULES.handicapBase} minus your own applicable average, rounded down.`}
    >
      <div className="mb-5">
        <ScopeTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "standings", label: "Standings" },
            { value: "schedule", label: "Schedule" },
            { value: "results", label: "Results" },
          ]}
        />
      </div>

      {config?.is_enabled === false && (
        <p className="mb-5 text-sm text-muted-foreground">
          Singles is currently switched off by the league secretary.
        </p>
      )}

      {tab === "standings" && <SinglesStandings rows={standings ?? []} />}
      {tab === "schedule" && <SinglesSchedule rows={matches ?? []} positionWeeks={positionWeeks} />}
      {tab === "results" && <SinglesResults rows={results ?? []} />}
    </PageShell>
  );
}

function SinglesStandings({ rows }: { rows: any[] }) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No Singles standings yet"
        hint="Standings build automatically once enrolled bowlers have finalized Triples scores."
      />
    );
  }
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="font-display text-lg uppercase tracking-wide text-foreground">Singles Standings</h2>
        <span className="eyebrow">3 points per match</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="w-14 px-5 py-2">Rank</th>
              <th className="px-3 py-2">Bowler</th>
              <th className="px-3 py-2 text-right">Points</th>
              <th className="px-3 py-2 text-right">Game W</th>
              <th className="px-3 py-2 text-right">L</th>
              <th className="px-3 py-2 text-right">T</th>
              <th className="px-3 py-2 text-right">Matches</th>
              <th className="px-5 py-2 text-right">Singles Pinfall</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                <td className="px-5 py-2.5">
                  <span className={r.rank === 1 ? "stat-num text-gold" : "stat-num text-foreground"}>{r.rank}</span>
                </td>
                <td className="px-3 py-2.5">
                  <BowlerLink bowler={r.bowlers} />
                </td>
                <td className="stat-num px-3 py-2.5 text-right text-base">{formatSinglesPoints(Number(r.points))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{Number(r.game_wins)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{Number(r.game_losses)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{Number(r.game_ties)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.matches_played}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{Number(r.pinfall).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        Tiebreaker (prototype): {SINGLES_RULES.tiebreaker}. Game W/L/T counts individual games inside
        the three-game match; a tied game splits the point 0.5 / 0.5. Singles pinfall is the handicap
        pinfall credited to the scheduled bowler, including nights a substitute bowled for them.
      </p>
    </div>
  );
}

function SinglesSchedule({ rows, positionWeeks }: { rows: any[]; positionWeeks: number[] }) {
  const weeks = useMemo(() => {
    const map = new Map<number, { week: any; matches: any[] }>();
    for (const m of rows) {
      const n = m.weeks?.week_number as number;
      if (!map.has(n)) map.set(n, { week: m.weeks, matches: [] });
      map.get(n)!.matches.push(m);
    }
    return [...map.values()].sort((a, b) => a.week.week_number - b.week.week_number);
  }, [rows]);

  if (!weeks.length) {
    return (
      <EmptyState
        title="Singles schedule not generated"
        hint="An administrator sets the 34 active league weeks and generates matchups in Admin → Singles."
      />
    );
  }

  return (
    <div className="space-y-5">
      {weeks.map(({ week, matches }) => (
        <div key={week.id} className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
            <h3 className="font-display text-lg uppercase tracking-wide text-foreground">
              League Week {week.week_number}
            </h3>
            <span className="text-sm text-muted-foreground">{formatDateOnly(week.bowl_date)}</span>
            {isSinglesPositionWeek(week.week_number, positionWeeks) && <PositionRoundBadge />}
          </div>
          <ul className="divide-y divide-border/60">
            {matches
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                  <BowlerLink bowler={m.a} />
                  {m.b ? (
                    <>
                      <span className="text-muted-foreground">vs</span>
                      <BowlerLink bowler={m.b} />
                    </>
                  ) : (
                    <span className="text-muted-foreground">— bye</span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Singles has no lane assignments — bowlers stay on their Triples pair. Position rounds are
        paired from the standings when the week arrives.
      </p>
    </div>
  );
}

function ScheduledName({ scheduled, actual, isSub, isBlind }: any) {
  return (
    <span>
      <BowlerLink bowler={scheduled} />
      {isSub && actual && (
        <span className="ml-1.5 text-xs text-primary">({actual.full_name} subbed)</span>
      )}
      {isBlind && <span className="ml-1.5 text-xs text-muted-foreground">(blind)</span>}
    </span>
  );
}

function SinglesResults({ rows }: { rows: any[] }) {
  const weeks = useMemo(() => {
    const map = new Map<number, { week: any; results: any[] }>();
    for (const r of rows) {
      const n = r.weeks?.week_number as number;
      if (!map.has(n)) map.set(n, { week: r.weeks, results: [] });
      map.get(n)!.results.push(r);
    }
    return [...map.values()].sort((a, b) => b.week.week_number - a.week.week_number);
  }, [rows]);

  if (!weeks.length) {
    return (
      <EmptyState
        title="No Singles results yet"
        hint="Results appear as soon as the Triples matches for a Singles week are finalized."
      />
    );
  }

  return (
    <div className="space-y-5">
      {weeks.map(({ week, results }) => (
        <div key={week.id} className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
            <h3 className="font-display text-lg uppercase tracking-wide text-foreground">
              League Week {week.week_number}
            </h3>
            <span className="text-sm text-muted-foreground">{formatDateOnly(week.bowl_date)}</span>
          </div>
          <div className="divide-y divide-border/60">
            {results.map((r) => (
              <div key={r.id} className="overflow-x-auto px-5 py-3">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="py-1.5">Bowler</th>
                      <th className="py-1.5 text-right">HDCP</th>
                      <th className="py-1.5 text-right">G1</th>
                      <th className="py-1.5 text-right">G2</th>
                      <th className="py-1.5 text-right">G3</th>
                      <th className="py-1.5 text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["a", "b"] as const).map((side) => (
                      <tr key={side}>
                        <td className="py-1.5">
                          <ScheduledName
                            scheduled={r[side]}
                            actual={r[`${side}_actual`]}
                            isSub={r[`${side}_is_sub`]}
                            isBlind={r[`${side}_is_blind`]}
                          />
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-gold">+{r[`${side}_handicap`]}</td>
                        {[0, 1, 2].map((i) => (
                          <td key={i} className="py-1.5 text-right tabular-nums">
                            <span className="stat-num">{r[`${side}_adjusted`]?.[i] ?? "—"}</span>
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({r[`${side}_scratch`]?.[i] ?? "—"})
                            </span>
                          </td>
                        ))}
                        <td className="stat-num py-1.5 text-right text-base">
                          {formatSinglesPoints(Number(r[`${side}_points`]))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Adjusted score shown first, scratch in parentheses. When a substitute bowled, the sub's own
        applicable average and handicap were used; the points and pinfall are credited to the
        scheduled Singles bowler.
      </p>
    </div>
  );
}
