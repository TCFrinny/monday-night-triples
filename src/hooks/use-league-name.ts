import { useQuery } from "@tanstack/react-query";
import { activeSeasonQuery } from "@/lib/queries";
import { resolveLeagueName } from "@/lib/branding";

/** Live public league branding name (display name → league name → default). */
export function useLeagueName(): string {
  const { data: season } = useQuery(activeSeasonQuery);
  return resolveLeagueName(season);
}
