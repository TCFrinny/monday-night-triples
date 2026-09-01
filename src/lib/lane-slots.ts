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

/** Builds the week editor rows, keeping existing matches attached to their pair. */
export function buildWeekSlots(pairs: readonly string[], matches: readonly SlotMatch[]): WeekSlotPlan {
  const used = new Set<string>();
  const byPair = new Map<string, SlotMatch>();
  const byes: SlotMatch[] = [];

  for (const m of matches) {
    if (m.is_bye) {
      byes.push(m);
      continue;
    }
    const key = (m.lane_pair ?? "").trim();
    if (key && pairs.includes(key) && !byPair.has(key)) {
      byPair.set(key, m);
      used.add(m.id);
    }
  }

  const slots: LaneSlot[] = pairs.map((lane_pair, index) => {
    const match = byPair.get(lane_pair) ?? null;
    return { lane_pair, index, match, locked: match?.status === "final" };
  });

  const orphans = matches.filter((m) => !m.is_bye && !used.has(m.id));

  return { slots, orphans, byeCount: byes.length };
}

export type SlotAssignment = {
  lane_pair: string;
  team_a_id: string;
  team_b_id: string;
  locked?: boolean;
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
  return null;
}
