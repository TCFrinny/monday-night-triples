import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { scoreGame, type Frame, ballToken } from "@/lib/duckpin";

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("panel p-5", className)}>{children}</div>;
}

export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="mt-1 text-2xl font-semibold uppercase text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="panel p-10 text-center">
      <p className="font-display text-lg uppercase tracking-wide text-foreground">{title}</p>
      {hint && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Stat({
  label,
  value,
  gold,
}: {
  label: string;
  value: ReactNode;
  gold?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={cn("stat-num mt-1 text-xl", gold ? "text-gold" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}

export function ScopeTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; note?: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-secondary/40 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 font-display text-sm uppercase tracking-wide transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
          {o.note && <span className="ml-1.5 text-[10px] opacity-80">{o.note}</span>}
        </button>
      ))}
    </div>
  );
}

export function PositionRoundBadge() {
  return (
    <span className="rounded-md border border-gold/60 bg-gold/10 px-2 py-0.5 font-display text-[11px] uppercase tracking-[0.16em] text-gold">
      Position Round
    </span>
  );
}

export function ParticipationTag({ type }: { type: string }) {
  if (type === "rostered") return null;
  return (
    <span
      className={cn(
        "ml-2 rounded border px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider",
        type === "sub"
          ? "border-primary/60 text-primary"
          : "border-muted-foreground/50 text-muted-foreground",
      )}
    >
      {type === "sub" ? "Sub" : "Blind"}
    </span>
  );
}

export function MovementIndicator({
  rank,
  previous,
}: {
  rank: number;
  previous?: number | null;
}) {
  if (previous === null || previous === undefined) return <span className="text-muted-foreground">—</span>;
  if (rank < previous) return <span className="text-primary">↑</span>;
  if (rank > previous) return <span className="text-destructive">↓</span>;
  return <span className="text-muted-foreground">—</span>;
}

export function TeamLink({ team }: { team: { name: string; slug: string } | null }) {
  if (!team) return <span className="text-muted-foreground">BYE</span>;
  return (
    <Link
      to="/teams/$slug"
      params={{ slug: team.slug }}
      className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
    >
      {team.name}
    </Link>
  );
}

export function BowlerLink({ bowler }: { bowler: { full_name: string; slug: string } | null }) {
  if (!bowler) return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      to="/bowlers/$slug"
      params={{ slug: bowler.slug }}
      className="text-foreground underline-offset-4 hover:text-primary hover:underline"
    >
      {bowler.full_name}
    </Link>
  );
}

/** Read-only duckpin linescore rendered from stored frames + balls. */
export function Linescore({ frames }: { frames: Frame[] }) {
  const scored = scoreGame(frames);
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max">
        {scored.frames.map((f, i) => (
          <div key={f.frameNumber} className="w-[68px] border-b border-l border-border last:border-r">
            <div className="border-b border-border bg-secondary/40 px-1 py-0.5 text-center font-display text-[10px] uppercase text-muted-foreground">
              {f.frameNumber}
            </div>
            <div className="flex h-6">
              {[0, 1, 2].map((b) => (
                <div
                  key={b}
                  className={cn(
                    "flex flex-1 items-center justify-center border-r border-border/70 text-xs last:border-r-0",
                    frames[i]?.balls[b]?.isSplit ? "text-gold" : "text-foreground",
                  )}
                >
                  {ballToken(frames[i] ?? { balls: [] }, i, b)}
                </div>
              ))}
            </div>
            <div className="stat-num py-1 text-center text-sm text-foreground">
              {f.cumulative ?? ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Convert stored frame rows into engine Frame[] */
export function framesFromRows(rows: any[] | null | undefined): Frame[] {
  const frames: Frame[] = Array.from({ length: 10 }, () => ({ balls: [] }));
  for (const r of rows ?? []) {
    const idx = (r.frame_number as number) - 1;
    if (idx < 0 || idx > 9) continue;
    const balls = [...(r.balls ?? [])].sort((a: any, b: any) => a.ball_number - b.ball_number);
    frames[idx] = {
      balls: balls.map((b: any) => (b.is_split ? { pins: b.pins, isSplit: true } : { pins: b.pins })),
    };
  }
  return frames;
}
