import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/page-shell";
import { LaneData } from "@/components/league/lane-data";
import { activeSeasonQuery, seasonMatchSummaryQuery } from "@/lib/queries";
import { finalizedWeeks } from "@/lib/leaderboards";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";

export const Route = createFileRoute("/lane-data")({
  head: () => ({
    meta: [
      { title: `Lane Data — ${DEFAULT_LEAGUE_NAME}` },
      {
        name: "description",
        content:
          "Lane-pair performance for the duckpin league: pair average, POA, strike, spare, open and 10-box rates, pins lost per game and high game by lane.",
      },
      { property: "og:title", content: `Lane Data — ${DEFAULT_LEAGUE_NAME}` },
      {
        property: "og:description",
        content:
          "How each lane pair plays: pair average, POA, first-ball average, strike/spare/open rates and high game across the season, thirds and weeks.",
      },
    ],
  }),
  component: LaneDataPage,
});

function LaneDataPage() {
  const { data: season } = useQuery(activeSeasonQuery);
  const { data: matches } = useQuery(seasonMatchSummaryQuery(season?.id));
  const weeks = finalizedWeeks(matches as any);

  return (
    <PageShell
      eyebrow={season?.season_name ?? ""}
      title="Lane Data"
      description="How each lane pair is playing, from finalized non-bye matches only."
    >
      <LaneData seasonId={season?.id} weeks={weeks} />
    </PageShell>
  );
}
