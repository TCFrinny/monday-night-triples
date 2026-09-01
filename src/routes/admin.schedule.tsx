import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sortTeamsByName } from "@/lib/team-order";
import {
  buildWeekSlots,
  resolveActualLane,
  hasBye,
  laneSlots,
  matchupsPerWeek,
  parseLanePair,
  parseStartingLane,
  validateWeekAssignments,
  sortSlotsForDisplay,
} from "@/lib/lane-slots";

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
  const [laneDraft, setLaneDraft] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { a: string; b: string; lane: string }>>({});
  const [byeTeam, setByeTeam] = useState("");
  const [draftWeekId, setDraftWeekId] = useState("");


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

  // ---- Lane setup -------------------------------------------------------
  const activeTeams = teams.filter((t: any) => t.is_active !== false);
  const slotCount = matchupsPerWeek(activeTeams.length);
  const weekHasBye = hasBye(activeTeams.length);
  const savedStartingLane = (season as any)?.starting_lane_number ?? null;
  const laneInput = laneDraft ?? (savedStartingLane != null ? String(savedStartingLane) : "");
  const parsedLane = parseStartingLane(laneInput);
  const previewPairs = laneSlots(parsedLane, slotCount);
  const activePairs = laneSlots(savedStartingLane, slotCount);

  const saveLaneSetup = useMutation({
    mutationFn: async () => {
      if (!season) throw new Error("No season.");
      if (!parsedLane) throw new Error("Enter a positive whole lane number.");
      const { error } = await supabase
        .from("seasons")
        .update({ starting_lane_number: parsedLane })
        .eq("id", season.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lane setup saved");
      setLaneDraft(null);
      qc.invalidateQueries({ queryKey: ["season", "active"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Week matchup grid -------------------------------------------------
  const weekMatches = (matches ?? []).filter((m: any) => m.weeks.id === weekId);
  const weekPlan = useMemo(
    () => buildWeekSlots(activePairs, weekMatches as any),
    [activePairs.join("|"), weekId, matches],
  );
  const existingBye = weekMatches.find((m: any) => m.is_bye) ?? null;

  useEffect(() => {
    if (!weekId || draftWeekId === weekId) return;
    setDraftWeekId(weekId);
    const next: Record<string, { a: string; b: string; lane: string }> = {};
    for (const s of weekPlan.slots) {
      next[s.lane_pair] = {
        a: s.match?.team_a_id ?? "",
        b: s.match?.team_b_id ?? "",
        lane: s.actual_lane_pair,
      };
    }
    setDraft(next);
    setByeTeam(existingBye?.team_a_id ?? "");
  }, [weekId, draftWeekId, weekPlan, existingBye]);

  const assignments = weekPlan.slots.map((s) => ({
    lane_pair: s.lane_pair,
    team_a_id: draft[s.lane_pair]?.a ?? s.match?.team_a_id ?? "",
    team_b_id: draft[s.lane_pair]?.b ?? s.match?.team_b_id ?? "",
    actual_lane_pair: resolveActualLane(draft[s.lane_pair]?.lane, s.actual_lane_pair, s.lane_pair),
    locked: s.locked,
  }));
  const weekError = weekId ? validateWeekAssignments(assignments, byeTeam || null) : null;

  const saveWeek = useMutation({
    mutationFn: async () => {
      if (!weekId) throw new Error("Choose a week.");
      if (weekError) throw new Error(weekError);
      for (const [i, s] of weekPlan.slots.entries()) {
        if (s.locked) continue;
        const a = draft[s.lane_pair]?.a ?? s.match?.team_a_id ?? "";
        const b = draft[s.lane_pair]?.b ?? s.match?.team_b_id ?? "";
        const lane =
          parseLanePair(resolveActualLane(draft[s.lane_pair]?.lane, s.actual_lane_pair, s.lane_pair)) ??
          s.lane_pair;
        if (s.match) {
          if (!a || !b) {
            const { error } = await supabase.from("matches").delete().eq("id", s.match.id);
            if (error) throw new Error(error.message);
          } else {
            const { error } = await supabase
              .from("matches")
              .update({
                team_a_id: a,
                team_b_id: b,
                is_bye: false,
                lane_pair: lane,
                sort_order: i + 1,
              })
              .eq("id", s.match.id);
            if (error) throw new Error(error.message);
          }
        } else if (a && b) {
          const { error } = await supabase.from("matches").insert({
            week_id: weekId,
            team_a_id: a,
            team_b_id: b,
            is_bye: false,
            lane_pair: lane,
            sort_order: i + 1,
            status: "scheduled",
          });
          if (error) throw new Error(error.message);
        }
      }
      if (weekHasBye) {
        if (existingBye && existingBye.status !== "final") {
          if (!byeTeam) {
            const { error } = await supabase.from("matches").delete().eq("id", existingBye.id);
            if (error) throw new Error(error.message);
          } else if (byeTeam !== existingBye.team_a_id) {
            const { error } = await supabase
              .from("matches")
              .update({ team_a_id: byeTeam })
              .eq("id", existingBye.id);
            if (error) throw new Error(error.message);
          }
        } else if (!existingBye && byeTeam) {
          const { error } = await supabase.from("matches").insert({
            week_id: weekId,
            team_a_id: byeTeam,
            team_b_id: null,
            is_bye: true,
            lane_pair: null,
            sort_order: weekPlan.slots.length + 1,
            status: "scheduled",
          });
          if (error) throw new Error(error.message);
        }
      }
    },
    onSuccess: () => {
      toast.success("Week matchups saved");
      setDraftWeekId("");
      qc.invalidateQueries({ queryKey: ["season-match-summary"] });
      qc.invalidateQueries({ queryKey: ["lane-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Lane-pair metadata only. Allowed on finalized matches; scores/teams untouched. */
  const setLanePair = useMutation({
    mutationFn: async ({ id, lane }: { id: string; lane: string }) => {
      const parsed = parseLanePair(lane);
      if (!parsed) throw new Error("Enter two consecutive lanes, e.g. 31-32.");
      const { error } = await supabase.from("matches").update({ lane_pair: parsed }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Actual lane pair updated — Lane Data re-attributed to the new pair");
      setDraftWeekId("");
      qc.invalidateQueries({ queryKey: ["season-match-summary"] });
      qc.invalidateQueries({ queryKey: ["lane-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remapOrphan = useMutation({
    mutationFn: async ({ id, lane }: { id: string; lane: string }) => {
      const { error } = await supabase.from("matches").update({ lane_pair: lane }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lane pair updated — Lane Data re-attributed");
      setDraftWeekId("");
      qc.invalidateQueries({ queryKey: ["season-match-summary"] });
      qc.invalidateQueries({ queryKey: ["lane-stats"] });
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
        <h2 className="mb-1 font-display text-lg uppercase text-foreground">Lane setup</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Enter the first lane of the first pair once. Every weekly matchup slot then uses
          consecutive, non-overlapping pairs.
        </p>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Active teams
            </p>
            <p className="stat-num text-lg">{activeTeams.length}</p>
            <p className="text-[11px] text-muted-foreground">Configured: {season.team_count}</p>
          </div>
          <div>
            <p className="font-display text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Matchups / week
            </p>
            <p className="stat-num text-lg">{slotCount}</p>
            {weekHasBye && <p className="text-[11px] text-gold">+ 1 bye</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="start-lane">Starting lane</Label>
            <Input
              id="start-lane"
              type="number"
              min={1}
              className="w-28"
              value={laneInput}
              onChange={(e) => setLaneDraft(e.target.value)}
            />
          </div>
          <div>
            <p className="font-display text-xs uppercase tracking-[0.14em] text-muted-foreground">
              First pair
            </p>
            <p className="stat-num text-lg">{previewPairs[0] ?? "—"}</p>
          </div>
          <Button onClick={() => saveLaneSetup.mutate()} disabled={saveLaneSetup.isPending}>
            Save lane setup
          </Button>
        </div>
        {!parsedLane && laneInput !== "" && (
          <p className="mt-3 text-sm text-destructive">Starting lane must be a positive whole number.</p>
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          Lane pairs preview:{" "}
          <span className="text-primary">{previewPairs.join(" · ") || "—"}</span>
        </p>
      </section>

      <section className="panel p-6">
        <h2 className="mb-4 font-display text-lg uppercase text-foreground">Week matchups</h2>
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
          <Button
            onClick={() => saveWeek.mutate()}
            disabled={!weekId || Boolean(weekError) || saveWeek.isPending || !activePairs.length}
          >
            {saveWeek.isPending ? "Saving…" : "Save week matchups"}
          </Button>
        </div>

        {!activePairs.length && (
          <p className="text-sm text-gold">Save a starting lane above to build the matchup slots.</p>
        )}
        {weekError && <p className="mb-3 text-sm text-destructive">{weekError}</p>}

        {!!weekId && !!activePairs.length && (
          <div className="space-y-2">
            {sortSlotsForDisplay(weekPlan.slots, (s) => draft[s.lane_pair]?.lane).map((s) => {
              const d = draft[s.lane_pair] ?? {
                a: s.match?.team_a_id ?? "",
                b: s.match?.team_b_id ?? "",
                lane: s.actual_lane_pair,
              };
              const set = (patch: Partial<{ a: string; b: string; lane: string }>) =>
                setDraft((prev) => ({ ...prev, [s.lane_pair]: { ...d, ...patch } }));
              // Raw field text (may be blank while the admin retypes a pair).
              const laneValue = d.lane ?? "";
              // Effective lane used for validation/overrides: blank falls back to stored/default.
              const effectiveLane = resolveActualLane(laneValue, s.actual_lane_pair, s.lane_pair);
              const parsedLanePair = parseLanePair(effectiveLane);
              const isOverride = Boolean(parsedLanePair) && parsedLanePair !== s.lane_pair;
              const laneInvalid = laneValue.trim() !== "" && !parsedLanePair;
              const finalizedLaneChanged = s.locked && parsedLanePair !== s.actual_lane_pair;
              return (
                <div
                  key={s.lane_pair}
                  className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                    isOverride ? "border-gold/60 bg-gold/5" : "border-border"
                  }`}
                >
                  <span className="w-24 shrink-0">
                    <span className="block font-display text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      Default
                    </span>
                    <span className="stat-num text-primary">{s.lane_pair}</span>
                  </span>
                  <div className="shrink-0 space-y-0.5">
                    <span className="block font-display text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      Actual lanes
                    </span>
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Actual lane pair for default ${s.lane_pair}`}
                        className="w-24"
                        value={laneValue}
                        placeholder={s.lane_pair}
                        onChange={(e) => set({ lane: e.target.value })}
                        onBlur={() => {
                          const p = parseLanePair(effectiveLane);
                          if (p && p !== laneValue) set({ lane: p });
                        }}
                      />
                      {isOverride && (
                        <span className="font-display text-[10px] uppercase tracking-[0.12em] text-gold">
                          Override
                        </span>
                      )}
                      {effectiveLane !== s.lane_pair && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (
                              s.locked &&
                              !window.confirm(
                                `Reset lanes on this FINALIZED matchup back to the default ${s.lane_pair}? Scores, teams and results are not changed.`,
                              )
                            )
                              return;
                            if (s.locked && s.match) {
                              setLanePair.mutate({ id: s.match.id, lane: s.lane_pair });
                            }
                            set({ lane: s.lane_pair });
                          }}
                        >
                          Reset to default
                        </Button>
                      )}
                    </div>
                  </div>
                  {s.locked ? (
                    <span className="flex-1">
                      {(s.match as any)?.team_a?.name} vs {(s.match as any)?.team_b?.name}{" "}
                      <span className="ml-2 font-display text-[10px] uppercase tracking-[0.12em] text-gold">
                        Final · scores locked
                      </span>
                      {finalizedLaneChanged && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="ml-3"
                          disabled={!parsedLanePair || setLanePair.isPending}
                          onClick={() => {
                            const ok = window.confirm(
                              `This matchup is FINALIZED. Change its lane pair from ${s.actual_lane_pair} to ${parsedLanePair}? Only lane metadata changes — scores, teams and points stay exactly as they are. Lane Data will re-attribute these games.`,
                            );
                            if (ok && s.match) setLanePair.mutate({ id: s.match.id, lane: parsedLanePair! });
                          }}
                        >
                          Update lanes
                        </Button>
                      )}
                    </span>
                  ) : (
                    <>
                      <select
                        aria-label={`Lanes ${s.lane_pair} team A`}
                        value={d.a}
                        onChange={(e) => set({ a: e.target.value })}
                        className="rounded-md border border-border bg-card px-2 py-2 text-sm"
                      >
                        <option value="">Team A…</option>
                        {activeTeams.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-muted-foreground">vs</span>
                      <select
                        aria-label={`Lanes ${s.lane_pair} team B`}
                        value={d.b}
                        onChange={(e) => set({ b: e.target.value })}
                        className="rounded-md border border-border bg-card px-2 py-2 text-sm"
                      >
                        <option value="">Team B…</option>
                        {activeTeams.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs uppercase text-muted-foreground">
                        {s.match ? s.match.status : !d.a && !d.b ? "Empty slot" : "New"}
                      </span>
                    </>
                  )}
                  {laneInvalid && (
                    <span className="w-full text-xs text-destructive">
                      Use two consecutive lanes, e.g. 31-32 (or just type 31).
                    </span>
                  )}
                </div>
              );
            })}


            {weekHasBye && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border px-3 py-2 text-sm">
                <span className="w-20 font-display text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Bye
                </span>
                <select
                  aria-label="Bye team"
                  value={byeTeam}
                  onChange={(e) => setByeTeam(e.target.value)}
                  disabled={existingBye?.status === "final"}
                  className="rounded-md border border-border bg-card px-2 py-2 text-sm"
                >
                  <option value="">No bye…</option>
                  {activeTeams.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!!weekPlan.orphans.length && (
              <div className="mt-4 rounded-md border border-gold/50 p-3">
                <p className="mb-2 text-sm text-gold">
                  {weekPlan.orphans.length} extra matchup(s) this week have no slot left in the
                  current lane setup. Lane overrides are fine and are shown above — this is a
                  structural conflict (more matchups than slots). Nothing was changed.
                </p>

                <ul className="space-y-2">
                  {weekPlan.orphans.map((m: any) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="stat-num w-20">{m.lane_pair ?? "—"}</span>
                      <span className="flex-1">
                        {m.team_a?.name} vs {m.team_b?.name ?? "Bye"}
                      </span>
                      {m.status === "final" ? (
                        <span className="text-xs uppercase text-gold">Final · locked</span>
                      ) : (
                        <select
                          aria-label={`Remap ${m.lane_pair}`}
                          defaultValue=""
                          onChange={(e) =>
                            e.target.value && remapOrphan.mutate({ id: m.id, lane: e.target.value })
                          }
                          className="rounded-md border border-border bg-card px-2 py-2 text-sm"
                        >
                          <option value="">Move to…</option>
                          {activePairs.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="mb-4 font-display text-lg uppercase text-foreground">Scheduled matchups</h2>


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
