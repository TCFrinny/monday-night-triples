import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PendingSpec } from "@/components/page-shell";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule — Monday Night Triples" },
      { name: "description", content: "Weekly match-ups and lane assignments for the Monday Night Triples duckpin league." },
      { property: "og:title", content: "Schedule — Monday Night Triples" },
      { property: "og:description", content: "Weekly match-ups and lane assignments for the Monday Night Triples duckpin league." },
    ],
  }),
  component: () => (
    <PageShell eyebrow="Season calendar" title="Schedule" description="Week-by-week match-ups and lane assignments.">
      <PendingSpec area="schedule" />
    </PageShell>
  ),
});
