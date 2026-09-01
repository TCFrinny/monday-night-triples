import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { EmptyState, PositionRoundBadge, TeamLink } from "@/components/league/ui";
import {
  activeSeasonQuery,
  seasonLineupGamesQuery,
  seasonMatchSummaryQuery,
  weeksQuery,
} from "@/lib/queries";
import { formatPoints } from "@/lib/league";
import { resolveGameSnapshot } from "@/lib/results";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";
import { sortMatchesByActualLane } from "@/lib/lane-slots";


export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: `Results — ${DEFAULT_LEAGUE_NAME}` },
      {
        name: "description",
        content:
          "Weekly duckpin results by lane pair with scratch and handicap totals, actual handicap used and the 7-point breakdown.",
      },
      { property: "og:title", content: `Results — ${DEFAULT_LEAGUE_NAME}` },
      {
        property: "og:description",
        content: "Weekly duckpin results with scratch and handicap totals and the 7-point breakdown.",
      },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: weeks } = useQuery(weeksQuery(season?.id));
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));
  const { data: lineupGames } = useQuery(seasonLineupGamesQuery(season?.id));

  const lineupsByMatch = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const l of (lineupGames as any[]) ?? []) {
      const arr = map.get(l.match_id) ?? [];
      arr.push(l);
      map.set(l.match_id, arr);
    }
    return map;
  }, [lineupGames]);

  const finalWeeks = useMemo(() => {
    const set = new Set<number>();
    for (const m of matches ?? []) if (m.status === "final") set.add(m.weeks.week_number);
    return [...set].sort((a, b) => b - a);
  }, [matches]);

  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const current = weekNumber ?? finalWeeks[0] ?? null;
  const week = (weeks ?? []).find((w: any) => w.week_number === current);
  const weekMatches = sortMatchesByActualLane(
    (matches ?? []).filter((m: any) => m.weeks.week_number === current && m.status === "final"),
  );


  if (!current) {
    return (
      <PageShell eyebrow="Weekly scores" title="Results">
        <EmptyState title="No finalized results yet" hint="Results publish as soon as an administrator finalizes a match." />
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow={season?.season_name ?? ""} title="Results" description="Completed weeks grouped by lane pair.">
      <div className="mb-5 flex items-center gap-3">
        <select
          value={current}
          onChange={(e) => setWeekNumber(Number(e.target.value))}
          className="rounded-md border border-border bg-card px-3 py-2 font-display text-sm uppercase text-foreground"
        >
          {finalWeeks.map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
        {week?.is_position_round && <PositionRoundBadge />}
      </div>

      <div className="space-y-4">
        {weekMatches.map((m: any) => (
          <ResultCard
            key={m.id}
            match={m}
            lineups={lineupsByMatch.get(m.id) ?? []}
            blindDeduction={season?.blind_deduction ?? 10}
          />
        ))}
      </div>
    </PageShell>
  );
}

function ResultCard({
  match,
  lineups,
  blindDeduction,
}: {
  match: any;
  lineups: any[];
  blindDeduction: number;
}) {
  const games = useMemo(
    () =>
      resolveGameSnapshot({
        gamePoints: match.game_points,
        lineups,
        teamAId: match.team_a_id ?? match.team_a?.id,
        teamBId: match.team_b_id ?? match.team_b?.id ?? null,
        handicapTeamId: match.handicap_team_id ?? null,
        handicapPins: Number(match.handicap_pins) || 0,
        blindDeduction,
      }),
    [match, lineups, blindDeduction],
  );
  const aWins = Number(match.points_a) > Number(match.points_b);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <span className="stat-num text-sm text-primary">Lanes {match.lane_pair ?? "—"}</span>
        <div className="flex items-center gap-3 text-base">
          <TeamLink team={match.team_a} />
          <span className={aWins ? "stat-num text-xl text-gold" : "stat-num text-xl text-foreground"}>
            {formatPoints(Number(match.points_a))}
          </span>
          <span className="text-muted-foreground">—</span>
          <span className={!aWins ? "stat-num text-xl text-gold" : "stat-num text-xl text-foreground"}>
            {formatPoints(Number(match.points_b))}
          </span>
          <TeamLink team={match.team_b} />
        </div>
        <Link
          to="/match/$matchId"
          params={{ matchId: match.id }}
          className="ml-auto font-display text-xs uppercase tracking-wide text-primary hover:underline"
        >
          Match detail
        </Link>
      </div>
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <div className="text-xs text-muted-foreground">
          Handicap used:{" "}
          <span className="text-gold">
            {match.handicap_pins > 0
              ? `${match.handicap_team_id === match.team_a?.id ? match.team_a?.name : match.team_b?.name} +${match.handicap_pins}/game`
              : "none"}
          </span>
          <span className="ml-3">
            Team averages {match.team_a_average} – {match.team_b_average}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-y border-border text-left font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-5 py-2">Team</th>
              <th className="px-3 py-2 text-right">G1</th>
              <th className="px-3 py-2 text-right">G2</th>
              <th className="px-3 py-2 text-right">G3</th>
              <th className="px-3 py-2 text-right">Set</th>
              <th className="px-5 py-2 text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {(["a", "b"] as const).map((side) => (
              <tr key={side} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-2">
                  <TeamLink team={side === "a" ? match.team_a : match.team_b} />
                </td>
                {[0, 1, 2].map((i) => (
                  <td key={i} className="px-3 py-2 text-right tabular-nums">
                    <span className="text-foreground">{games[i]?.[`${side}_hdcp`] ?? "—"}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({games[i]?.[`${side}_scratch`] ?? "—"})
                    </span>
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="text-foreground">
                    {side === "a" ? match.hdcp_total_a : match.hdcp_total_b}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({side === "a" ? match.scratch_total_a : match.scratch_total_b})
                  </span>
                </td>
                <td className="stat-num px-5 py-2 text-right">
                  {formatPoints(Number(side === "a" ? match.points_a : match.points_b))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-2 text-[11px] text-muted-foreground">
        Handicap totals shown first, scratch in parentheses. Points: 2 per game, 1 for the set.
      </p>
    </div>
  );
}
