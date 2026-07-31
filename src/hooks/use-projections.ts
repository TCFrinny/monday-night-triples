import { useQuery } from "@tanstack/react-query";
import { activeSeasonQuery, bowlerStatsQuery, teamsQuery } from "@/lib/queries";
import { applicableAverage, teamAverage, teamHandicap, truncateAverage } from "@/lib/league";

export interface BowlerProjection {
  id: string;
  full_name: string;
  slug: string;
  entryAverage: number;
  currentAverage: number | null;
  games: number;
  applicable: number;
  source: "entry" | "current";
}

/**
 * Projected applicable averages for every team's three active rostered bowlers.
 * Used for upcoming schedule handicaps only — finalized matches store the real
 * snapshot values and are never recomputed from these.
 */
export function useProjections() {
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: teams } = useQuery(teamsQuery(season?.id));
  const { data: stats } = useQuery(bowlerStatsQuery(season?.id, "full"));

  const threshold = season?.establishment_threshold ?? 15;
  const statByBowler = new Map<string, any>();
  for (const s of stats ?? []) statByBowler.set(s.bowler_id, s);

  const teamMap = new Map<
    string,
    { average: number; bowlers: BowlerProjection[]; name: string; slug: string }
  >();

  for (const t of teams ?? []) {
    const active = (t.roster_spots ?? [])
      .filter((r: any) => r.effective_to_week === null && r.bowlers)
      .sort((a: any, b: any) => a.slot - b.slot);
    const bowlers: BowlerProjection[] = active.map((r: any) => {
      const st = statByBowler.get(r.bowlers.id);
      const games = st?.games ?? 0;
      const current = games > 0 ? Number(st.average) : null;
      const { value, source } = applicableAverage({
        entryAverage: Number(r.bowlers.entry_average),
        currentAverage: current,
        gamesBefore: games,
        threshold,
      });
      return {
        id: r.bowlers.id,
        full_name: r.bowlers.full_name,
        slug: r.bowlers.slug,
        entryAverage: Number(r.bowlers.entry_average),
        currentAverage: current,
        games,
        applicable: value,
        source,
      };
    });
    teamMap.set(t.id, {
      name: t.name,
      slug: t.slug,
      average: teamAverage(bowlers.map((b) => b.applicable)),
      bowlers,
    });
  }

  const projectHandicap = (teamAId: string, teamBId: string | null) => {
    const a = teamMap.get(teamAId);
    const b = teamBId ? teamMap.get(teamBId) : undefined;
    if (!a || !b) return null;
    const result = teamHandicap(a.average, b.average, Number(season?.handicap_percent ?? 80));
    return {
      averageA: a.average,
      averageB: b.average,
      pins: result.pins,
      receiving: result.receivingSide,
      receivingTeam: result.receivingSide === "a" ? a : result.receivingSide === "b" ? b : null,
    };
  };

  return { season, teamMap, projectHandicap, truncateAverage };
}
