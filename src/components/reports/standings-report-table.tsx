import { EmptyState } from "@/components/league/ui";
import {
  formatGamesBehind,
  formatPoints,
  formatRecordValue,
  gamesBehind,
  recordFromPoints,
} from "@/lib/league";
import { orderStandingsRows } from "@/lib/standings-order";

export function StandingsReportTable({ rows: inputRows }: { rows: any[] }) {
  const rows = orderStandingsRows(inputRows);
  if (!rows.length) return <EmptyState title="No standings yet" hint="Standings appear once teams are available." />;
  const leaderRow = rows.find((row) => row.rank === 1) ?? rows[0];
  const leader = recordFromPoints(Number(leaderRow.points), Number(leaderRow.matches_played));
  return (
    <table className="print-standings-table">
      <thead><tr><th>Rank</th><th>Team</th><th className="num">MP</th><th className="num">Pts</th><th className="num">W</th><th className="num">L</th><th className="num">GB</th><th className="num">HDCP Pinfall</th><th className="num">Scratch Pinfall</th></tr></thead>
      <tbody>
        {rows.map((row) => {
          const record = recordFromPoints(Number(row.points), Number(row.matches_played));
          return <tr key={row.id}>
            <td className="rank">{row.rank}</td><td>{row.teams?.name ?? "—"}</td>
            <td className="num">{row.matches_played}</td><td className="num">{formatPoints(Number(row.points))}</td>
            <td className="num">{formatRecordValue(record.wins)}</td><td className="num">{formatRecordValue(record.losses)}</td>
            <td className="num">{row.rank === 1 ? "—" : formatGamesBehind(gamesBehind(leader, record))}</td>
            <td className="num">{Number(row.hdcp_pinfall).toLocaleString()}</td><td className="num">{Number(row.scratch_pinfall).toLocaleString()}</td>
          </tr>;
        })}
      </tbody>
    </table>
  );
}