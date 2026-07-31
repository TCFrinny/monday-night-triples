import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  FRAME_COUNT,
  ballDisabled,
  ballToken,
  nextCursor,
  parseBallToken,
  scoreGame,
  type Frame,
} from "@/lib/duckpin";

/**
 * AMF-style duckpin linescore where EVERY BALL BOX IS THE INPUT.
 * There is no whole-game string field. Frames 1-9 take up to three balls;
 * the 10th frame always allows three balls (bonus behaviour handled by the
 * scoring engine in src/lib/duckpin.ts).
 */
export function BallGrid({
  frames,
  onChange,
  disabled,
  gridId,
}: {
  frames: Frame[];
  onChange: (frames: Frame[]) => void;
  disabled?: boolean;
  gridId: string;
}) {
  const scored = scoreGame(frames);
  const [draft, setDraft] = useState<{ key: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const keyFor = (f: number, b: number) => `${gridId}-${f}-${b}`;

  /** Focus is applied after the render that carries the newly committed ball. */
  const pendingFocus = useRef<string | null>(null);
  const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useIsoLayoutEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    const root = containerRef.current;
    if (!root) return;
    const boxes = Array.from(root.querySelectorAll<HTMLInputElement>("input[data-ball]"));
    const start = boxes.findIndex((el) => el.dataset["ball"] === key);
    if (start < 0) return;
    for (let i = start; i < boxes.length; i++) {
      const el = boxes[i]!;
      if (!el.disabled) {
        el.focus();
        el.select();
        return;
      }
    }
  });

  /**
   * Commits a ball and returns the resulting frames, so callers can derive the
   * next legal ball box from the NEW state rather than the stale render.
   */
  const commit = (frameIndex: number, ballIndex: number, raw: string): Frame[] | null => {
    const next = frames.map((f) => ({ balls: f.balls.map((b) => ({ ...b })) }));
    const frame = next[frameIndex]!;
    if (!raw.trim()) {
      // Clearing a ball removes it and everything after it in the frame.
      frame.balls = frame.balls.slice(0, ballIndex);
      setError(null);
      onChange(next);
      return next;
    }
    frame.balls = frame.balls.slice(0, ballIndex);
    const parsed = parseBallToken(raw, next, frameIndex, ballIndex);
    if (parsed.error || !parsed.ball) {
      setError(parsed.error ?? "Invalid entry.");
      return null;
    }
    frame.balls.push(parsed.ball);
    setError(null);
    onChange(next);
    return next;
  };

  return (
    <div>
      <div ref={containerRef} className="overflow-x-auto">
        <div className="flex min-w-max">
          {Array.from({ length: FRAME_COUNT }, (_, i) => {
            const frame = frames[i] ?? { balls: [] };
            const sf = scored.frames[i]!;
            return (
              <div
                key={i}
                className={cn(
                  "w-[84px] border-b border-l border-border last:border-r",
                  sf.outcome === "ten_box" && "bg-gold/5",
                )}
              >
                <div className="flex items-center justify-center gap-1 border-b border-border bg-secondary/40 px-1 py-0.5 font-display text-[10px] uppercase text-muted-foreground">
                  {i + 1}
                  {sf.outcome === "ten_box" && <span className="text-gold">10-box</span>}
                </div>
                <div className="flex h-8">
                  {[0, 1, 2].map((b) => {
                    const k = keyFor(i, b);
                    const isDisabled = Boolean(disabled) || ballDisabled(frame, i, b);
                    const value =
                      draft && draft.key === k ? draft.value : ballToken(frame, i, b);
                    return (
                      <input
                        key={b}
                        data-ball={k}
                        disabled={isDisabled}
                        value={value}
                        aria-label={`Frame ${i + 1} ball ${b + 1}`}
                        onFocus={(e) => {
                          setDraft({ key: k, value: ballToken(frame, i, b) });
                          e.currentTarget.select();
                        }}
                        onChange={(e) => setDraft({ key: k, value: e.target.value })}
                        onBlur={(e) => {
                          const v = e.target.value;
                          setDraft(null);
                          commit(i, b, v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== "Tab") return;
                          // Shift+Tab keeps native backward navigation.
                          if (e.key === "Tab" && e.shiftKey) {
                            setDraft(null);
                            commit(i, b, (e.target as HTMLInputElement).value);
                            return;
                          }
                          const v = (e.target as HTMLInputElement).value;
                          e.preventDefault();
                          setDraft(null);
                          const next = commit(i, b, v);
                          if (!next) return;
                          const cursor = nextCursor(next, i, b);
                          if (cursor)
                            pendingFocus.current = keyFor(cursor.frameIndex, cursor.ballIndex);
                        }}
                        className={cn(
                          "w-full flex-1 border-r border-border/70 bg-transparent text-center text-xs uppercase outline-none last:border-r-0 focus:bg-primary/15",
                          frame.balls[b]?.isSplit ? "text-gold" : "text-foreground",
                          isDisabled && "bg-secondary/30 text-muted-foreground/40",
                        )}
                      />
                    );
                  })}
                </div>
                <div className="stat-num border-t border-border/70 py-1 text-center text-sm text-foreground">
                  {sf.cumulative ?? ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
