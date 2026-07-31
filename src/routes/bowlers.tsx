import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PendingSpec } from "@/components/page-shell";

export const Route = createFileRoute("/bowlers")({
  head: () => ({
    meta: [
      { title: "Bowlers — Monday Night Triples" },
      { name: "description", content: "Bowler averages, games bowled and season totals for the Monday Night Triples league." },
      { property: "og:title", content: "Bowlers — Monday Night Triples" },
      { property: "og:description", content: "Bowler averages, games bowled and season totals for the Monday Night Triples league." },
    ],
  }),
  component: () => (
    <PageShell eyebrow="Individuals" title="Bowlers" description="Averages, games bowled and season totals for every bowler.">
      <PendingSpec area="bowlers" />
    </PageShell>
  ),
});
