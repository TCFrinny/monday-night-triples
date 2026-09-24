import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  activeSeasonQuery,
  bowlersQuery,
  matchDetailQuery,
  rosterSpotsQuery,
  seasonGamesByWeekQuery,
} from "@/lib/queries";
import { framesFromRows } from "@/components/league/ui";
import { BallGrid } from "@/components/league/ball-grid";
import { rosterForWeek } from "@/lib/roster";
import {
  applicableAverage,
  formatPoints,
  priorAveragesBefore,
  type PriorGameRow,
  teamAverage,
  teamHandicap,
  truncateAverage,
} from "@/lib/league";
import { emptyGame, scoreGame, type Frame } from "@/lib/duckpin";
import { finalizeMatch, saveBowlerGame, unfinalizeMatch } from "@/lib/admin";
import { gameBlindValue, isGameBlind } from "@/lib/blind-games";
import { Button } from "@/components/ui/button";
import {
  computeTriplesPoints,
  parseDecisions,
  teamFrameOne,
  type RolloffKey,
  type Side,
} from "@/lib/rolloff";

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
  const { data: priorGames } = useQuery(seasonGamesByWeekQuery(season?.id));
  const { data: spots } = useQuery(rosterSpotsQuery(season?.id));
  const [game, setGame] = useState(1);
  const [sheets, setSheets] = useState<Record<string, Frame[]>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const seeded = useRef(false);
  const detailRef = useRef(detail);
  detailRef.current = detail;

  const invalidate = () => qc.invalidateQueries();

  const week = detail?.match?.weeks?.week_number ?? 1;

  /**
   * Games/average each bowler had BEFORE this match's LEAGUE week. Using the
   * league week (not the calendar entry date) keeps a delayed makeup — e.g. a
   * Week 1 match bowled after Week 4 — on the averages that applied in Week 1.
   */
  const priorByBowler = useMemo(() => {
    const rows: PriorGameRow[] = [];
    for (const l of (priorGames ?? []) as any[]) {
      if (!l?.bowler_id || l.participation === "blind") continue;
      const wk = Number(l.matches?.weeks?.week_number ?? 0);
      for (const g of (l.bowler_games ?? []) as any[]) {
        if (g?.is_complete === false || g?.is_blind) continue;
        rows.push({ bowlerId: l.bowler_id, weekNumber: wk, scratch: Number(g.scratch_score ?? 0) });
      }
    }
    return priorAveragesBefore(rows, week);
  }, [priorGames, week]);

  /** Applicable average for a bowler, from entry average + established current. */
  const appFor = useMemo(
    () => (bowlerId: string | null | undefined) => {
      const b = (bowlers ?? []).find((x: any) => x.id === bowlerId);
      if (!b) return { value: 0, source: "entry" as const, games: 0 };
      const prior = bowlerId ? priorByBowler.get(bowlerId) : undefined;
      const games = prior?.games ?? 0;
      const app = applicableAverage({
        entryAverage: Number(b.entry_average),
        currentAverage: prior?.average ?? null,
        gamesBefore: games,
        threshold: season?.establishment_threshold ?? 15,
      });
      return { ...app, games };
    },
    [bowlers, priorByBowler, season?.establishment_threshold],
  );

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
      // Correcting a legacy full-match blind back to a real identity un-blinds
      // its games so ball entry is possible again (unfinalized matches only).
      if (lineup.participation === "blind" && participation !== "blind") {
        const unblind = await supabase
          .from("bowler_games")
          .update({ is_blind: false })
          .eq("lineup_id", lineup.id);
        if (unblind.error) throw new Error(unblind.error.message);
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  /** Debounced autosave of a bowler game sheet. Never overwrites a blind game. */
  const autosave = (lineupId: string, gameNumber: number, frames: Frame[]) => {
    const k = sheetKey(lineupId, gameNumber);
    if (timers.current[k]) clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(async () => {
      try {
        const l = (detailRef.current?.lineups ?? []).find((x: any) => x.id === lineupId);
        if (l && isGameBlind(l, gameNumber)) return; // game was marked blind after scheduling
        await saveBowlerGame({ lineupId, gameNumber, frames, isBlind: false });
        if (detailRef.current?.match.status === "scheduled") {
          await supabase.from("matches").update({ status: "in_progress" }).eq("id", matchId);
        }
        qc.invalidateQueries({ queryKey: ["match", matchId] });
      } catch (e) {
        toast.error((e as Error).message);
      }
    }, 700);
  };

  /** Toggle blind for ONE game only; other games are untouched. */
  const toggleGameBlind = async (lineup: any, gameNumber: number) => {
    const k = sheetKey(lineup.id, gameNumber);
    if (timers.current[k]) {
      clearTimeout(timers.current[k]);
      delete timers.current[k];
    }
    const makeBlind = !isGameBlind(lineup, gameNumber);
    try {
      if (makeBlind) {
        setSheets((s) => ({ ...s, [k]: emptyGame() }));
        await saveBowlerGame({
          lineupId: lineup.id,
          gameNumber,
          frames: emptyGame(),
          isBlind: true,
          blindValue: gameBlindValue(lineup, season!.blind_deduction),
        });
      } else {
        await saveBowlerGame({
          lineupId: lineup.id,
          gameNumber,
          frames: emptyGame(),
          isBlind: false,
        });
      }
      if (detailRef.current?.match.status === "scheduled") {
        await supabase.from("matches").update({ status: "in_progress" }).eq("id", matchId);
      }
      qc.invalidateQueries({ queryKey: ["match", matchId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
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
    if (isGameBlind(lineup, g)) return gameBlindValue(lineup, season.blind_deduction);
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
  const decisions = parseDecisions(detail.match.rolloff_decisions);
  const frameOneFor = (teamId: string, g: number) =>
    teamFrameOne(
      lineupsOf(teamId).map((l) => ({
        blind: l ? isGameBlind(l, g) : false,
        frames: l ? (sheets[sheetKey(l.id, g)] ?? null) : null,
      })),
    );
  const frameOne = {
    2: { a: frameOneFor(teams[0]!.id, 2), b: frameOneFor(teams[1]!.id, 2) },
    3: { a: frameOneFor(teams[0]!.id, 3), b: frameOneFor(teams[1]!.id, 3) },
  };
  const points = computeTriplesPoints({ hdcpA, hdcpB, handicap: hcp, frameOne, decisions });
  const isFinalMatch = detail.match.status === "final";
  const sideName = (s: Side | null) => (s === "a" ? teams[0]!.name : s === "b" ? teams[1]!.name : "—");
  const setDecision = async (key: RolloffKey, side: Side) => {
    const next = { ...parseDecisions(detail.match.rolloff_decisions), [key]: side };
    const { error } = await supabase.from("matches").update({ rolloff_decisions: next }).eq("id", matchId);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["match", matchId] });
  };
  const WinnerPicker = ({ k, current }: { k: RolloffKey; current: Side | null }) => (
    <span className="inline-flex gap-1">
      {(["a", "b"] as const).map((s) => (
        <Button
          key={s}
          size="sm"
          variant={current === s ? "default" : "outline"}
          disabled={isFinalMatch}
          onClick={() => setDecision(k, s)}
        >
          {sideName(s)} won
        </Button>
      ))}
    </span>
  );

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
                <Fragment key={team.id}>
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
                          {l && isGameBlind(l, g) && (
                            <span className="ml-1 text-[10px] uppercase text-muted-foreground">blind</span>
                          )}
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
                </Fragment>
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

      {(points.gamePoints.some((g) => g.tied) || points.set.tied) && (
        <div className="panel space-y-3 p-4 text-sm">
          <h2 className="font-display text-sm uppercase tracking-[0.14em] text-gold">
            Roll-offs — Triples ties are never split
          </h2>
          {points.gamePoints
            .filter((g) => g.tied)
            .map((g) => {
              const ro = g.rolloff!;
              return (
                <div key={g.game} className="rounded-md border border-border p-3">
                  <div className="font-display uppercase text-foreground">
                    Game {g.game} tied {hdcpA[g.game - 1]}–{hdcpB[g.game - 1]} (hdcp)
                  </div>
                  {ro.nextGame && (
                    <div className="mt-1 text-muted-foreground tabular-nums">
                      Roll-off = Game {ro.nextGame} frame 1 (natural score incl. bonus) + 10% of the
                      handicap to the receiving team:{" "}
                      {teams[0]!.name} {ro.aScratch ?? "?"} + {ro.aHdcp} = {ro.aTotal ?? "?"} ·{" "}
                      {teams[1]!.name} {ro.bScratch ?? "?"} + {ro.bHdcp} = {ro.bTotal ?? "?"}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {ro.winner ? (
                      <span className="text-primary">
                        Roll-off winner: {sideName(ro.winner)} (+2){ro.method === "manual" ? " · chosen by admin" : ""}
                      </span>
                    ) : (
                      <span className="text-gold">{ro.message}</span>
                    )}
                    {ro.manualAllowed && (
                      <WinnerPicker k={`game${g.game}` as RolloffKey} current={ro.winner} />
                    )}
                  </div>
                </div>
              );
            })}
          {points.set.tied && (
            <div className="rounded-md border border-border p-3">
              <div className="font-display uppercase text-foreground">
                Set tied {points.set.a}–{points.set.b} (hdcp)
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {points.set.winner ? (
                  <span className="text-primary">Roll-off winner: {sideName(points.set.winner)} (+1) · chosen by admin</span>
                ) : (
                  <span className="text-gold">{points.set.message}</span>
                )}
                <WinnerPicker k="set" current={points.set.winner} />
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Roll-offs decide points only — game scores, pinfall and stats stay exactly as bowled.
          </p>
        </div>
      )}

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
              const gameIsBlind = isGameBlind(lineup, game);
              const blindVal = gameBlindValue(lineup, season.blind_deduction);
              const isFinal = detail.match.status === "final";
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
                        if (p === "blind") return; // blind is per game now — use the toggle
                        setLineup.mutate({
                          lineup,
                          patch:
                            p === "rostered"
                              ? { participation: p, bowlerId: rosterBowlerId, absentId: null }
                              : { participation: p, bowlerId: null, absentId: rosterBowlerId },
                        });
                      }}
                      disabled={isFinal}
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                    >
                      <option value="rostered">Rostered</option>
                      <option value="sub">Sub</option>
                      {lineup.participation === "blind" && (
                        <option value="blind">Blind (all games — pick Rostered/Sub to correct)</option>
                      )}
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
                    <Button
                      type="button"
                      size="sm"
                      variant={gameIsBlind ? "default" : "outline"}
                      disabled={isFinal || lineup.participation === "blind"}
                      onClick={() => toggleGameBlind(lineup, game)}
                      title="Blind applies to this game only — the other games keep their own scores."
                    >
                      {gameIsBlind ? `Game ${game} is blind` : `Blind game ${game}`}
                    </Button>
                    <span className="ml-auto text-xs text-muted-foreground">
                      Applicable {truncateAverage(Number(lineup.applicable_average))} (
                      {lineup.average_source})
                      {gameIsBlind ? ` · blind ${blindVal}` : ` · game ${scoreGame(frames).total}`}
                    </span>
                  </div>

                  {lineup.participation === "blind" ? (
                    <p className="text-sm text-muted-foreground">
                      Legacy full-match blind: {blindVal} per game counts toward the team total
                      only. To correct it, switch the lineup back to Rostered or Sub above, then
                      use the per-game blind toggle if only some games are blind.
                    </p>
                  ) : gameIsBlind ? (
                    <p className="text-sm text-muted-foreground">
                      Game {game} is blind: {blindVal} counts toward the team total only — no
                      ball-by-ball statistics for this game. The bowler&apos;s other games keep
                      their own scores and stats. Use “Blind game {game}” again to switch it back
                      to rolled.
                    </p>
                  ) : (
                    <BallGrid
                      gridId={k}
                      frames={frames}
                      disabled={isFinal || !lineup.bowler_id}
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
      // Flush any pending autosaves first (skip games that are blind).
      for (const [k, t] of Object.entries(timers.current)) {
        clearTimeout(t);
        const [lineupId, g] = k.split(":");
        const l = (detail!.lineups ?? []).find((x: any) => x.id === lineupId);
        if (!l || isGameBlind(l, Number(g))) continue;
        await saveBowlerGame({
          lineupId: lineupId!,
          gameNumber: Number(g),
          frames: sheets[k] ?? emptyGame(),
          isBlind: false,
        });
      }
      // Persist every blind game so the finalized record carries it — per game,
      // including legacy full-match blind lineups missing per-game rows.
      for (const l of detail!.lineups ?? []) {
        for (const g of [1, 2, 3]) {
          if (!isGameBlind(l, g)) continue;
          await saveBowlerGame({
            lineupId: l.id,
            gameNumber: g,
            frames: emptyGame(),
            isBlind: true,
            blindValue: gameBlindValue(l, season!.blind_deduction),
          });
        }
      }
      const fresh = await qc.fetchQuery(matchDetailQuery(matchId));
      // Roll-off frames come from the saved sheets, exactly as stored.
      const freshFrameOne = (teamId: string, g: number) =>
        teamFrameOne(
          [1, 2, 3].map((slot) => {
            const l = (fresh.lineups ?? []).find((x: any) => x.team_id === teamId && x.slot === slot);
            const row = l?.bowler_games?.find((x: any) => x.game_number === g);
            return {
              blind: l ? isGameBlind(l, g) : false,
              frames: row ? framesFromRows(row.frames) : null,
            };
          }),
        );
      const tA = detail!.match.team_a_id as string;
      const tB = detail!.match.team_b_id as string;
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
        frameOne: {
          2: { a: freshFrameOne(tA, 2), b: freshFrameOne(tB, 2) },
          3: { a: freshFrameOne(tA, 3), b: freshFrameOne(tB, 3) },
        },
        decisions: parseDecisions(fresh.match.rolloff_decisions),
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
