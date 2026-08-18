import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Panel, PositionRoundBadge, SectionTitle } from "@/components/league/ui";
import {
  activeSeasonQuery,
  bowlersQuery,
  seasonMatchSummaryQuery,
  singlesConfigQuery,
  singlesMatchesQuery,
  singlesParticipantsQuery,
  singlesResultsQuery,
  singlesStandingsQuery,
  weeksQuery,
} from "@/lib/queries";
import { naturalCompare } from "@/lib/standings-order";
import { formatDateOnly } from "@/lib/schedule-dates";
import {
  SINGLES_RULES,
  generateSinglesSchedule,
  isSinglesPositionWeek,
  positionRoundPairings,
  validateActiveWeeks,
} from "@/lib/singles";

export const Route = createFileRoute("/admin/singles")({
  component: AdminSingles,
});

function AdminSingles() {
  const qc = useQueryClient();
  const { data: season } = useQuery(activeSeasonQuery);
  const seasonId = season?.id;
  const { data: weeks } = useQuery(weeksQuery(seasonId));
  const { data: bowlers } = useQuery(bowlersQuery(seasonId));
  const { data: config } = useQuery(singlesConfigQuery(seasonId));
  const { data: participants } = useQuery(singlesParticipantsQuery(seasonId));
  const { data: matches } = useQuery(singlesMatchesQuery(seasonId));
  const { data: results } = useQuery(singlesResultsQuery(seasonId));
  const { data: standings } = useQuery(singlesStandingsQuery(seasonId));
  const { data: triples } = useQuery(seasonMatchSummaryQuery(seasonId));

  const [draftWeeks, setDraftWeeks] = useState<number[] | null>(null);
  const activeWeeks = draftWeeks ?? config?.active_weeks ?? [];
  const positionWeeks = config?.position_weeks ?? SINGLES_RULES.mandatoryPositionWeeks;

  const invalidate = () => {
    for (const k of [
      "singles-config",
      "singles-participants",
      "singles-matches",
      "singles-results",
      "singles-standings",
    ])
      qc.invalidateQueries({ queryKey: [k, seasonId] });
  };

  const enrolled = useMemo(
    () => new Set((participants ?? []).map((p: any) => p.bowler_id as string)),
    [participants],
  );
  const sortedBowlers = useMemo(
    () => [...(bowlers ?? [])].sort((a: any, b: any) => naturalCompare(a.full_name, b.full_name)),
    [bowlers],
  );
  const weekCheck = validateActiveWeeks(
    activeWeeks,
    season?.total_weeks ?? 36,
    config?.required_week_count ?? SINGLES_RULES.requiredActiveWeeks,
    positionWeeks,
  );

  const saveConfig = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("singles_config")
        .upsert({ season_id: seasonId!, ...patch }, { onConflict: "season_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Singles setup saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleParticipant = useMutation({
    mutationFn: async (bowlerId: string) => {
      if (enrolled.has(bowlerId)) {
        const { error } = await supabase
          .from("singles_participants")
          .delete()
          .eq("season_id", seasonId!)
          .eq("bowler_id", bowlerId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("singles_participants")
          .insert({ season_id: seasonId!, bowler_id: bowlerId });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const weekIdOf = (n: number) => (weeks ?? []).find((w: any) => w.week_number === n)?.id as string | undefined;
  const matchesByWeek = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const m of matches ?? []) {
      const n = m.weeks?.week_number as number;
      map.set(n, [...(map.get(n) ?? []), m]);
    }
    return map;
  }, [matches]);
  const resultWeeks = useMemo(
    () => new Set((results ?? []).map((r: any) => r.weeks?.week_number as number)),
    [results],
  );

  /** Generate regular-week matchups. Weeks that already have rows keep their IDs. */
  const generateSchedule = useMutation({
    mutationFn: async () => {
      const ids = sortedBowlers.filter((b: any) => enrolled.has(b.id)).map((b: any) => b.id as string);
      if (ids.length < 2) throw new Error("Enroll at least two bowlers first.");
      if (!weekCheck.ok) throw new Error(weekCheck.errors.join(" "));
      const plan = generateSinglesSchedule(ids, activeWeeks, positionWeeks);
      const rows: any[] = [];
      for (const w of plan) {
        if (w.isPositionRound) continue;
        if ((matchesByWeek.get(w.weekNumber) ?? []).length) continue; // preserve existing IDs
        const weekId = weekIdOf(w.weekNumber);
        if (!weekId) continue;
        w.pairings.forEach((p, i) => {
          rows.push({
            season_id: seasonId!,
            week_id: weekId,
            sort_order: i + 1,
            bowler_a_id: p.a,
            bowler_b_id: p.b,
            is_bye: p.b === null,
            is_position_round: false,
          });
        });
      }
      if (!rows.length) throw new Error("Nothing to generate — every active regular week already has matchups.");
      const { error } = await supabase.from("singles_matches").insert(rows);
      if (error) throw new Error(error.message);
      return rows.length;
    },
    onSuccess: (n) => {
      invalidate();
      toast.success(`${n} Singles matchups generated`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearWeek = useMutation({
    mutationFn: async (weekNumber: number) => {
      if (resultWeeks.has(weekNumber)) throw new Error("That week already has Singles results.");
      const weekId = weekIdOf(weekNumber);
      const { error } = await supabase.from("singles_matches").delete().eq("week_id", weekId!);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Week cleared");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generatePosition = useMutation({
    mutationFn: async (weekNumber: number) => {
      if ((matchesByWeek.get(weekNumber) ?? []).length)
        throw new Error("That position round already has matchups — clear it first.");
      const order = [...(standings ?? [])]
        .sort((a: any, b: any) => a.rank - b.rank || Number(b.pinfall) - Number(a.pinfall))
        .map((r: any) => r.bowler_id as string);
      if (order.length < 2) throw new Error("No Singles standings to pair from yet.");
      const weekId = weekIdOf(weekNumber);
      if (!weekId) throw new Error("Week not found.");
      const rows = positionRoundPairings(order).map((p, i) => ({
        season_id: seasonId!,
        week_id: weekId,
        sort_order: i + 1,
        bowler_a_id: p.a,
        bowler_b_id: p.b,
        is_bye: p.b === null,
        is_position_round: true,
      }));
      const { error } = await supabase.from("singles_matches").insert(rows);
      if (error) throw new Error(error.message);
      return rows.length;
    },
    onSuccess: (n) => {
      invalidate();
      toast.success(`Position round paired (${n} matchups)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("refresh_singles", { p_season_id: seasonId! });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Singles results recalculated from finalized Triples scores");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!season) return <p className="text-sm text-muted-foreground">No active season.</p>;

  const totalWeeks = season.total_weeks;
  const weekNumbers = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  const participantCount = enrolled.size;

  const triplesStatus = (weekNumber: number) => {
    const rows = (triples ?? []).filter((m: any) => m.weeks?.week_number === weekNumber && !m.is_bye);
    const final = rows.filter((m: any) => m.status === "final").length;
    return { total: rows.length, final };
  };

  return (
    <div className="space-y-8">
      {/* A. Setup ------------------------------------------------------- */}
      <Panel>
        <SectionTitle
          eyebrow="A · Singles setup"
          title="Competition rules"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveConfig.mutate({ is_enabled: !(config?.is_enabled ?? true) })}
            >
              {config?.is_enabled === false ? "Enable Singles" : "Disable Singles"}
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
            <p className="eyebrow">Handicap</p>
            <p className="mt-1 text-foreground">
              {SINGLES_RULES.handicapPercent}% of ({config?.handicap_base ?? SINGLES_RULES.handicapBase} − own
              applicable average), rounded down. Never inherited.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
            <p className="eyebrow">Points</p>
            <p className="mt-1 text-foreground">1 point per game, 3 max. No set point. Tied game splits 0.5 / 0.5.</p>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
            <p className="eyebrow">Participants</p>
            <p className="stat-num mt-1 text-2xl text-gold">{participantCount}</p>
            <p className="text-xs text-muted-foreground">
              {participantCount % 2 === 1 ? "Odd — one bye each week" : "Even — no bye"}
            </p>
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionTitle eyebrow="A · Roster" title="Enrolled bowlers" />
        <p className="mb-3 text-sm text-muted-foreground">
          Sourced from the existing Triples bowlers for this season — no separate Singles people.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {sortedBowlers.map((b: any) => (
            <label
              key={b.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary/30"
            >
              <input
                type="checkbox"
                checked={enrolled.has(b.id)}
                onChange={() => toggleParticipant.mutate(b.id)}
              />
              <span className="text-foreground">{b.full_name}</span>
              {b.is_sub && <span className="text-[10px] uppercase text-muted-foreground">sub</span>}
            </label>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionTitle
          eyebrow="A · Calendar"
          title={`Active league weeks (${weekCheck.selectedCount}/${config?.required_week_count ?? SINGLES_RULES.requiredActiveWeeks})`}
          action={
            <Button
              size="sm"
              disabled={!weekCheck.ok || saveConfig.isPending}
              onClick={() => saveConfig.mutate({ active_weeks: [...activeWeeks].sort((a, b) => a - b) })}
            >
              Save weeks
            </Button>
          }
        />
        <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {weekNumbers.map((n) => {
            const w = (weeks ?? []).find((x: any) => x.week_number === n);
            const on = activeWeeks.includes(n);
            const mandatory = isSinglesPositionWeek(n, positionWeeks);
            return (
              <label
                key={n}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary/30"
              >
                <input
                  type="checkbox"
                  checked={on || mandatory}
                  onChange={() =>
                    setDraftWeeks(
                      on && !mandatory ? activeWeeks.filter((x) => x !== n) : [...new Set([...activeWeeks, n])],
                    )
                  }
                />
                <span className="text-foreground">Wk {n}</span>
                <span className="text-xs text-muted-foreground">{formatDateOnly(w?.bowl_date)}</span>
                {mandatory && <span className="ml-auto text-[10px] uppercase text-gold">PR</span>}
              </label>
            );
          })}
        </div>
        {weekCheck.errors.map((e) => (
          <p key={e} className="mt-3 text-sm text-destructive">
            {e}
          </p>
        ))}
      </Panel>

      {/* B. Schedule ---------------------------------------------------- */}
      <Panel>
        <SectionTitle
          eyebrow="B · Schedule"
          title="Singles matchups"
          action={
            <Button size="sm" disabled={generateSchedule.isPending} onClick={() => generateSchedule.mutate()}>
              Generate regular weeks
            </Button>
          }
        />
        <p className="mb-4 text-sm text-muted-foreground">
          No lanes — Singles is bowler vs bowler only. Weeks that already have matchups are left
          untouched so existing matchup IDs survive. Position rounds stay pending until you pair them
          from the standings.
        </p>
        <div className="space-y-2">
          {[...activeWeeks].sort((a, b) => a - b).map((n) => {
            const rows = matchesByWeek.get(n) ?? [];
            const pr = isSinglesPositionWeek(n, positionWeeks);
            return (
              <div key={n} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-display uppercase text-foreground">Week {n}</span>
                  <span className="text-muted-foreground">
                    {formatDateOnly((weeks ?? []).find((w: any) => w.week_number === n)?.bowl_date)}
                  </span>
                  {pr && <PositionRoundBadge />}
                  <span className="text-muted-foreground">
                    {rows.length ? `${rows.length} matchups` : "pending"}
                  </span>
                  <span className="ml-auto flex gap-2">
                    {pr && !rows.length && (
                      <Button size="sm" variant="outline" onClick={() => generatePosition.mutate(n)}>
                        Generate position round from standings
                      </Button>
                    )}
                    {rows.length > 0 && !resultWeeks.has(n) && (
                      <Button size="sm" variant="ghost" onClick={() => clearWeek.mutate(n)}>
                        Clear
                      </Button>
                    )}
                  </span>
                </div>
                {rows.length > 0 && (
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {rows
                      .slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((m) => (
                        <li key={m.id} className="text-muted-foreground">
                          {m.a?.full_name} {m.b ? `vs ${m.b.full_name}` : "— bye"}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* C. Results status ---------------------------------------------- */}
      <Panel>
        <SectionTitle
          eyebrow="C · Results"
          title="Calculation status"
          action={
            <Button size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
              Recalculate Singles
            </Button>
          }
        />
        <p className="mb-4 text-sm text-muted-foreground">
          Singles results are derived from finalized Triples scores. Correcting a Triples match and
          recalculating here rewrites the Singles result without touching the Singles schedule.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="py-2">Week</th>
                <th className="py-2 text-right">Triples finalized</th>
                <th className="py-2 text-right">Singles matchups</th>
                <th className="py-2 text-right">Singles results</th>
              </tr>
            </thead>
            <tbody>
              {[...activeWeeks].sort((a, b) => a - b).map((n) => {
                const st = triplesStatus(n);
                const scheduled = (matchesByWeek.get(n) ?? []).length;
                const computed = (results ?? []).filter((r: any) => r.weeks?.week_number === n).length;
                return (
                  <tr key={n} className="border-b border-border/60 last:border-0">
                    <td className="py-2 text-foreground">Week {n}</td>
                    <td className="py-2 text-right tabular-nums">
                      {st.final}/{st.total}
                    </td>
                    <td className="py-2 text-right tabular-nums">{scheduled}</td>
                    <td className="py-2 text-right tabular-nums">{computed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
