import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  activeSeasonQuery,
  bowlerStatsQuery,
  bowlersQuery,
  matchDetailQuery,
  rosterSpotsQuery,
} from "@/lib/queries";
import { framesFromRows } from "@/components/league/ui";
import { BallGrid } from "@/components/league/ball-grid";
import { rosterForWeek } from "@/lib/roster";
import {
  applicableAverage,
  blindScore,
  computeMatchPoints,
  formatPoints,
  teamAverage,
  teamHandicap,
  truncateAverage,
} from "@/lib/league";
import { emptyGame, scoreGame, type Frame } from "@/lib/duckpin";
import { finalizeMatch, saveBowlerGame, unfinalizeMatch } from "@/lib/admin";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/entry/$matchId")({
  component: ScoreEntry,
});

type Participation = "rostered" | "sub" | "blind";

const sheetKey = (lineupId: string, game: number) => `${lineupId}:${game}`;

function ScoreEntry() {
  const { matchId } = Route.useParams();
  const qc = useQueryClient();
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: detail } = useQuery(matchDetailQuery(matchId));
  const { data: bowlers } = useQuery(bowlersQuery(season?.id));
  const { data: stats } = useQuery(bowlerStatsQuery(season?.id, "full"));
  const { data: spots } = useQuery(rosterSpotsQuery(season?.id));
  const [game, setGame] = useState(1);
  const [sheets, setSheets] = useState<Record<string, Frame[]>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const seeded = useRef(false);

  const invalidate = () => qc.invalidateQueries();

  /** Applicable average for a bowler, from entry average + established current. */
  const appFor = useMemo(
    () => (bowlerId: string | null | undefined) => {
      const b = (bowlers ?? []).find((x: any) => x.id === bowlerId);
      const s = (stats ?? []).find((x: any) => x.bowler_id === bowlerId);
      const games = s?.games ?? 0;
      if (!b) return { value: 0, source: "entry" as const, games: 0 };
      const app = applicableAverage({
        entryAverage: Number(b.entry_average),
        currentAverage: games && s ? Number(s.average) : null,
        gamesBefore: games,
        threshold: season?.establishment_threshold ?? 15,
      });
      return { ...app, games };
    },
    [bowlers, stats, season?.establishment_threshold],
  );

  const week = detail?.match?.weeks?.week_number ?? 1;

  /** Auto-create the lineup snapshot from the roster effective for this week. */
  const seed = useMutation({
    mutationFn: async (rows: any[]) => {
      const { error } = await supabase.from("match_lineups").insert(rows);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!detail || !season || !spots || seeded.current) return;
    if (detail.match.status === "final") return;
    const teamIds = [detail.match.team_a_id, detail.match.team_b_id].filter(Boolean) as string[];
    const rows: any[] = [];
    for (const teamId of teamIds) {
      const roster = rosterForWeek(spots as any, teamId, week);
      for (let i = 0; i < 3; i++) {
        const slot = i + 1;
        const already = (detail.lineups ?? []).find(
          (l: any) => l.team_id === teamId && l.slot === slot,
        );
        if (already) continue;
        const spot = roster[i];
        if (!spot) continue;
        const app = appFor(spot.bowler_id);
        rows.push({
          match_id: matchId,
          team_id: teamId,
          slot,
          bowler_id: spot.bowler_id,
          participation: "rostered",
          applicable_average: app.value,
          applicable_average_truncated: truncateAverage(app.value),
          average_source: app.source,
          games_before: app.games,
        });
      }
    }
    if (rows.length) {
      seeded.current = true;
      seed.mutate(rows);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, season, spots, week]);

  /** Hydrate local ball sheets from stored frames. */
  useEffect(() => {
    if (!detail) return;
    setSheets((prev) => {
      const next = { ...prev };
      for (const l of detail.lineups ?? []) {
        for (const g of [1, 2, 3]) {
          const k = sheetKey(l.id, g);
          if (next[k]) continue;
          const stored = (l.bowler_games ?? []).find((x: any) => x.game_number === g);
          next[k] = stored?.frames?.length ? framesFromRows(stored.frames) : emptyGame();
        }
      }
      return next;
    });
  }, [detail]);

  const setLineup = useMutation({
    mutationFn: async ({
      lineup,
      patch,
    }: {
      lineup: any;
      patch: { participation?: Participation; bowlerId?: string | null; absentId?: string | null };
    }) => {
      const participation = patch.participation ?? (lineup.participation as Participation);
      const bowlerId =
        patch.bowlerId !== undefined ? patch.bowlerId : (lineup.bowler_id as string | null);
      const absentId =
        patch.absentId !== undefined ? patch.absentId : (lineup.absent_bowler_id as string | null);
      // Blind uses the ABSENT rostered bowler's own applicable average.
      const avgOf = participation === "blind" ? absentId : bowlerId;
      const app = appFor(avgOf);
      const { error } = await supabase
        .from("match_lineups")
        .update({
          participation,
          bowler_id: participation === "blind" ? null : bowlerId,
          absent_bowler_id: absentId,
          applicable_average: app.value,
          applicable_average_truncated: truncateAverage(app.value),
          average_source: app.source,
          games_before: app.games,
        })
        .eq("id", lineup.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  /** Debounced autosave of a bowler game sheet. */
  const autosave = (lineupId: string, gameNumber: number, frames: Frame[]) => {
    const k = sheetKey(lineupId, gameNumber);
    if (timers.current[k]) clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(async () => {
      try {
        await saveBowlerGame({ lineupId, gameNumber, frames, isBlind: false });
        if (detail?.match.status === "scheduled") {
          await supabase.from("matches").update({ status: "in_progress" }).eq("id", matchId);
        }
        qc.invalidateQueries({ queryKey: ["match", matchId] });
      } catch (e) {
        toast.error((e as Error).message);
      }
    }, 700);
  };

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  if (!detail || !season) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const teams = [
    { id: detail.match.team_a_id as string, name: detail.match.team_a?.name as string, side: "a" as const },
    { id: detail.match.team_b_id as string, name: detail.match.team_b?.name as string, side: "b" as const },
  ];
  const lineupsOf = (teamId: string) =>
    [1, 2, 3].map((slot) =>
      (detail.lineups ?? []).find((l: any) => l.team_id === teamId && l.slot === slot),
    );

  const scratchOf = (lineup: any, g: number) => {
    if (!lineup) return 0;
    if (lineup.participation === "blind")
      return blindScore(Number(lineup.applicable_average), season.blind_deduction);
    const frames = sheets[sheetKey(lineup.id, g)];
    return frames ? scoreGame(frames).total : 0;
  };

  const teamAvg = (teamId: string) =>
    teamAverage(lineupsOf(teamId).map((l) => Number(l?.applicable_average ?? 0)));
  const hcp = teamHandicap(teamAvg(teams[0]!.id), teamAvg(teams[1]!.id), season.handicap_percent);
  const scratchTeam = (teamId: string, g: number) =>
    lineupsOf(teamId).reduce((sum, l) => sum + scratchOf(l, g), 0);
  const hdcpTeam = (side: "a" | "b", teamId: string, g: number) =>
    scratchTeam(teamId, g) + (hcp.receivingSide === side ? hcp.pins : 0);

  const hdcpA = [1, 2, 3].map((g) => hdcpTeam("a", teams[0]!.id, g));
  const hdcpB = [1, 2, 3].map((g) => hdcpTeam("b", teams[1]!.id, g));
  const points = computeMatchPoints(hdcpA, hdcpB);

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-center gap-4 p-4 text-sm">
        <Link to="/admin/entry" className="text-primary hover:underline">
          ← Week list
        </Link>
        <span className="font-display uppercase text-foreground">
          Week {detail.match.weeks.week_number}: {teams[0]!.name} vs {teams[1]!.name}
        </span>
        <span className="text-muted-foreground">
          Team averages {teamAvg(teams[0]!.id)} / {teamAvg(teams[1]!.id)} · HDCP{" "}
          <span className="text-gold">
            {hcp.pins} pins per game to{" "}
            {hcp.receivingSide === "a"
              ? teams[0]!.name
              : hcp.receivingSide === "b"
                ? teams[1]!.name
                : "nobody"}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="font-display text-xs uppercase text-muted-foreground">
            {detail.match.status === "final" ? "Final" : "In progress · autosaving"}
          </span>
          {detail.match.status === "final" ? (
            <>
              <span className="stat-num text-primary">
                {formatPoints(Number(detail.match.points_a))}–
                {formatPoints(Number(detail.match.points_b))}
              </span>
              <Button variant="outline" size="sm" onClick={() => reopenNow()}>
                Reopen
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => finalizeNow()}>
              Finalize match
            </Button>
          )}
        </span>
      </div>

      {/* Live match summary */}
      <div className="panel overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-4 py-2">Bowler</th>
              <th className="px-3 py-2 text-right">G1</th>
              <th className="px-3 py-2 text-right">G2</th>
              <th className="px-3 py-2 text-right">G3</th>
              <th className="px-4 py-2 text-right">Set</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team, ti) => {
              const rows = lineupsOf(team.id);
              const hd = ti === 0 ? hdcpA : hdcpB;
              return (
                <tbody key={team.id} className="contents">
                  {rows.map((l, i) => (
                    <tr key={l?.id ?? `${team.id}-${i}`} className="border-b border-border/50">
                      <td className="px-4 py-1.5">
                        <span className="text-muted-foreground">{team.name}</span>{" "}
                        {l?.participation === "blind"
                          ? `Blind (${l?.absent?.full_name ?? "vacant"})`
                          : (l?.bowler?.full_name ?? "—")}
                      </td>
                      {[1, 2, 3].map((g) => (
                        <td key={g} className="px-3 py-1.5 text-right tabular-nums">
                          {scratchOf(l, g)}
                        </td>
                      ))}
                      <td className="stat-num px-4 py-1.5 text-right">
                        {[1, 2, 3].reduce((s, g) => s + scratchOf(l, g), 0)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b-2 border-border bg-secondary/30 font-display uppercase">
                    <td className="px-4 py-1.5">{team.name} scratch / hdcp</td>
                    {[1, 2, 3].map((g, gi) => (
                      <td key={g} className="px-3 py-1.5 text-right tabular-nums">
                        {scratchTeam(team.id, g)}
                        <span className="ml-1 text-gold">{hd[gi]}</span>
                        <span className="ml-2 text-primary">
                          +{ti === 0 ? points.gamePoints[gi]!.a : points.gamePoints[gi]!.b}
                        </span>
                      </td>
                    ))}
                    <td className="stat-num px-4 py-1.5 text-right text-gold">
                      {hd.reduce((x, y) => x + y, 0)}
                      <span className="ml-2 text-primary">
                        +{ti === 0 ? points.setPointA : points.setPointB}
                      </span>
                    </td>
                  </tr>
                </tbody>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-border px-4 py-2 font-display text-sm uppercase text-foreground">
          Running points:{" "}
          <span className="text-gold">
            {formatPoints(points.totalA)} — {formatPoints(points.totalB)}
          </span>
        </div>
      </div>

      {/* Game tabs */}
      <div className="inline-flex gap-1 rounded-lg border border-border bg-secondary/40 p-1">
        {[1, 2, 3].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGame(g)}
            className={
              g === game
                ? "rounded-md bg-primary px-4 py-1.5 font-display text-sm uppercase text-primary-foreground"
                : "rounded-md px-4 py-1.5 font-display text-sm uppercase text-muted-foreground hover:text-foreground"
            }
          >
            Game {g}
          </button>
        ))}
      </div>

      {teams.map((team) => (
        <section key={team.id} className="panel p-5">
          <h2 className="mb-4 font-display text-lg uppercase text-foreground">
            {team.name} · Game {game}
          </h2>
          <div className="space-y-5">
            {lineupsOf(team.id).map((lineup, i) => {
              const slot = i + 1;
              if (!lineup)
                return (
                  <p key={slot} className="text-sm text-muted-foreground">
                    Slot {slot}: no rostered bowler for week {week}. Assign one under Teams &
                    Bowlers.
                  </p>
                );
              const rosterBowlerId = (lineup.absent_bowler_id ?? lineup.bowler_id) as string | null;
              const k = sheetKey(lineup.id, game);
              const frames = sheets[k] ?? emptyGame();
              return (
                <div key={lineup.id} className="rounded-md border border-border p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span className="text-xs uppercase text-muted-foreground">Slot {slot}</span>
                    <span className="font-display text-base uppercase text-foreground">
                      {lineup.participation === "blind"
                        ? `Blind (${lineup.absent?.full_name ?? "vacant"})`
                        : (lineup.bowler?.full_name ?? "—")}
                    </span>
                    <select
                      value={lineup.participation}
                      onChange={(e) => {
                        const p = e.target.value as Participation;
                        setLineup.mutate({
                          lineup,
                          patch:
                            p === "rostered"
                              ? { participation: p, bowlerId: rosterBowlerId, absentId: null }
                              : p === "blind"
                                ? { participation: p, bowlerId: null, absentId: rosterBowlerId }
                                : { participation: p, bowlerId: null, absentId: rosterBowlerId },
                        });
                      }}
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                    >
                      <option value="rostered">Rostered</option>
                      <option value="sub">Sub</option>
                      <option value="blind">Blind</option>
                    </select>
                    {lineup.participation === "sub" && (
                      <select
                        value={lineup.bowler_id ?? ""}
                        onChange={(e) =>
                          setLineup.mutate({
                            lineup,
                            patch: { bowlerId: e.target.value || null },
                          })
                        }
                        className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                      >
                        <option value="">— choose sub —</option>
                        {(bowlers ?? [])
                          .filter((b: any) => b.is_sub && b.is_active)
                          .map((b: any) => (
                            <option key={b.id} value={b.id}>
                              {b.full_name}
                            </option>
                          ))}
                      </select>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      Applicable {truncateAverage(Number(lineup.applicable_average))} (
                      {lineup.average_source})
                      {lineup.participation === "blind"
                        ? ` · blind ${blindScore(Number(lineup.applicable_average), season.blind_deduction)} per game`
                        : ` · game ${scoreGame(frames).total}`}
                    </span>
                  </div>

                  {lineup.participation === "blind" ? (
                    <p className="text-sm text-muted-foreground">
                      Blind score of{" "}
                      {blindScore(Number(lineup.applicable_average), season.blind_deduction)} counts
                      toward the team total only — no ball-by-ball statistics are recorded.
                    </p>
                  ) : (
                    <BallGrid
                      gridId={k}
                      frames={frames}
                      disabled={detail.match.status === "final" || !lineup.bowler_id}
                      onChange={(next) => {
                        setSheets((s) => ({ ...s, [k]: next }));
                        autosave(lineup.id, game, next);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  async function finalizeNow() {
    try {
      // Flush any pending autosaves first.
      for (const [k, t] of Object.entries(timers.current)) {
        clearTimeout(t);
        const [lineupId, g] = k.split(":");
        const l = (detail!.lineups ?? []).find((x: any) => x.id === lineupId);
        if (!l || l.participation === "blind") continue;
        await saveBowlerGame({
          lineupId: lineupId!,
          gameNumber: Number(g),
          frames: sheets[k] ?? emptyGame(),
          isBlind: false,
        });
      }
      // Persist blind games so the finalized record carries them.
      for (const l of detail!.lineups ?? []) {
        if (l.participation !== "blind") continue;
        for (const g of [1, 2, 3]) {
          await saveBowlerGame({
            lineupId: l.id,
            gameNumber: g,
            frames: emptyGame(),
            isBlind: true,
            blindValue: blindScore(Number(l.applicable_average), season!.blind_deduction),
          });
        }
      }
      const fresh = await qc.fetchQuery(matchDetailQuery(matchId));
      await finalizeMatch({
        matchId,
        seasonId: season!.id,
        teamAId: detail!.match.team_a_id,
        teamBId: detail!.match.team_b_id,
        lineups: (fresh.lineups ?? []).map((l: any) => ({
          id: l.id,
          team_id: l.team_id,
          slot: l.slot,
          participation: l.participation,
          applicable_average: Number(l.applicable_average),
          bowler_games: (l.bowler_games ?? []).map((g: any) => ({
            game_number: g.game_number,
            scratch_score: g.scratch_score,
            is_blind: g.is_blind,
          })),
        })),
        handicapPercent: season!.handicap_percent,
        blindDeduction: season!.blind_deduction,
      });
      toast.success("Match finalized");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function reopenNow() {
    try {
      await unfinalizeMatch(matchId, season!.id);
      toast.success("Match reopened");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
}
