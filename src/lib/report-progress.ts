import { scopeForThird, thirdForWeek, type StandingsScope } from "@/lib/league";

export interface SeasonProgressMatch {
  status?: string | null;
  weeks?: { week_number?: number | null } | null;
}

export function latestFinalizedWeek(matches: readonly SeasonProgressMatch[] | null | undefined): number {
  return (matches ?? [])
    .filter((match) => match.status === "final")
    .reduce((latest, match) => Math.max(latest, Number(match.weeks?.week_number) || 0), 0);
}

export function currentThirdScope(
  matches: readonly SeasonProgressMatch[] | null | undefined,
  boundaries: number[] | null | undefined,
): StandingsScope {
  const week = Math.max(1, latestFinalizedWeek(matches));
  return scopeForThird(thirdForWeek(week, boundaries ?? [12, 24, 36]));
}