import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { EmptyState, PositionRoundBadge, ScopeTabs, TeamLink } from "@/components/league/ui";
import { activeSeasonQuery, rosterSpotsQuery, seasonMatchSummaryQuery, weeksQuery } from "@/lib/queries";
import { rosterForWeek, type RosterSpotRow } from "@/lib/roster";
import { useProjections } from "@/hooks/use-projections";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";
import { formatDateOnly } from "@/lib/schedule-dates";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: `Schedule — ${DEFAULT_LEAGUE_NAME}` },
      {
        name: "description",
        content:
          `Weekly match-ups by lane pair, projected handicaps and position rounds for the ${DEFAULT_LEAGUE_NAME} duckpin league.`,
      },
      { property: "og:title", content: `Schedule — ${DEFAULT_LEAGUE_NAME}` },
      {
        property: "og:description",
        content: "Weekly match-ups by lane pair, projected handicaps and position rounds.",
      },
    ],
  }),
  component: SchedulePage,
});

function RosterLine({
  team,
  spots,
  week,
}: {
  team: any;
  spots: RosterSpotRow[] | undefined;
  week: number;
}) {
  if (!team) return null;
  const names = rosterForWeek(spots, team.id, week)
    .map((s) => s?.bowlers?.full_name)
    .filter(Boolean);
  if (!names.length) return null;
  return (
    <span className="text-[11px] text-muted-foreground">
      {team.name}: {names.join(" · ")}
    </span>
  );
}

function MatchRow({
  match,
  projected,
  spots,
}: {
  match: any;
  projected: any;
  spots: RosterSpotRow[] | undefined;
}) {
  const hdcpLabel = match.status === "final"
    ? match.handicap_pins > 0
      ? `HDCP: ${match.handicap_team_id === match.team_a?.id ? match.team_a?.name : match.team_b?.name} +${match.handicap_pins}`
      : "HDCP: none"
    : projected
      ? projected.pins > 0
        ? `HDCP: ${projected.receivingTeam?.name} +${projected.pins}`
        : "HDCP: none"
      : "HDCP: —";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-5 py-3 last:border-0">
      <span className="stat-num w-20 text-sm text-primary">{match.lane_pair ?? "—"}</span>
      <div className="min-w-[220px] flex-1">
        <TeamLink team={match.team_a} />
        <span className="mx-2 text-muted-foreground">vs</span>
        {match.is_bye ? <span className="text-muted-foreground">BYE</span> : <TeamLink team={match.team_b} />}
      </div>
      <span className="text-xs text-muted-foreground">
        {projected && match.status !== "final"
          ? `Avg ${projected.averageA} – ${projected.averageB}`
          : match.team_a_average
            ? `Avg ${match.team_a_average} – ${match.team_b_average}`
            : ""}
      </span>
      <span className="font-display text-xs uppercase tracking-wide text-gold">{hdcpLabel}</span>
      <div className="flex w-full flex-wrap gap-x-6">
        <RosterLine team={match.team_a} spots={spots} week={match.weeks?.week_number ?? 1} />
        {!match.is_bye && (
          <RosterLine team={match.team_b} spots={spots} week={match.weeks?.week_number ?? 1} />
        )}
      </div>
      {match.status === "final" ? (
        <Link
          to="/match/$matchId"
          params={{ matchId: match.id }}
          className="font-display text-xs uppercase tracking-wide text-primary hover:underline"
        >
          {match.points_a} — {match.points_b} · Result
        </Link>
      ) : (
        <span className="font-display text-xs uppercase tracking-wide text-muted-foreground">
          {match.status === "in_progress" ? "In progress" : "Scheduled"}
        </span>
      )}
    </div>
  );
}

function SchedulePage() {
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: weeks } = useQuery(weeksQuery(season?.id));
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));
  const { data: spots } = useQuery(rosterSpotsQuery(season?.id));
  const { projectHandicap } = useProjections();
  const [view, setView] = useState<"week" | "full">("week");

  const byWeek = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const m of matches ?? []) {
      const wn = m.weeks.week_number as number;
      if (!map.has(wn)) map.set(wn, []);
      map.get(wn)!.push(m);
    }
    return map;
  }, [matches]);

  const firstIncomplete =
    (weeks ?? []).find((w: any) => {
      const list = byWeek.get(w.week_number) ?? [];
      return list.length === 0 || list.some((m: any) => m.status !== "final");
    })?.week_number ??
    (weeks ?? [])[0]?.week_number ??
    1;

  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const current = weekNumber ?? firstIncomplete;
  const week = (weeks ?? []).find((w: any) => w.week_number === current);

  if (!season || !(weeks ?? []).length) {
    return (
      <PageShell eyebrow="Season calendar" title="Schedule">
        <EmptyState
          title="No schedule yet"
          hint="An administrator can create weeks and enter lane assignments from the official league document."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={`${season.season_name} · ${season.total_weeks} weeks`}
      title="Schedule"
      description="Grouped by lane pair. Lane assignments come from the official league document."
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ScopeTabs
          value={view}
          onChange={setView}
          options={[
            { value: "week", label: "Week View" },
            { value: "full", label: "Full Schedule" },
          ]}
        />
        {view === "week" && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekNumber(Math.max(1, current - 1))}
              className="rounded-md border border-border p-2 text-foreground hover:bg-secondary"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              value={current}
              onChange={(e) => setWeekNumber(Number(e.target.value))}
              className="rounded-md border border-border bg-card px-3 py-2 font-display text-sm uppercase text-foreground"
            >
              {(weeks ?? []).map((w: any) => (
                <option key={w.id} value={w.week_number}>
                  Week {w.week_number}
                  {w.is_position_round ? " · Position Round" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setWeekNumber(Math.min(season.total_weeks, current + 1))}
              className="rounded-md border border-border p-2 text-foreground hover:bg-secondary"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {view === "week" ? (
        <WeekBlock
          week={week}
          matches={byWeek.get(current) ?? []}
          projectHandicap={projectHandicap}
          spots={spots as any}
        />
      ) : (
        <div className="space-y-6">
          {(weeks ?? []).map((w: any) => (
            <WeekBlock
              key={w.id}
              week={w}
              matches={byWeek.get(w.week_number) ?? []}
              projectHandicap={projectHandicap}
              spots={spots as any}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function WeekBlock({
  week,
  matches,
  projectHandicap,
  spots,
}: {
  week: any;
  matches: any[];
  projectHandicap: (a: string, b: string | null) => any;
  spots: RosterSpotRow[] | undefined;
}) {
  if (!week) return <EmptyState title="Week not found" />;
  return (
    <div className={week.is_position_round ? "panel overflow-hidden border-gold/60" : "panel overflow-hidden"}>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <h2 className="font-display text-lg uppercase tracking-wide text-foreground">
          Week {week.week_number}
        </h2>
        {week.bowl_date && (
          <span className="text-xs text-muted-foreground">
            {formatDateOnly(week.bowl_date)}
          </span>
        )}
        {week.is_position_round && <PositionRoundBadge />}
      </div>
      {matches.length ? (
        matches.map((m) => (
          <MatchRow
            key={m.id}
            match={m}
            spots={spots}
            projected={projectHandicap(m.team_a?.id, m.team_b?.id ?? null)}
          />
        ))
      ) : (
        <p className="px-5 py-6 text-sm text-muted-foreground">No match-ups entered for this week.</p>
      )}
    </div>
  );
}
