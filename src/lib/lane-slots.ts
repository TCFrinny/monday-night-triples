/**
 * Lane-pair slot planning for Admin → Schedule.
 *
 * The league bowls on consecutive, non-overlapping lane pairs starting at a
 * configured lane (seasons.starting_lane_number). Everything here is pure so
 * it can be unit-tested without a database.
 */

export type SlotMatch = {
  id: string;
  lane_pair: string | null;
  status?: string | null;
  team_a_id?: string | null;
  team_b_id?: string | null;
  is_bye?: boolean | null;
  sort_order?: number | null;
};

export type LaneSlot = {
  /** Generated (season default) pair for this slot. */
  lane_pair: string;
  index: number;
  match: SlotMatch | null;
  locked: boolean;
  /** The pair actually stored on the match, or the default for empty slots. */
  actual_lane_pair: string;
  /** True when the stored pair differs from the generated default. */
  overridden: boolean;
};

export type WeekSlotPlan = {
  slots: LaneSlot[];
  /** Existing matches that could not be placed in any slot (structural conflict). */
  orphans: SlotMatch[];
  byeCount: number;
};


/** Parses admin input into a positive integer lane number, or null. */
export function parseStartingLane(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** Label for a pair whose first lane is `lane`, e.g. 25 → "25-26". */
export function lanePairLabel(lane: number): string {
  return `${lane}-${lane + 1}`;
}

/** Number of simultaneous matchups per week for a given team count. */
export function matchupsPerWeek(teamCount: number): number {
  if (!Number.isFinite(teamCount) || teamCount < 2) return 0;
  return Math.floor(teamCount / 2);
}

/** True when one team sits out each week (odd field). */
export function hasBye(teamCount: number): boolean {
  return teamCount > 0 && teamCount % 2 === 1;
}

/** Consecutive non-overlapping pair labels: 25 → 25-26, 27-28, 29-30 … */
export function laneSlots(startingLane: number | null, count: number): string[] {
  const start = parseStartingLane(startingLane);
  if (!start || count <= 0) return [];
  return Array.from({ length: count }, (_, i) => lanePairLabel(start + i * 2));
}

/**
 * Parses an admin lane-pair override into the canonical `N-(N+1)` label.
 * Accepts a single first-lane number ("31") or a full pair ("31-32", " 31 - 32 ").
 * Returns null for non-consecutive, non-positive or unparsable input.
 * Pairs outside the generated season slots are valid (lane maintenance).
 */
export function parseLanePair(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const single = /^(\d+)$/.exec(raw);
  if (single) {
    const n = Number(single[1]);
    return n >= 1 ? lanePairLabel(n) : null;
  }
  const pair = /^(\d+)\s*[-–]\s*(\d+)$/.exec(raw);
  if (!pair) return null;
  const a = Number(pair[1]);
  const b = Number(pair[2]);
  if (a < 1 || b !== a + 1) return null;
  return lanePairLabel(a);
}

/** Builds the week editor rows, keeping existing matches attached to their slot. */
export function buildWeekSlots(pairs: readonly string[], matches: readonly SlotMatch[]): WeekSlotPlan {
  const used = new Set<string>();
  const bySlot = new Map<number, SlotMatch>();
  const byes: SlotMatch[] = [];
  const pending: SlotMatch[] = [];

  // Pass 1 — matches sitting on their generated default pair keep that slot.
  for (const m of matches) {
    if (m.is_bye) {
      byes.push(m);
      continue;
    }
    const key = (m.lane_pair ?? "").trim();
    const idx = pairs.indexOf(key);
    if (key && idx >= 0 && !bySlot.has(idx)) {
      bySlot.set(idx, m);
      used.add(m.id);
    } else {
      pending.push(m);
    }
  }

  // Pass 2 — overridden lanes stay attached to their slot via sort_order,
  // otherwise the first free slot. They are intentional overrides, not orphans.
  for (const m of pending) {
    const preferred = (m.sort_order ?? 0) - 1;
    let idx = preferred >= 0 && preferred < pairs.length && !bySlot.has(preferred) ? preferred : -1;
    if (idx < 0) {
      for (let i = 0; i < pairs.length; i++) {
        if (!bySlot.has(i)) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) continue; // no slot left: a true structural conflict
    bySlot.set(idx, m);
    used.add(m.id);
  }

  const slots: LaneSlot[] = pairs.map((lane_pair, index) => {
    const match = bySlot.get(index) ?? null;
    const stored = (match?.lane_pair ?? "").trim();
    const actual = stored || lane_pair;
    return {
      lane_pair,
      index,
      match,
      locked: match?.status === "final",
      actual_lane_pair: actual,
      overridden: Boolean(match) && actual !== lane_pair,
    };
  });

  const orphans = matches.filter((m) => !m.is_bye && !used.has(m.id));

  return { slots, orphans, byeCount: byes.length };
}

export type SlotAssignment = {
  lane_pair: string;
  team_a_id: string;
  team_b_id: string;
  locked?: boolean;
  /** Actual lane pair used that week (override), when different from the default. */
  actual_lane_pair?: string | null;
};

/** Validates the week's slot assignments. Returns a message, or null when valid. */
export function validateWeekAssignments(
  assignments: readonly SlotAssignment[],
  byeTeamId?: string | null,
): string | null {
  const seen = new Map<string, string>();
  for (const a of assignments) {
    if (a.locked) continue;
    if (!a.team_a_id && !a.team_b_id) continue;
    if (!a.team_a_id || !a.team_b_id) {
      return `Lanes ${a.lane_pair}: choose both teams (or leave the slot empty).`;
    }
    if (a.team_a_id === a.team_b_id) {
      return `Lanes ${a.lane_pair}: a team cannot bowl itself.`;
    }
    for (const id of [a.team_a_id, a.team_b_id]) {
      const prev = seen.get(id);
      if (prev) return `A team is scheduled twice this week (lanes ${prev} and ${a.lane_pair}).`;
      seen.set(id, a.lane_pair);
    }
  }
  if (byeTeamId) {
    const prev = seen.get(byeTeamId);
    if (prev) return `The bye team is also scheduled on lanes ${prev}.`;
  }
  return validateActualLanes(assignments);
}

/**
 * Actual (possibly overridden) lane pairs must be valid and unique within a week.
 * Empty slots and byes carry no lane. Locked rows are included because a finalized
 * match still occupies its lane pair.
 */
export function validateActualLanes(
  assignments: readonly Pick<
    SlotAssignment,
    "lane_pair" | "actual_lane_pair" | "team_a_id" | "team_b_id" | "locked"
  >[],
): string | null {
  const seen = new Map<string, string>();
  for (const a of assignments) {
    const occupied = a.locked || (a.team_a_id && a.team_b_id);
    if (!occupied) continue;
    const raw = a.actual_lane_pair ?? a.lane_pair;
    const parsed = parseLanePair(raw);
    if (!parsed) {
      return `Actual lanes "${String(raw)}" is not a valid pair — use two consecutive lanes, e.g. 31-32.`;
    }
    const prev = seen.get(parsed);
    if (prev) {
      return `Lanes ${parsed} are assigned to two matchups this week (default slots ${prev} and ${a.lane_pair}).`;
    }
    seen.set(parsed, a.lane_pair);
  }
  return null;
}

