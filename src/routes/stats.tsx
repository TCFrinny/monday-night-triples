import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { EmptyState, ScopeTabs } from "@/components/league/ui";
import { activeSeasonQuery, bowlerStatsQuery, teamStatsQuery } from "@/lib/queries";
import { SCOPE_LABELS, formatAverage } from "@/lib/league";
import { pct } from "@/lib/duckpin";
import type { StandingsScope } from "@/lib/league";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Stats & Leaders — Monday Night Triples" },
      {
        name: "description",
        content:
          "Duckpin leaderboards for average, high game, high set, strike percentage, spare conversion, 10-boxes and split conversions.",
      },
      { property: "og:title", content: "Stats & Leaders — Monday Night Triples" },
      {
        property: "og:description",
        content: "Averages, high games and sets, marks, first-ball and split leaderboards.",
      },
    ],
  }),
  component: StatsPage,
});

type Leader = {
  key: string;
  title: string;
  note?: string;
  value: (r: any) => number;
  fmt?: (r: any) => string;
  /** Row qualifies for this board — based on the board's own denominator,
   *  never on the handicap establishment threshold. */
  eligible?: (r: any) => boolean;
};

const num = (v: any) => Number(v) || 0;
const hasGames = (r: any) => num(r.games) > 0;
const hasFrames = (r: any) => num(r.frames) > 0;

const BOWLER_BOARDS: Leader[] = [
  {
    key: "avg",
    title: "Average",
    value: (r) => Number(r.average),
    fmt: (r) => formatAverage(r.average),
    eligible: hasGames,
  },
  { key: "hg", title: "High Game", value: (r) => r.high_game, eligible: hasGames },
  { key: "hs", title: "High Set", value: (r) => r.high_set, eligible: (r) => num(r.sets) > 0 },
  {
    key: "pf",
    title: "Total Pinfall",
    value: (r) => r.pinfall,
    fmt: (r) => num(r.pinfall).toLocaleString(),
    eligible: hasGames,
  },
  {
    key: "strike",
    title: "Strike %",
    value: (r) => pct(r.strikes, r.frames),
    fmt: (r) => `${pct(r.strikes, r.frames)}%`,
    eligible: hasFrames,
  },
  {
    key: "spare",
    title: "Spare %",
    note: "Spares only — ten pins on ball 1 is a strike, never a spare.",
    value: (r) => pct(r.spares, r.spare_attempts),
    fmt: (r) => `${pct(r.spares, r.spare_attempts)}%`,
    eligible: (r) => num(r.spare_attempts) > 0,
  },
  {
    key: "mark",
    title: "Mark %",
    value: (r) => pct(r.strikes + r.spares, r.frames),
    fmt: (r) => `${pct(r.strikes + r.spares, r.frames)}%`,
    eligible: hasFrames,
  },
  {
    key: "tenbox",
    title: "10-Box %",
    note: "Ten pins down using all three balls — scored 10, no bonus.",
    value: (r) => pct(r.ten_boxes, r.frames),
    fmt: (r) => `${pct(r.ten_boxes, r.frames)}%`,
    eligible: hasFrames,
  },
  {
    key: "fb",
    title: "First-Ball Average",
    value: (r) => (r.first_ball_count ? Number(r.first_ball_pins) / r.first_ball_count : 0),
    fmt: (r) =>
      r.first_ball_count ? (Number(r.first_ball_pins) / r.first_ball_count).toFixed(2) : "—",
    eligible: (r) => num(r.first_ball_count) > 0,
  },
  {
    key: "split",
    title: "Split Conversion %",
    value: (r) => pct(r.split_conversions, r.splits),
    fmt: (r) => `${pct(r.split_conversions, r.splits)}% (${r.split_conversions}/${r.splits})`,
    eligible: (r) => num(r.splits) > 0,
  },
  { key: "streak", title: "Longest Strike Streak", value: (r) => r.longest_strike_streak, eligible: hasFrames },
  { key: "clean", title: "Clean Games", value: (r) => r.clean_games, eligible: hasGames },
];

const TEAM_BOARDS: Leader[] = [
  {
    key: "tavg",
    title: "Team Scratch Average",
    value: (r) => Number(r.scratch_avg),
    fmt: (r) => formatAverage(r.scratch_avg),
    eligible: (r) => num(r.matches) > 0,
  },
  {
    key: "thg",
    title: "Team High Scratch Game",
    value: (r) => r.high_scratch_game,
    eligible: (r) => num(r.matches) > 0,
  },
  {
    key: "ths",
    title: "Team High Scratch Set",
    value: (r) => r.high_scratch_set,
    eligible: (r) => num(r.matches) > 0,
  },
  {
    key: "thhs",
    title: "Team High HDCP Set",
    value: (r) => r.high_hdcp_set,
    eligible: (r) => num(r.matches) > 0,
  },
  {
    key: "tstrike",
    title: "Team Strike %",
    value: (r) => pct(r.strikes, r.frames),
    fmt: (r) => `${pct(r.strikes, r.frames)}%`,
    eligible: hasFrames,
  },
  {
    key: "tspare",
    title: "Team Spare %",
    value: (r) => pct(r.spares, r.spare_attempts),
    fmt: (r) => `${pct(r.spares, r.spare_attempts)}%`,
    eligible: (r) => num(r.spare_attempts) > 0,
  },
];

/** Rows that qualify for a board, best first. */
export function boardLeaders(board: Leader, rows: any[], limit = 5) {
  return rows
    .filter((r) => (board.eligible ? board.eligible(r) : true))
    .sort((a, b) => board.value(b) - board.value(a))
    .slice(0, limit);
}


function StatsPage() {
  const { data: season } = useQuery(activeSeasonQuery);
  const [scope, setScope] = useState<StandingsScope>("full");
  const [mode, setMode] = useState<"bowlers" | "teams">("bowlers");
  const { data: bowlerStats } = useQuery(bowlerStatsQuery(season?.id, scope));
  const { data: teamStats } = useQuery(teamStatsQuery(season?.id, scope));

  const minGames = season?.establishment_threshold ?? 15;
  const boards = mode === "bowlers" ? BOWLER_BOARDS : TEAM_BOARDS;
  const rows: any[] = (mode === "bowlers" ? bowlerStats : teamStats) ?? [];

  return (
    <PageShell
      eyebrow={season?.season_name ?? ""}
      title="Stats & Leaders"
      description={`Leaderboards marked with a minimum require ${minGames} games. All figures are scratch unless labelled HDCP.`}
    >
      <div className="mb-5 flex flex-wrap gap-3">
        <ScopeTabs
          value={mode}
          onChange={setMode}
          options={[
            { value: "bowlers", label: "Bowlers" },
            { value: "teams", label: "Teams" },
          ]}
        />
        <ScopeTabs
          value={scope}
          onChange={setScope}
          options={(["third_1", "third_2", "third_3", "full"] as StandingsScope[]).map((s) => ({
            value: s,
            label: SCOPE_LABELS[s],
          }))}
        />
      </div>

      {!rows.length ? (
        <EmptyState title="No statistics yet" hint="Leaderboards populate once matches are finalized." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => {
            const eligible = rows
              .filter((r) => (board.min ? (r.games ?? 0) >= minGames : true))
              .filter((r) => board.value(r) > 0)
              .sort((a, b) => board.value(b) - board.value(a))
              .slice(0, 5);
            return (
              <div key={board.key} className="panel p-5">
                <h2 className="font-display text-base uppercase tracking-wide text-foreground">
                  {board.title}
                </h2>
                {board.note && <p className="mt-1 text-[11px] text-muted-foreground">{board.note}</p>}
                <ol className="mt-3 space-y-1.5 text-sm">
                  {eligible.map((r, i) => (
                    <li key={r.id ?? i} className="flex items-center gap-2">
                      <span className={i === 0 ? "stat-num w-5 text-gold" : "stat-num w-5 text-muted-foreground"}>
                        {i + 1}
                      </span>
                      {mode === "bowlers" ? (
                        <Link
                          to="/bowlers/$slug"
                          params={{ slug: r.bowlers?.slug ?? "" }}
                          className="truncate text-foreground hover:text-primary hover:underline"
                        >
                          {r.bowlers?.full_name ?? "—"}
                        </Link>
                      ) : (
                        <Link
                          to="/teams/$slug"
                          params={{ slug: r.teams?.slug ?? "" }}
                          className="truncate text-foreground hover:text-primary hover:underline"
                        >
                          {r.teams?.name ?? "—"}
                        </Link>
                      )}
                      <span className="ml-auto stat-num text-primary">
                        {board.fmt ? board.fmt(r) : board.value(r)}
                      </span>
                    </li>
                  ))}
                  {!eligible.length && (
                    <li className="text-xs text-muted-foreground">Not enough qualifying data.</li>
                  )}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
