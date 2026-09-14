import { createFileRoute } from "@tanstack/react-router";
import { StandingsReport } from "@/components/reports/standings-report";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";

export const Route = createFileRoute("/standings/print/full")({
  head: () => ({ meta: [
    { title: `Full Season Standings — ${DEFAULT_LEAGUE_NAME}` },
    { name: "description", content: "Printable full-season league standings." },
    { property: "og:title", content: `Full Season Standings — ${DEFAULT_LEAGUE_NAME}` },
    { property: "og:description", content: "Printable full-season league standings." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <StandingsReport variant="full" />,
});