/**
 * Natural (numeric-aware) ordering for team lists.
 *
 * Team names are numbered ("#1 SMITH - JONES" … "#18 TEAM"), so plain lexical
 * ordering produces #1, #10, #11, … #2. Every admin/selection surface that
 * lists teams by name uses this helper. Orders driven by rank, schedule sort
 * order, or another intentional non-name rule are left untouched.
 */

import { naturalCompare } from "./standings-order";

export { naturalCompare };

export type NamedTeam = { name?: string | null };

export function compareTeamNames(a: NamedTeam, b: NamedTeam): number {
  return naturalCompare(a?.name ?? "", b?.name ?? "");
}

/** Returns a new array of teams ordered naturally by name. */
export function sortTeamsByName<T extends NamedTeam>(teams: readonly T[] | null | undefined): T[] {
  return [...(teams ?? [])].sort(compareTeamNames);
}
