import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { activeSeasonQuery, rosterSpotsQuery, seasonMatchSummaryQuery, teamsQuery, weeksQuery } from "@/lib/queries";
import { rosterForWeek } from "@/lib/roster";
import { isPositionRound, thirdForWeek } from "@/lib/league";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/schedule")({
  component: AdminSchedule,
});

function AdminSchedule() {
  const qc = useQueryClient();
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: weeks } = useQuery(weeksQuery(season?.id));
  const { data: teams } = useQuery(teamsQuery(season?.id));
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));
  const { data: spots } = useQuery(rosterSpotsQuery(season?.id));
  const [startDate, setStartDate] = useState("");
  const [weekId, setWeekId] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [lanes, setLanes] = useState("");

  const generate = useMutation({
    mutationFn: async () => {
      if (!season) throw new Error("No season.");
      if (!startDate) throw new Error("Pick the week 1 bowling date.");
      const existing = new Set((weeks ?? []).map((w: any) => w.week_number));
      const rows = [];
      for (let n = 1; n <= season.total_weeks; n++) {
        if (existing.has(n)) continue;
        const d = new Date(`${startDate}T00:00:00`);
        d.setDate(d.getDate() + (n - 1) * 7);
        rows.push({
          season_id: season.id,
          week_number: n,
          bowl_date: d.toISOString().slice(0, 10),
          third: thirdForWeek(n, season.third_boundaries ?? [12, 24, 36]),
          is_position_round: isPositionRound(n, season.position_round_weeks ?? []),
        });
      }
      if (!rows.length) throw new Error("All weeks already exist.");
      const { error } = await supabase.from("weeks").insert(rows);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Weeks generated");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMatch = useMutation({
    mutationFn: async () => {
      if (!weekId || !teamA) throw new Error("Choose a week and a team.");
      if (teamB && teamA === teamB) throw new Error("A team cannot bowl itself.");
      const count = (matches ?? []).filter((m: any) => m.weeks.id === weekId).length;
      const { error } = await supabase.from("matches").insert({
        week_id: weekId,
        team_a_id: teamA,
        team_b_id: teamB || null,
        is_bye: !teamB,
        lane_pair: lanes.trim().slice(0, 20) || null,
        sort_order: count + 1,
        status: "scheduled",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setTeamA("");
      setTeamB("");
      setLanes("");
      toast.success("Matchup added");
      qc.invalidateQueries({ queryKey: ["season-match-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMatch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("matches").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["season-match-summary"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!season) return <p className="text-sm text-muted-foreground">Create a season first.</p>;

  return (
    <div className="space-y-8">
      <section className="panel p-6">
        <h2 className="mb-4 font-display text-lg uppercase text-foreground">Weeks</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="start">Week 1 bowling date</Label>
            <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            Generate {season.total_weeks} weeks
          </Button>
          <span className="text-xs text-muted-foreground">
            {(weeks ?? []).length} week{(weeks ?? []).length === 1 ? "" : "s"} created
          </span>
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="mb-4 font-display text-lg uppercase text-foreground">Matchups</h2>
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <select
            value={weekId}
            onChange={(e) => setWeekId(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-2 text-sm"
          >
            <option value="">Week…</option>
            {(weeks ?? []).map((w: any) => (
              <option key={w.id} value={w.id}>
                Week {w.week_number}
              </option>
            ))}
          </select>
          <select
            value={teamA}
            onChange={(e) => setTeamA(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-2 text-sm"
          >
            <option value="">Team A…</option>
            {(teams ?? []).map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={teamB}
            onChange={(e) => setTeamB(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-2 text-sm"
          >
            <option value="">Bye</option>
            {(teams ?? []).map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Input className="w-28" placeholder="Lanes" value={lanes} onChange={(e) => setLanes(e.target.value)} />
          <Button onClick={() => addMatch.mutate()} disabled={addMatch.isPending}>
            Add matchup
          </Button>
        </div>

        <div className="space-y-4">
          {(weeks ?? []).map((w: any) => {
            const rows = (matches ?? []).filter((m: any) => m.weeks.id === w.id);
            if (!rows.length) return null;
            return (
              <div key={w.id}>
                <p className="mb-1 font-display text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Week {w.week_number}
                  {w.is_position_round ? " · Position round" : ""}
                </p>
                <ul className="rounded-md border border-border divide-y divide-border/60">
                  {rows.map((m: any) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-16 text-xs text-muted-foreground">{m.lane_pair ?? "—"}</span>
                      <span className="flex-1">
                        {m.team_a?.name} vs {m.is_bye ? "Bye" : m.team_b?.name}
                      </span>
                      <span className="text-xs uppercase text-muted-foreground">{m.status}</span>
                      <Button variant="ghost" size="sm" onClick={() => removeMatch.mutate(m.id)}>
                        Delete
                      </Button>
                      <div className="w-full text-[11px] text-muted-foreground">
                        {[m.team_a, m.is_bye ? null : m.team_b].filter(Boolean).map((t: any) => (
                          <span key={t.id} className="mr-6">
                            {t.name}:{" "}
                            {rosterForWeek(spots as any, t.id, w.week_number)
                              .map((s) => s?.bowlers?.full_name ?? "—")
                              .join(" · ")}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
