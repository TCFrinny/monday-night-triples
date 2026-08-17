/**
 * Public branding resolution.
 *
 * Admin persists two name fields on `seasons`:
 *  - `display_name`  → the prominent public-facing league title/branding
 *  - `league_name`   → the formal league name, used as a fallback
 *
 * Precedence: display_name → league_name → DEFAULT_LEAGUE_NAME.
 */
export const DEFAULT_LEAGUE_NAME = "Monday Night Triples";

export interface BrandingSource {
  display_name?: string | null;
  league_name?: string | null;
}

export function resolveLeagueName(season?: BrandingSource | null): string {
  const display = (season?.display_name ?? "").trim();
  if (display) return display;
  const league = (season?.league_name ?? "").trim();
  if (league) return league;
  return DEFAULT_LEAGUE_NAME;
}

/** Replaces the literal default branding inside a string with the live league name. */
export function brandText(text: string, leagueName: string): string {
  if (leagueName === DEFAULT_LEAGUE_NAME) return text;
  return text.split(DEFAULT_LEAGUE_NAME).join(leagueName);
}
