import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { EmptyState, Linescore, ParticipationTag, Stat, framesFromRows } from "@/components/league/ui";
import { activeSeasonQuery, bowlerHistoryQuery, bowlerStatsQuery, bowlersQuery } from "@/lib/queries";
import { applicableAverage, formatAverage } from "@/lib/league";
import { pct } from "@/lib/duckpin";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";

export const Route = createFileRoute("/bowlers/$slug")({
  head: () => ({
    meta: [
      { title: `Bowler Profile — ${DEFAULT_LEAGUE_NAME}` },
      {
        name: "description",
        content:
          `Duckpin scoring, mark, first-ball and split statistics plus week-by-week linescores for a ${DEFAULT_LEAGUE_NAME} bowler.`,
      },
      { property: "og:title", content: `Bowler Profile — ${DEFAULT_LEAGUE_NAME}` },
      {
        property: "og:description",
        content: "Scoring, marks, first ball and split statistics with full linescores.",
      },
    ],
  }),
  component: BowlerProfile,
});

function BowlerProfile() {
  const { slug } = Route.useParams();
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: bowlers } = useQuery(bowlersQuery(season?.id));
  const bowler = (bowlers ?? []).find((b: any) => b.slug === slug);
  const { data: stats } = useQuery(bowlerStatsQuery(season?.id, "full"));
  const { data: history } = useQuery(bowlerHistoryQuery(bowler?.id));
  const [openId, setOpenId] = useState<string | null>(null);

  if (!bowlers) return <PageShell title="Bowler">Loading…</PageShell>;
  if (!bowler) {
    return (
      <PageShell title="Bowler">
        <EmptyState title="Bowler not found" />
      </PageShell>
    );
  }

  const s = (stats ?? []).find((x: any) => x.bowler_id === bowler.id);
  const games = s?.games ?? 0;
  const threshold = season?.establishment_threshold ?? 15;
  const next = applicableAverage({
    entryAverage: Number(bowler.entry_average),
    currentAverage: games && s ? Number(s.average) : null,
    gamesBefore: games,
    threshold,
  });
  const dist: Record<string, number> = (s?.first_ball_dist ?? {}) as Record<string, number>;

  return (
    <PageShell
      eyebrow={bowler.is_sub ? "Sub pool" : "Rostered bowler"}
      title={bowler.full_name}
      description={`${games >= threshold ? "Established" : "Entry average"} · ${games} games bowled`}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Entry average" value={formatAverage(bowler.entry_average)} />
        <Stat label="Current average" value={games && s ? formatAverage(s.average) : "—"} />
        <Stat label="Games" value={games} />
        <Stat
          label="Applicable next week"
          value={`${Math.floor(next.value)} (${next.source})`}
          gold={next.source === "current"}
        />
      </div>

      <h2 className="mb-3 mt-10 font-display text-xl uppercase text-foreground">Scoring</h2>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Sets" value={s?.sets ?? 0} />
        <Stat label="Total pinfall" value={(s?.pinfall ?? 0).toLocaleString()} />
        <Stat label="High game" value={s?.high_game || "—"} gold />
        <Stat label="Low game" value={s?.low_game || "—"} />
        <Stat label="High set" value={s?.high_set || "—"} gold />
        <Stat label="Low set" value={s?.low_set || "—"} />
      </div>

      <h2 className="mb-3 mt-10 font-display text-xl uppercase text-foreground">Marks</h2>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Strikes" value={s?.strikes ?? 0} />
        <Stat label="Strike %" value={`${pct(s?.strikes ?? 0, s?.frames ?? 0)}%`} />
        <Stat label="Spare attempts" value={s?.spare_attempts ?? 0} />
        <Stat label="Spares" value={s?.spares ?? 0} />
        <Stat label="Spare %" value={`${pct(s?.spares ?? 0, s?.spare_attempts ?? 0)}%`} />
        <Stat label="10-boxes" value={s?.ten_boxes ?? 0} />
        <Stat label="10-box %" value={`${pct(s?.ten_boxes ?? 0, s?.frames ?? 0)}%`} />
        <Stat label="Opens" value={s?.opens ?? 0} />
        <Stat label="Open %" value={`${pct(s?.opens ?? 0, s?.frames ?? 0)}%`} />
        <Stat label="Mark %" value={`${pct((s?.strikes ?? 0) + (s?.spares ?? 0), s?.frames ?? 0)}%`} />
        <Stat label="Clean frames" value={s?.clean_frames ?? 0} />
        <Stat label="Clean games" value={s?.clean_games ?? 0} />
        <Stat label="Longest strike streak" value={s?.longest_strike_streak ?? 0} gold />
        <Stat label="Longest mark streak" value={s?.longest_mark_streak ?? 0} gold />
      </div>

      <h2 className="mb-1 mt-10 font-display text-xl uppercase text-foreground">First ball</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        A spare can never be on ball 1 — ten pins on ball 1 is always a strike.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="First-ball average"
          value={s?.first_ball_count ? (Number(s.first_ball_pins) / Number(s.first_ball_count)).toFixed(2) : "—"}
        />
        <Stat label="Strike %" value={`${pct(s?.strikes ?? 0, s?.first_ball_count ?? 0)}%`} />
        <Stat label="9+ %" value={`${pct(s?.first_ball_nine_plus ?? 0, s?.first_ball_count ?? 0)}%`} />
        <Stat label="8+ %" value={`${pct(s?.first_ball_eight_plus ?? 0, s?.first_ball_count ?? 0)}%`} />
      </div>
      <div className="panel mt-4 p-4">
        <div className="grid grid-cols-11 gap-1 text-center">
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i}>
              <div className="stat-num text-base text-foreground">{dist[String(i)] ?? 0}</div>
              <div className={i === 10 ? "text-[10px] uppercase text-gold" : "text-[10px] text-muted-foreground"}>
                {i === 10 ? "Strike" : i}
              </div>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mb-3 mt-10 font-display text-xl uppercase text-foreground">Splits</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Splits left" value={s?.splits ?? 0} />
        <Stat label="Split frequency" value={`${pct(s?.splits ?? 0, s?.frames ?? 0)}%`} />
        <Stat label="Converted for spare" value={s?.split_conversions ?? 0} />
        <Stat label="Conversion %" value={`${pct(s?.split_conversions ?? 0, s?.splits ?? 0)}%`} gold />
        <Stat label="Cleared for 10-box" value={s?.split_ten_boxes ?? 0} />
        <Stat label="Ended open" value={s?.split_opens ?? 0} />
      </div>

      <h2 className="mb-3 mt-10 font-display text-xl uppercase text-foreground">History</h2>
      <div className="space-y-2">
        {(history ?? [])
          .sort((a: any, b: any) => a.matches.weeks.week_number - b.matches.weeks.week_number)
          .map((l: any) => {
            const gs = [...(l.bowler_games ?? [])].sort((a: any, b: any) => a.game_number - b.game_number);
            const set = gs.reduce((sum: number, g: any) => sum + g.scratch_score, 0);
            return (
              <div key={l.id} className="panel p-4">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === l.id ? null : l.id)}
                  className="flex w-full flex-wrap items-center gap-3 text-left"
                >
                  <span className="font-display uppercase text-foreground">
                    Week {l.matches.weeks.week_number}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {l.teams?.name}
                    <ParticipationTag type={l.participation} />
                  </span>
                  <span className="ml-auto stat-num text-base text-foreground">
                    {gs.map((g: any) => g.scratch_score).join(" · ")}{" "}
                    <span className="text-primary">= {set}</span>
                  </span>
                  <Link
                    to="/match/$matchId"
                    params={{ matchId: l.matches.id }}
                    className="text-xs text-primary hover:underline"
                  >
                    Match
                  </Link>
                </button>
                {openId === l.id && (
                  <div className="mt-3 space-y-3">
                    {gs.map((g: any) => (
                      <div key={g.game_number}>
                        <p className="mb-1 font-display text-xs uppercase text-muted-foreground">
                          Game {g.game_number}
                        </p>
                        <Linescore frames={framesFromRows(g.frames)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        {!(history ?? []).length && <EmptyState title="No finalized games yet" />}
      </div>
    </PageShell>
  );
}
