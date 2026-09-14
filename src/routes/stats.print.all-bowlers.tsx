import { createFileRoute } from "@tanstack/react-router";
import { AllBowlersReport } from "@/components/reports/all-bowlers-report";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";

export const Route = createFileRoute("/stats/print/all-bowlers")({
  head: () => ({ meta: [
    { title: `All Bowlers Report — ${DEFAULT_LEAGUE_NAME}` },
    { name: "description", content: "Printable full-season rostered bowler and substitute report." },
    { property: "og:title", content: `All Bowlers Report — ${DEFAULT_LEAGUE_NAME}` },
    { property: "og:description", content: "Printable full-season rostered bowler and substitute report." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AllBowlersReport,
});