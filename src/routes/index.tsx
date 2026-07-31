import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Trophy, Users, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Monday Night Triples — Duckpin League at AMF Dundalk" },
      {
        name: "description",
        content:
          "Standings, schedule, results and stats for the Monday Night Triples duckpin bowling league at AMF Dundalk.",
      },
      { property: "og:title", content: "Monday Night Triples — Duckpin League at AMF Dundalk" },
      {
        property: "og:description",
        content:
          "Standings, schedule, results and stats for the Monday Night Triples duckpin bowling league at AMF Dundalk.",
      },
    ],
  }),
  component: Index,
});

const tiles = [
  { to: "/standings", label: "Standings", icon: Trophy, note: "Team points & position" },
  { to: "/schedule", label: "Schedule", icon: CalendarDays, note: "Weekly match-ups" },
  { to: "/results", label: "Results", icon: BarChart3, note: "Scores by week" },
  { to: "/bowlers", label: "Bowlers", icon: Users, note: "Averages & rosters" },
] as const;

function Index() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-14">
      <section
        className="panel relative overflow-hidden p-8 sm:p-14"
        style={{ backgroundImage: "var(--gradient-lane)" }}
      >
        <p className="eyebrow">AMF Dundalk &middot; Duckpin Triples</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-bold uppercase leading-[0.95] tracking-tight text-foreground sm:text-7xl">
          Monday Night <span className="text-gradient-aqua">Triples</span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          Three bowlers. One lane. Every Monday night. Follow the league standings, weekly
          results and bowler averages all season long.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/standings"
            className="rounded-lg bg-primary px-5 py-3 font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
          >
            View standings
          </Link>
          <Link
            to="/schedule"
            className="rounded-lg border border-gold/60 px-5 py-3 font-display text-sm font-semibold uppercase tracking-wide text-gold transition-colors hover:bg-gold/10"
          >
            This week's schedule
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="panel group p-5 transition-colors hover:border-primary/60"
          >
            <tile.icon className="h-6 w-6 text-primary" />
            <h2 className="mt-4 text-xl font-semibold uppercase text-foreground">{tile.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tile.note}</p>
          </Link>
        ))}
      </section>

      <section className="panel mt-8 p-6">
        <p className="eyebrow">Season setup in progress</p>
        <p className="mt-3 text-sm text-muted-foreground">
          The site shell is live. League format, scoring and handicap rules will be configured
          next, followed by teams, schedule and score entry in the admin area.
        </p>
      </section>
    </div>
  );
}
