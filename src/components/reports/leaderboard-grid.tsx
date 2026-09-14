import { Link } from "@tanstack/react-router";
import {
  boardLeaders,
  milestoneBoard,
  milestoneLeaders,
  type Leader,
  type PerformanceEvent,
} from "@/lib/leaderboards";

export function LeaderboardGrid({
  boards,
  rows,
  mode,
  eventsFor,
  includeSubs = false,
  printable = false,
  showEventWeeks = true,
}: {
  boards: Leader[];
  rows: any[];
  mode: "bowlers" | "teams";
  eventsFor: (kind: string) => PerformanceEvent[];
  includeSubs?: boolean;
  printable?: boolean;
  showEventWeeks?: boolean;
}) {
  return <div className={printable ? "print-leaderboard-grid" : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"}>
    {boards.map((board) => {
      const milestone = milestoneBoard(board.key);
      const entries = milestone
        ? milestoneLeaders(milestone, eventsFor(milestone.kind), { includeSubs })
        : boardLeaders(board, rows, 5, { includeSubs });
      return <section key={board.key} className={printable ? "print-leaderboard-card" : "panel p-5"}>
        <h2 className="font-display text-base uppercase tracking-wide text-foreground">{board.title}</h2>
        {milestone ? <p className="mt-1 text-[11px] text-muted-foreground">Top 5, plus every {milestone.threshold}+ performance in this scope.</p> : board.note ? <p className="mt-1 text-[11px] text-muted-foreground">{board.note}</p> : null}
        <ol className="mt-3 space-y-1.5 text-sm">
          {entries.map((entry: any, index) => {
            const isBowler = milestone ? milestone.entity === "bowler" : mode === "bowlers";
            const name = milestone
              ? (isBowler ? entry.full_name : entry.name)
              : (isBowler ? entry.bowlers?.full_name : entry.teams?.name);
            const slug = milestone
              ? entry.slug
              : (isBowler ? entry.bowlers?.slug : entry.teams?.slug);
            const value = milestone ? entry.score : (board.fmt ? board.fmt(entry) : board.value(entry));
            return <li key={milestone ? entry.event_id : entry.id ?? index} className="flex items-center gap-2">
              <span className={index === 0 ? "stat-num w-5 text-gold" : "stat-num w-5 text-muted-foreground"}>{index + 1}</span>
              {printable ? <span className="truncate text-foreground">{name ?? "—"}</span> : isBowler ? (
                <Link to="/bowlers/$slug" params={{ slug: slug ?? "" }} className="truncate text-foreground hover:text-primary hover:underline">{name ?? "—"}</Link>
              ) : (
                <Link to="/teams/$slug" params={{ slug: slug ?? "" }} className="truncate text-foreground hover:text-primary hover:underline">{name ?? "—"}</Link>
              )}
              {milestone && showEventWeeks && entry.week_number != null && <span className="shrink-0 text-[11px] text-muted-foreground">Week {entry.week_number}</span>}
              <span className="ml-auto flex items-center gap-1.5">
                {milestone && Number(entry.score) >= milestone.threshold && <span className="milestone-label">{milestone.threshold}+</span>}
                <span className="stat-num text-primary">{value}</span>
              </span>
            </li>;
          })}
          {!entries.length && <li className="text-xs text-muted-foreground">No data yet.</li>}
        </ol>
      </section>;
    })}
  </div>;
}