import { createFileRoute } from "@tanstack/react-router";
import { StandingsReport } from "@/components/reports/standings-report";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";

export const Route = createFileRoute("/standings/print/current-third")({
  head: () => ({ meta: [
    { title: `Current Third Standings — ${DEFAULT_LEAGUE_NAME}` },
    { name: "description", content: "Printable standings for the current league third." },
    { property: "og:title", content: `Current Third Standings — ${DEFAULT_LEAGUE_NAME}` },
    { property: "og:description", content: "Printable standings for the current league third." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <StandingsReport variant="current-third" />,
});