import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PendingSpec } from "@/components/page-shell";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Stats — Monday Night Triples" },
      { name: "description", content: "League leaders, high games and high series for the Monday Night Triples duckpin league." },
      { property: "og:title", content: "Stats — Monday Night Triples" },
      { property: "og:description", content: "League leaders, high games and high series for the Monday Night Triples duckpin league." },
    ],
  }),
  component: () => (
    <PageShell eyebrow="Leaderboards" title="Stats" description="High games, high series and league leaders.">
      <PendingSpec area="stats" />
    </PageShell>
  ),
});
