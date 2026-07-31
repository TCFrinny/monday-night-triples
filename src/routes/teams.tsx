import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PendingSpec } from "@/components/page-shell";

export const Route = createFileRoute("/teams")({
  head: () => ({
    meta: [
      { title: "Teams — Monday Night Triples" },
      { name: "description", content: "Team rosters and profiles for the Monday Night Triples duckpin league at AMF Dundalk." },
      { property: "og:title", content: "Teams — Monday Night Triples" },
      { property: "og:description", content: "Team rosters and profiles for the Monday Night Triples duckpin league at AMF Dundalk." },
    ],
  }),
  component: () => (
    <PageShell eyebrow="Rosters" title="Teams" description="Every triples team in the league and who bowls for them.">
      <PendingSpec area="teams" />
    </PageShell>
  ),
});
