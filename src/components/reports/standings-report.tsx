import { useQuery } from "@tanstack/react-query";
import { ReportShell } from "@/components/reports/report-shell";
import { StandingsReportTable } from "@/components/reports/standings-report-table";
import { EmptyState } from "@/components/league/ui";
import { activeSeasonQuery, seasonMatchSummaryQuery, standingsQuery } from "@/lib/queries";
import { SCOPE_LABELS, type StandingsScope } from "@/lib/league";
import { currentThirdScope, latestFinalizedWeek } from "@/lib/report-progress";

export function StandingsReport({ variant }: { variant: "full" | "current-third" }) {
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));
  const scope: StandingsScope = variant === "full"
    ? "full"
    : currentThirdScope(matches, season?.third_boundaries);
  const { data: rows } = useQuery(standingsQuery(season?.id, scope));
  const title = variant === "full"
    ? "Standings — Full Season"
    : `Standings — Current Third · ${SCOPE_LABELS[scope]}`;

  return <ReportShell season={season} title={title} latestWeek={latestFinalizedWeek(matches)} backTo="/standings" orientation="landscape">
    {!season ? <EmptyState title="No active season" hint="This report will be available when a season is active." /> : <StandingsReportTable rows={rows ?? []} />}
  </ReportShell>;
}