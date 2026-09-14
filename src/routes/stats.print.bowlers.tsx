import { createFileRoute } from "@tanstack/react-router";
import { StatsReport } from "@/components/reports/stats-report";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";

export const Route = createFileRoute("/stats/print/bowlers")({
  head: () => ({ meta: [
    { title: `Bowler Stats Report — ${DEFAULT_LEAGUE_NAME}` },
    { name: "description", content: "Printable full-season bowler leaderboards." },
    { property: "og:title", content: `Bowler Stats Report — ${DEFAULT_LEAGUE_NAME}` },
    { property: "og:description", content: "Printable full-season bowler leaderboards." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <StatsReport mode="bowlers" />,
});