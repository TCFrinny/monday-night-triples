import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/league/ui";
import { ReportShell } from "@/components/reports/report-shell";
import { shapeAllBowlersReport } from "@/lib/all-bowlers-report";
import { activeSeasonQuery, bowlerStatsQuery, bowlersQuery, seasonMatchSummaryQuery } from "@/lib/queries";
import { latestFinalizedWeek } from "@/lib/report-progress";

export function AllBowlersReport() {
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: bowlers } = useQuery(bowlersQuery(season?.id));
  const { data: stats } = useQuery(bowlerStatsQuery(season?.id, "full"));
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));
  const rows = shapeAllBowlersReport(bowlers, stats);

  return <ReportShell season={season} title="All Bowlers · Full Season" latestWeek={latestFinalizedWeek(matches)} backTo="/stats" orientation="landscape" reportType="all-bowlers">
    {!rows.length ? <EmptyState title="No active bowlers" hint="Bowlers will appear when they are active in this season." /> : (
      <table className="print-all-bowlers-table">
        <thead><tr><th>Name</th><th>Team</th><th className="num entering-average">Entering Average</th><th className="num">Average</th><th className="num">Games</th><th className="num">High Game</th><th className="num">High Set</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td>{row.name}</td><td>{row.team}</td><td className="num">{row.enteringAverage}</td><td className="num">{row.average}</td><td className="num">{row.games}</td><td className="num">{row.highGame ?? "—"}</td><td className="num">{row.highSet ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    )}
  </ReportShell>;
}