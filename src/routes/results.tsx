import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PendingSpec } from "@/components/page-shell";

export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "Results — Monday Night Triples" },
      { name: "description", content: "Weekly game scores and match results from the Monday Night Triples duckpin league." },
      { property: "og:title", content: "Results — Monday Night Triples" },
      { property: "og:description", content: "Weekly game scores and match results from the Monday Night Triples duckpin league." },
    ],
  }),
  component: () => (
    <PageShell eyebrow="Weekly scores" title="Results" description="Game-by-game scores and match outcomes.">
      <PendingSpec area="results" />
    </PageShell>
  ),
});
