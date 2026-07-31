import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  activeSeasonQuery,
  bowlersQuery,
  rosterSpotsQuery,
  seasonMatchSummaryQuery,
  teamsQuery,
  weeksQuery,
} from "@/lib/queries";
import {
  activeTeamByBowler,
  currentRoster,
  currentWeekNumber,
  type RosterSpotRow,
} from "@/lib/roster";
import { formatAverage, slugify } from "@/lib/league";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/teams")({
  component: AdminTeams,
});

function AdminTeams() {
  const { data: season } = useQuery(activeSeasonQuery);
  if (!season) return <p className="text-sm text-muted-foreground">Create a season first.</p>;
  return (
    <div className="space-y-8">
      <BowlerManager seasonId={season.id} />
      <TeamManager seasonId={season.id} />
    </div>
  );
}

function BowlerManager({ seasonId }: { seasonId: string }) {
  const qc = useQueryClient();
  const { data: bowlers } = useQuery(bowlersQuery(seasonId));
  const [name, setName] = useState("");
  const [avg, setAvg] = useState("");
  const [isSub, setIsSub] = useState(false);

  const add = useMutation({
    mutationFn: async () => {
      const full = name.trim().slice(0, 100);
      const entry = Number(avg);
      if (!full) throw new Error("Name is required.");
      if (!Number.isFinite(entry) || entry < 0 || entry > 300) throw new Error("Entry average must be 0–300.");
      const { error } = await supabase.from("bowlers").insert({
        season_id: seasonId,
        full_name: full,
        slug: slugify(full),
        entry_average: entry,
        is_sub: isSub,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setName("");
      setAvg("");
      toast.success("Bowler added");
      qc.invalidateQueries({ queryKey: ["bowlers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { entry_average?: number; is_sub?: boolean; is_active?: boolean } }) => {
      const { error } = await supabase.from("bowlers").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bowlers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="panel p-6">
      <h2 className="mb-1 font-display text-lg uppercase text-foreground">Bowlers</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Entry averages are used until a bowler completes the establishment threshold; the current
        league average then applies from the following week.
      </p>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bname">Full name</Label>
          <Input id="bname" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bavg">Entry average</Label>
          <Input id="bavg" className="w-32" value={avg} onChange={(e) => setAvg(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch id="bsub" checked={isSub} onCheckedChange={setIsSub} />
          <Label htmlFor="bsub">Sub pool</Label>
        </div>
        <Button onClick={() => add.mutate()} disabled={add.isPending}>
          Add bowler
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="py-2">Name</th>
              <th className="py-2">Entry avg</th>
              <th className="py-2">Sub</th>
              <th className="py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {(bowlers ?? []).map((b: any) => (
              <tr key={b.id} className="border-b border-border/60 last:border-0">
                <td className="py-2">{b.full_name}</td>
                <td className="py-2">
                  <Input
                    className="h-8 w-24"
                    defaultValue={formatAverage(b.entry_average)}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0 && v <= 300 && v !== Number(b.entry_average))
                        update.mutate({ id: b.id, patch: { entry_average: v } });
                    }}
                  />
                </td>
                <td className="py-2">
                  <Switch
                    checked={b.is_sub}
                    onCheckedChange={(v) => update.mutate({ id: b.id, patch: { is_sub: v } })}
                  />
                </td>
                <td className="py-2">
                  <Switch
                    checked={b.is_active}
                    onCheckedChange={(v) => update.mutate({ id: b.id, patch: { is_active: v } })}
                  />
                </td>
              </tr>
            ))}
            {!(bowlers ?? []).length && (
              <tr>
                <td colSpan={4} className="py-4 text-muted-foreground">
                  No bowlers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TeamManager({ seasonId }: { seasonId: string }) {
  const qc = useQueryClient();
  const { data: teams } = useQuery(teamsQuery(seasonId));
  const { data: bowlers } = useQuery(bowlersQuery(seasonId));
  const { data: spots } = useQuery(rosterSpotsQuery(seasonId));
  const { data: weeks } = useQuery(weeksQuery(seasonId));
  const { data: matches } = useQuery(seasonMatchSummaryQuery(seasonId));
  const [teamName, setTeamName] = useState("");

  const week = currentWeekNumber(weeks as any, matches as any);
  const takenBy = activeTeamByBowler(spots as any);

  const addTeam = useMutation({
    mutationFn: async () => {
      const n = teamName.trim().slice(0, 80);
      if (!n) throw new Error("Team name is required.");
      const { error } = await supabase
        .from("teams")
        .insert({ season_id: seasonId, name: n, slug: slugify(n) });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setTeamName("");
      toast.success("Team created");
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["roster-spots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: async ({
      teamId,
      slot,
      bowlerId,
      current,
    }: {
      teamId: string;
      slot: number;
      bowlerId: string;
      current?: RosterSpotRow | null;
    }) => {
      if (bowlerId) {
        const other = takenBy.get(bowlerId);
        if (other && other !== teamId)
          throw new Error("That bowler is already an active roster member of another team.");
      }
      if (current) {
        if (current.bowler_id === bowlerId) return;
        if (current.effective_from_week >= week) {
          // Never bowled under this assignment yet — safe to remove outright.
          const { error } = await supabase.from("roster_spots").delete().eq("id", current.id);
          if (error) throw new Error(error.message);
        } else {
          // Preserve history: close the previous assignment out.
          const { error } = await supabase
            .from("roster_spots")
            .update({ effective_to_week: week - 1 })
            .eq("id", current.id);
          if (error) throw new Error(error.message);
        }
      }
      if (!bowlerId) return;
      const { error } = await supabase.from("roster_spots").insert({
        team_id: teamId,
        bowler_id: bowlerId,
        slot,
        effective_from_week: week,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Roster updated");
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["roster-spots"] });
      qc.invalidateQueries({ queryKey: ["bowlers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rostered = (bowlers ?? []).filter((b: any) => !b.is_sub && b.is_active);

  return (
    <section className="panel p-6">
      <h2 className="mb-1 font-display text-lg uppercase text-foreground">Teams & rosters</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Exactly three active bowlers per team. Changing a slot replaces that slot's current
        assignment from week {week} onward; earlier weeks keep their historical roster.
      </p>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tname">Team name</Label>
          <Input id="tname" maxLength={80} value={teamName} onChange={(e) => setTeamName(e.target.value)} />
        </div>
        <Button onClick={() => addTeam.mutate()} disabled={addTeam.isPending}>
          Add team
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(teams ?? []).map((t: any) => {
          const slots = currentRoster(spots as any, t.id);
          return (
            <div key={t.id} className="rounded-md border border-border p-4">
              <h3 className="font-display text-base uppercase text-foreground">{t.name}</h3>
              <div className="mt-3 space-y-2">
                {[1, 2, 3].map((slot) => {
                  const spot = slots[slot - 1];
                  return (
                    <div key={slot} className="flex items-center gap-2">
                      <span className="w-14 text-xs uppercase text-muted-foreground">Slot {slot}</span>
                      <select
                        value={spot?.bowler_id ?? ""}
                        onChange={(e) =>
                          assign.mutate({
                            teamId: t.id,
                            slot,
                            bowlerId: e.target.value,
                            current: spot,
                          })
                        }
                        className="flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                      >
                        <option value="">— empty —</option>
                        {rostered.map((b: any) => {
                          const other = takenBy.get(b.id);
                          const unavailable = Boolean(other) && other !== t.id;
                          return (
                            <option key={b.id} value={b.id} disabled={unavailable}>
                              {b.full_name} ({formatAverage(b.entry_average)})
                              {unavailable ? " — on another team" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!(teams ?? []).length && <p className="text-sm text-muted-foreground">No teams yet.</p>}
      </div>
    </section>
  );
}

