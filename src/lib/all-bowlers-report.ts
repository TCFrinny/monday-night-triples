import { formatAverage } from "@/lib/league";
import { naturalCompare } from "@/lib/standings-order";

export interface AllBowlerReportRow {
  id: string;
  name: string;
  team: string;
  teamName: string | null;
  enteringAverage: string;
  average: string;
  games: number;
  highGame: number | null;
  highSet: number | null;
  isUnrosteredSub: boolean;
}

export function shapeAllBowlersReport(bowlers: any[] | null | undefined, stats: any[] | null | undefined): AllBowlerReportRow[] {
  const statsByBowler = new Map((stats ?? []).map((row) => [row.bowler_id, row]));
  return (bowlers ?? [])
    .filter((bowler) => bowler.is_active !== false)
    .map((bowler) => {
      const currentSpot = (bowler.roster_spots ?? []).find((spot: any) => spot.effective_to_week === null);
      const teamName = currentSpot?.teams?.name ?? null;
      const stat = statsByBowler.get(bowler.id);
      const games = Number(stat?.games) || 0;
      return {
        id: bowler.id,
        name: bowler.full_name,
        team: teamName ?? (bowler.is_sub ? "SUB" : "—"),
        teamName,
        enteringAverage: formatAverage(bowler.entry_average),
        average: games > 0 ? formatAverage(stat?.average) : "—",
        games,
        highGame: games > 0 && Number(stat?.high_game) > 0 ? Number(stat.high_game) : null,
        highSet: games > 0 && Number(stat?.high_set) > 0 ? Number(stat.high_set) : null,
        isUnrosteredSub: !teamName && bowler.is_sub === true,
      };
    })
    .sort((a, b) => {
      if (a.teamName && b.teamName) return naturalCompare(a.teamName, b.teamName) || naturalCompare(a.name, b.name);
      if (a.teamName) return -1;
      if (b.teamName) return 1;
      if (a.isUnrosteredSub !== b.isUnrosteredSub) return a.isUnrosteredSub ? 1 : -1;
      return naturalCompare(a.name, b.name);
    });
}