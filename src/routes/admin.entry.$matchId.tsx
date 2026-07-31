import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { activeSeasonQuery, bowlerStatsQuery, bowlersQuery, matchDetailQuery } from "@/lib/queries";
import { framesFromRows, Linescore } from "@/components/league/ui";
import { applicableAverage, blindScore, formatPoints, teamAverage, teamHandicap, truncateAverage } from "@/lib/league";
import { emptyGame, parseBallToken, scoreGame, type Frame } from "@/lib/duckpin";
import { finalizeMatch, saveBowlerGame, unfinalizeMatch } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/entry/$matchId")({
  component: ScoreEntry,
});

type Participation = "rostered" | "sub" | "blind";
const PARTICIPATION: Participation[] = ["rostered", "sub", "blind"];

function ScoreEntry() {
  const { matchId } = Route.useParams();
  const qc = useQueryClient();
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: detail } = useQuery(matchDetailQuery(matchId));
  const { data: bowlers } = useQuery(bowlersQuery(season?.id));
  const { data: stats } = useQuery(bowlerStatsQuery(season?.id, "full"));

  const invalidate = () => qc.invalidateQueries();

  const addLineup = useMutation({
    mutationFn: async ({ teamId, slot, bowlerId, participation }: { teamId: string; slot: number; bowlerId: string | null; participation: Participation }) => {
      const b = (bowlers ?? []).find((x: any) => x.id === bowlerId);
      const s = (stats ?? []).find((x: any) => x.bowler_id === bowlerId);
      const games = s?.games ?? 0;
      const app = b
        ? applicableAverage({
            entryAverage: Number(b.entry_average),
            currentAverage: games && s ? Number(s.average) : null,
            gamesBefore: games,
            threshold: season?.establishment_threshold ?? 15,
          })
        : { value: 0, source: "entry" as const };
      const existing = (detail?.lineups ?? []).find((l: any) => l.team_id === teamId && l.slot === slot);
      const payload = {
        match_id: matchId,
        team_id: teamId,
        slot,
        bowler_id: bowlerId,
        participation,
        applicable_average: app.value,
        applicable_average_truncated: truncateAverage(app.value),
        average_source: app.source,
        games_before: games,
      };
      const res = existing
        ? await supabase.from("match_lineups").update(payload).eq("id", existing.id)
        : await supabase.from("match_lineups").insert(payload);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const finalize = useMutation({
    mutationFn: async () => {
      if (!season || !detail) throw new Error("Not ready.");
      await finalizeMatch({
        matchId,
        seasonId: season.id,
        teamAId: detail.match.team_a_id,
        teamBId: detail.match.team_b_id,
        lineups: (detail.lineups ?? []).map((l: any) => ({
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
        handicapPercent: season.handicap_percent,
        blindDeduction: season.blind_deduction,
      });
    },
    onSuccess: () => {
      toast.success("Match finalized");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopen = useMutation({
    mutationFn: async () => unfinalizeMatch(matchId, season!.id),
    onSuccess: () => {
      toast.success("Match reopened");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!detail || !season) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const teams = [
    { id: detail.match.team_a_id, name: detail.match.team_a?.name },
    { id: detail.match.team_b_id, name: detail.match.team_b?.name },
  ];
  const lineupFor = (teamId: string, slot: number) =>
    (detail.lineups ?? []).find((l: any) => l.team_id === teamId && l.slot === slot);
  const teamAvg = (teamId: string) =>
    teamAverage(
      [1, 2, 3].map((slot) => Number(lineupFor(teamId, slot)?.applicable_average ?? 0)),
    );
  const hcp = teamHandicap(teamAvg(teams[0]!.id), teamAvg(teams[1]!.id), season.handicap_percent);

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
            {hcp.pins} pins per game to {hcp.receivingSide === "a" ? teams[0]!.name : hcp.receivingSide === "b" ? teams[1]!.name : "nobody"}
          </span>
        </span>
        <span className="ml-auto flex gap-2">
          {detail.match.status === "final" ? (
            <>
              <span className="stat-num text-primary">
                {formatPoints(Number(detail.match.points_a))}–{formatPoints(Number(detail.match.points_b))}
              </span>
              <Button variant="outline" size="sm" onClick={() => reopen.mutate()}>
                Reopen
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => finalize.mutate()} disabled={finalize.isPending}>
              Finalize match
            </Button>
          )}
        </span>
      </div>

      {teams.map((team) => (
        <section key={team.id} className="panel p-5">
          <h2 className="mb-4 font-display text-lg uppercase text-foreground">{team.name}</h2>
          <div className="space-y-6">
            {[1, 2, 3].map((slot) => {
              const lineup = lineupFor(team.id, slot);
              return (
                <div key={slot} className="rounded-md border border-border p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs uppercase text-muted-foreground">Slot {slot}</span>
                    <select
                      value={lineup?.bowler?.id ?? ""}
                      onChange={(e) =>
                        addLineup.mutate({
                          teamId: team.id,
                          slot,
                          bowlerId: e.target.value || null,
                          participation: (lineup?.participation ?? "rostered") as Participation,
                        })
                      }
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                    >
                      <option value="">— choose bowler —</option>
                      {(bowlers ?? []).map((b: any) => (
                        <option key={b.id} value={b.id}>
                          {b.full_name}
                          {b.is_sub ? " (sub)" : ""}
                        </option>
                      ))}
                    </select>
                    <select
                      value={lineup?.participation ?? "rostered"}
                      onChange={(e) =>
                        addLineup.mutate({
                          teamId: team.id,
                          slot,
                          bowlerId: lineup?.bowler?.id ?? null,
                          participation: e.target.value as Participation,
                        })
                      }
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                    >
                      {PARTICIPATION.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    {lineup && (
                      <span className="text-xs text-muted-foreground">
                        Applicable {truncateAverage(Number(lineup.applicable_average))} (
                        {lineup.average_source}) ·{" "}
                        {lineup.participation === "blind"
                          ? `blind ${blindScore(Number(lineup.applicable_average), season.blind_deduction)} per game`
                          : `${lineup.games_before} games before`}
                      </span>
                    )}
                  </div>

                  {lineup && lineup.participation !== "blind" && (
                    <div className="mt-4 space-y-4">
                      {[1, 2, 3].map((gameNumber) => (
                        <GameEditor
                          key={gameNumber}
                          lineupId={lineup.id}
                          gameNumber={gameNumber}
                          existing={(lineup.bowler_games ?? []).find((g: any) => g.game_number === gameNumber)}
                          onSaved={invalidate}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function GameEditor({
  lineupId,
  gameNumber,
  existing,
  onSaved,
}: {
  lineupId: string;
  gameNumber: number;
  existing: any;
  onSaved: () => void;
}) {
  const [frames, setFrames] = useState<Frame[]>(() =>
    existing?.frames?.length ? framesFromRows(existing.frames) : emptyGame(),
  );
  const [entry, setEntry] = useState("");
  const scored = scoreGame(frames);

  const applyToken = (token: string) => {
    const next = frames.map((f) => ({ balls: [...f.balls] }));
    for (let fi = 0; fi < next.length; fi++) {
      const frame = next[fi]!;
      const maxBalls = 3;
      const complete = scoreGame(next).frames[fi]!.complete;
      if (complete) continue;
      const bi = frame.balls.length;
      if (bi >= maxBalls) continue;
      const parsed = parseBallToken(token, next, fi, bi);
      if (parsed.error || !parsed.ball) {
        toast.error(parsed.error ?? "Invalid entry.");
        return;
      }
      frame.balls.push(parsed.ball);
      setFrames(next);
      return;
    }
    toast.error("Game is complete.");
  };

  const save = useMutation({
    mutationFn: async () =>
      saveBowlerGame({ lineupId, gameNumber, frames, isBlind: false }),
    onSuccess: () => {
      toast.success(`Game ${gameNumber} saved (${scored.total})`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="font-display text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Game {gameNumber}
        </span>
        <Input
          className="h-8 w-28"
          placeholder="X, /, 7, 7s, -"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (!entry.trim()) return;
            applyToken(entry);
            setEntry("");
          }}
        />
        <Button variant="ghost" size="sm" onClick={() => setFrames(emptyGame())}>
          Clear
        </Button>
        <span className="stat-num text-base text-primary">{scored.total}</span>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          Save
        </Button>
      </div>
      <Linescore frames={frames} />
    </div>
  );
}
