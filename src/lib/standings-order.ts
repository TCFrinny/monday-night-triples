/**
 * Preseason standings ordering.
 *
 * Cache rows are ranked by the normal standings logic (points, then HDCP
 * pinfall). Before any match in the selected scope has been played every row
 * is tied at zero, so the cache rank is arbitrary. In that case we present
 * teams in natural alphanumeric name order ("2 Team" before "10 Team") and
 * renumber the displayed rank 1..N. Once any matches are played the cache
 * ordering and tiebreakers are used untouched.
 */

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a ?? "", b ?? "");
}

export type StandingsRowLike = {
  matches_played?: number | string | null;
  rank?: number | null;
  teams?: { name?: string | null } | null;
};

export function isPreseasonStandings(rows: readonly StandingsRowLike[] | null | undefined): boolean {
  if (!rows || rows.length === 0) return false;
  return rows.every((r) => Number(r.matches_played ?? 0) === 0);
}

export function orderStandingsRows<T extends StandingsRowLike>(
  rows: readonly T[] | null | undefined,
): T[] {
  const list = [...(rows ?? [])];
  if (!isPreseasonStandings(list)) return list;
  list.sort((a, b) => collator.compare(a.teams?.name ?? "", b.teams?.name ?? ""));
  return list.map((row, i) => ({ ...row, rank: i + 1, previous_rank: null }) as T);
}
