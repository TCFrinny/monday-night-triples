import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sortTeamsByName } from "@/lib/team-order";
import { activeSeasonQuery, rosterSpotsQuery, seasonMatchSummaryQuery, teamsQuery, weeksQuery } from "@/lib/queries";
import { rosterForWeek } from "@/lib/roster";
import { isPositionRound, thirdForWeek } from "@/lib/league";
import {
  generateWeekDates,
  normalizeSkipDates,
  planWeekDates,
  shiftPreview,
  validateShift,
  type WeekRow,
} from "@/lib/schedule-dates";
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
  const { data: teamsRaw } = useQuery(teamsQuery(season?.id));
  const teams = sortTeamsByName((teamsRaw ?? []) as any[]);
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));
  const { data: spots } = useQuery(rosterSpotsQuery(season?.id));
  const [startDate, setStartDate] = useState("");
  const [skipDraft, setSkipDraft] = useState("");
  const [skipDates, setSkipDates] = useState<string[]>([]);
  const [weekId, setWeekId] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [lanes, setLanes] = useState("");

  const weekRows: WeekRow[] = (weeks ?? []).map((w: any) => ({
    id: w.id,
    week_number: w.week_number,
    bowl_date: w.bowl_date ?? null,
  }));
  const finalizedWeekNumbers = Array.from(
    new Set(
      (matches ?? [])
        .filter((m: any) => m.status === "final")
        .map((m: any) => m.weeks.week_number as number),
    ),
  );

  const plan = useMemo(() => {
    if (!season || !startDate) return null;
    try {
      const generated = generateWeekDates(startDate, season.total_weeks, skipDates);
      return planWeekDates({
        existing: weekRows,
        generated,
        finalizedWeekNumbers,
        thirdFor: (n) => thirdForWeek(n, season.third_boundaries ?? [12, 24, 36]),
        isPositionRoundFor: (n) => isPositionRound(n, season.position_round_weeks ?? []),
      });
    } catch {
      return null;
    }
  }, [season?.total_weeks, startDate, skipDates, weeks, matches]);

  const generate = useMutation({
    mutationFn: async () => {
      if (!season) throw new Error("No season.");
      if (!startDate) throw new Error("Pick the week 1 bowling date.");
      if (!plan || !plan.rows.length) throw new Error("Nothing to apply.");
      const { data, error } = await supabase.rpc("apply_week_dates", {
        p_season_id: season.id,
        p_rows: plan.rows.map((r) => ({
          week_number: r.week_number,
          bowl_date: r.bowl_date,
          third: r.third,
          is_position_round: r.is_position_round,
        })),
      });
      if (error) throw new Error(error.message);
      return data as { updated: number; inserted: number; locked: number[] };
    },
    onSuccess: (res) => {
      toast.success(
        `${res?.inserted ?? 0} week(s) created · ${res?.updated ?? 0} date(s) updated` +
          (res?.locked?.length ? ` · ${res.locked.length} finalized week(s) kept` : ""),
      );
      qc.invalidateQueries({ queryKey: ["weeks"] });
      qc.invalidateQueries({ queryKey: ["season-match-summary"] });
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const defaultShiftWeek =
    weekRows.find((w) => !finalizedWeekNumbers.includes(w.week_number))?.week_number ?? 0;
  const [shiftWeek, setShiftWeek] = useState<number | null>(null);
  const [shiftWeeksCount, setShiftWeeksCount] = useState(1);
  const selectedShiftWeek = shiftWeek ?? defaultShiftWeek;
  const shiftDays = shiftWeeksCount * 7;
  const shiftRows = selectedShiftWeek
    ? shiftPreview(weekRows, selectedShiftWeek, shiftDays)
    : [];
  const shiftError = validateShift({
    weeks: weekRows,
    finalizedWeekNumbers,
    fromWeekNumber: selectedShiftWeek,
    days: shiftDays,
  });

  const shift = useMutation({
    mutationFn: async () => {
      if (!season) throw new Error("No season.");
      if (shiftError) throw new Error(shiftError);
      const { error } = await supabase.rpc("shift_schedule_dates", {
        p_season_id: season.id,
        p_from_week: selectedShiftWeek,
        p_days: shiftDays,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`Week ${selectedShiftWeek} and later moved by ${shiftWeeksCount} week(s)`);
      qc.invalidateQueries({ queryKey: ["weeks"] });
      qc.invalidateQueries({ queryKey: ["season-match-summary"] });
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
          <div className="space-y-1.5">
            <Label htmlFor="skip">Dates to skip (holidays / closures)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="skip"
                type="date"
                value={skipDraft}
                onChange={(e) => setSkipDraft(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!skipDraft) return;
                  setSkipDates((d) => normalizeSkipDates([...d, skipDraft]));
                  setSkipDraft("");
                }}
              >
                Add
              </Button>
            </div>
          </div>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            Apply {season.total_weeks} week dates
          </Button>
          <span className="text-xs text-muted-foreground">
            {(weeks ?? []).length} week{(weeks ?? []).length === 1 ? "" : "s"} created
          </span>
        </div>

        {!!skipDates.length && (
          <div className="mt-4 flex flex-wrap gap-2">
            {skipDates.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 px-3 py-1 text-xs text-gold"
              >
                {d}
                <button
                  type="button"
                  aria-label={`Remove ${d}`}
                  onClick={() => setSkipDates((list) => list.filter((x) => x !== d))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {!!plan && (
          <div className="mt-5">
            <p className="mb-2 font-display text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Preview · {plan.inserts.length} new · {plan.updates.length} date change
              {plan.updates.length === 1 ? "" : "s"} · {plan.unchanged.length} unchanged
              {plan.lockedWeekNumbers.length
                ? ` · ${plan.lockedWeekNumbers.length} finalized week(s) kept as-is`
                : ""}
              {skipDates.length ? ` · ${skipDates.length} date(s) skipped` : ""}
            </p>
            {!!plan.extraWeekNumbers.length && (
              <p className="mb-2 text-xs text-gold">
                Weeks {plan.extraWeekNumbers.join(", ")} exist beyond the configured{" "}
                {season.total_weeks}-week season. They are left untouched — remove them manually if
                they are not wanted.
              </p>
            )}
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {plan.rows.map((r) => (
                <div
                  key={r.week_number}
                  className="flex items-center justify-between gap-2 border-b border-border/50 py-1"
                >
                  <span className="text-muted-foreground">Week {r.week_number}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {r.action === "update" && (
                      <span className="text-muted-foreground line-through">{r.from}</span>
                    )}
                    <span className={r.action === "unchanged" ? "" : "text-primary"}>
                      {r.bowl_date}
                    </span>
                    <span className="font-display text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {r.action === "insert" ? "New" : r.action === "update" ? "Update" : "Same"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="mb-1 font-display text-lg uppercase text-foreground">
          Postpone / shift remaining schedule
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Moves the selected week and every later week's date only. Week numbers, matchups, lanes,
          scores and rosters are untouched.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="shift-week">Week to postpone</Label>
            <select
              id="shift-week"
              value={selectedShiftWeek || ""}
              onChange={(e) => setShiftWeek(Number(e.target.value))}
              className="rounded-md border border-border bg-card px-2 py-2 text-sm"
            >
              <option value="">Week…</option>
              {weekRows.map((w) => (
                <option key={w.id} value={w.week_number}>
                  Week {w.week_number} · {w.bowl_date ?? "no date"}
                  {finalizedWeekNumbers.includes(w.week_number) ? " (final)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shift-count">Shift by (weeks)</Label>
            <Input
              id="shift-count"
              type="number"
              min={1}
              max={20}
              className="w-24"
              value={shiftWeeksCount}
              onChange={(e) => setShiftWeeksCount(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <Button
            variant="outline"
            disabled={Boolean(shiftError) || shift.isPending}
            onClick={() => {
              const ok = window.confirm(
                `Move Week ${selectedShiftWeek} and ${Math.max(0, shiftRows.length - 1)} later week(s) forward by ${shiftWeeksCount} week(s)?`,
              );
              if (ok) shift.mutate();
            }}
          >
            {shift.isPending ? "Shifting…" : "Postpone schedule"}
          </Button>
        </div>

        {shiftError ? (
          <p className="mt-4 text-sm text-destructive">{shiftError}</p>
        ) : (
          !!shiftRows.length && (
            <div className="mt-5">
              <p className="mb-2 font-display text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {shiftRows.length} week{shiftRows.length === 1 ? "" : "s"} will move
              </p>
              <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {shiftRows.map((r) => (
                  <div key={r.id} className="flex justify-between border-b border-border/50 py-1">
                    <span className="text-muted-foreground">Week {r.week_number}</span>
                    <span className="tabular-nums">
                      {r.from ?? "—"} <span className="text-muted-foreground">→</span>{" "}
                      <span className="text-primary">{r.to ?? "—"}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
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
