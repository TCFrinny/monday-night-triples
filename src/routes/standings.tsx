import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PendingSpec } from "@/components/page-shell";

export const Route = createFileRoute("/standings")({
  head: () => ({
    meta: [
      { title: "Standings — Monday Night Triples" },
      { name: "description", content: "Team standings and points for the Monday Night Triples duckpin league at AMF Dundalk." },
      { property: "og:title", content: "Standings — Monday Night Triples" },
      { property: "og:description", content: "Team standings and points for the Monday Night Triples duckpin league at AMF Dundalk." },
    ],
  }),
  component: () => (
    <PageShell eyebrow="League table" title="Standings" description="Team points, wins and position through the current week.">
      <PendingSpec area="standings" />
    </PageShell>
  ),
});
