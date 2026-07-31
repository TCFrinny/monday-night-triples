import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Monday Night Triples" },
      { name: "description", content: "League administration for Monday Night Triples: teams, schedule and score entry." },
      { property: "og:title", content: "Admin — Monday Night Triples" },
      { property: "og:description", content: "League administration for Monday Night Triples: teams, schedule and score entry." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const modules = [
  { title: "Teams & rosters", note: "Create teams, assign bowlers, manage substitutes." },
  { title: "Schedule builder", note: "Generate weeks, lane assignments and byes." },
  { title: "Score entry", note: "Enter game scores and finalize weekly results." },
  { title: "League settings", note: "Scoring rules, handicap and point structure." },
];

function AdminPage() {
  return (
    <PageShell
      eyebrow="Restricted"
      title="Admin"
      description="League administration. Access control and data entry are set up once the league specification lands."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {modules.map((m) => (
          <div key={m.title} className="panel p-6">
            <h2 className="text-xl font-semibold uppercase text-foreground">{m.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{m.note}</p>
            <p className="mt-4 inline-block rounded-md border border-gold/50 px-2 py-1 font-display text-xs uppercase tracking-widest text-gold">
              Pending spec
            </p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
