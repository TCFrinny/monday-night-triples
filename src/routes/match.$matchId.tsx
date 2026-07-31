import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { PageShell } from "@/components/page-shell";
import {
  BowlerLink,
  EmptyState,
  Linescore,
  ParticipationTag,
  PositionRoundBadge,
  TeamLink,
  framesFromRows,
} from "@/components/league/ui";
import { activeSeasonQuery, matchDetailQuery } from "@/lib/queries";
import { formatPoints } from "@/lib/league";
import { resolveGameSnapshot } from "@/lib/results";

export const Route = createFileRoute("/match/$matchId")({
  head: () => ({
    meta: [
      { title: "Match Detail — Monday Night Triples" },
      {
        name: "description",
        content:
          "Full duckpin linescores for both teams, handicap used, game and set points for a Monday Night Triples match.",
      },
      { property: "og:title", content: "Match Detail — Monday Night Triples" },
      {
        property: "og:description",
        content: "Full duckpin linescores, handicap used, game and set points.",
      },
    ],
  }),
  component: MatchDetail,
  errorComponent: ({ error }) => (
    <PageShell title="Match unavailable">
      <EmptyState title="Could not load this match" hint={error.message} />
    </PageShell>
  ),
  notFoundComponent: () => (
    <PageShell title="Match not found">
      <EmptyState title="No such match" />
    </PageShell>
  ),
});

function MatchDetail() {
  const { matchId } = Route.useParams();
  const { data, isLoading } = useQuery(matchDetailQuery(matchId));
  const { data: season } = useQuery(activeSeasonQuery);

  const m = data?.match;
  const blindDeduction = Number(season?.blind_deduction) || 0;

  const games = useMemo(
    () =>
      m
        ? resolveGameSnapshot({
            gamePoints: m.game_points,
            lineups: data?.lineups ?? [],
            teamAId: m.team_a_id ?? m.team_a?.id,
            teamBId: m.team_b_id ?? m.team_b?.id ?? null,
            handicapTeamId: m.handicap_team_id ?? null,
            handicapPins: Number(m.handicap_pins) || 0,
            blindDeduction,
          })
        : [],
    [m, data?.lineups, blindDeduction],
  );

  if (isLoading) {
    return <PageShell title="Match">Loading…</PageShell>;
  }
  if (!m) {
    return (
      <PageShell title="Match">
        <EmptyState title="Match not found" />
      </PageShell>
    );
  }

  const sum = (fn: (g: (typeof games)[number]) => number) => games.reduce((s, g) => s + fn(g), 0);
  const totals = {
    a: {
      hdcp: sum((g) => g.a_hdcp),
      scratch: sum((g) => g.a_scratch),
      gamePts: sum((g) => g.a),
      points: Number(m.points_a) || 0,
    },
    b: {
      hdcp: sum((g) => g.b_hdcp),
      scratch: sum((g) => g.b_scratch),
      gamePts: sum((g) => g.b),
      points: Number(m.points_b) || 0,
    },
  } as const;


  return (
    <PageShell
      eyebrow={`Week ${m.weeks?.week_number} · Lanes ${m.lane_pair ?? "—"}`}
      title={`${m.team_a?.name ?? "Team A"} vs ${m.team_b?.name ?? "BYE"}`}
    >
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <span className="stat-num text-3xl text-gold">
          {formatPoints(Number(m.points_a))} — {formatPoints(Number(m.points_b))}
        </span>
        <span className="text-sm text-muted-foreground">
          Team averages {m.team_a_average} – {m.team_b_average} · Handicap{" "}
          {m.handicap_pins > 0
            ? `${m.handicap_team_id === m.team_a?.id ? m.team_a?.name : m.team_b?.name} +${m.handicap_pins}/game`
            : "none"}
        </span>
        {m.weeks?.is_position_round && <PositionRoundBadge />}
        <span className="font-display text-xs uppercase tracking-wide text-muted-foreground">
          {m.status === "final" ? "Final" : m.status === "in_progress" ? "In progress" : "Scheduled"}
        </span>
      </div>

      <div className="panel mb-8 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
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
                  <TeamLink team={side === "a" ? m.team_a : m.team_b} />
                </td>
                {[0, 1, 2].map((i) => (
                  <td key={i} className="px-3 py-2 text-right tabular-nums">
                    {games[i]?.[`${side}_hdcp`] ?? "—"}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({games[i]?.[`${side}_scratch`] ?? "—"})
                    </span>
                    <span className="ml-2 text-xs text-primary">
                      +{games[i]?.[`${side}_points`] ?? 0}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">
                  {side === "a" ? m.hdcp_total_a : m.hdcp_total_b}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({side === "a" ? m.scratch_total_a : m.scratch_total_b})
                  </span>
                </td>
                <td className="stat-num px-5 py-2 text-right">
                  {formatPoints(Number(side === "a" ? m.points_a : m.points_b))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {[m.team_a, m.team_b].filter(Boolean).map((team: any) => (
        <div key={team.id} className="mb-8">
          <h2 className="mb-3 font-display text-xl uppercase text-foreground">{team.name}</h2>
          <div className="space-y-4">
            {data.lineups
              .filter((l: any) => l.team_id === team.id)
              .map((l: any) => (
                <div key={l.id} className="panel p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="font-display text-base uppercase text-foreground">
                      {l.participation === "blind" ? (
                        <>Blind ({l.absent?.full_name ?? "vacant"})</>
                      ) : (
                        <BowlerLink bowler={l.bowler} />
                      )}
                    </span>
                    <ParticipationTag type={l.participation} />
                    <span className="ml-auto text-xs text-muted-foreground">
                      Applicable avg {l.applicable_average_truncated} ({l.average_source})
                    </span>
                  </div>
                  {l.participation === "blind" ? (
                    <p className="text-sm text-muted-foreground">
                      Blind scores:{" "}
                      {(l.bowler_games ?? [])
                        .sort((a: any, b: any) => a.game_number - b.game_number)
                        .map((g: any) => g.scratch_score)
                        .join(" · ")}{" "}
                      — counted in the team score only, never in individual statistics.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {(l.bowler_games ?? [])
                        .sort((a: any, b: any) => a.game_number - b.game_number)
                        .map((g: any) => (
                          <div key={g.id}>
                            <p className="mb-1 font-display text-xs uppercase tracking-wide text-muted-foreground">
                              Game {g.game_number} · {g.scratch_score}
                            </p>
                            <Linescore frames={framesFromRows(g.frames)} />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </PageShell>
  );
}
