/**
 * Admin-only display-name editing for teams and bowlers.
 *
 * Renames are name-only: the row id and (for teams) the URL slug are never
 * touched, so schedules, lineups, results, standings, stats caches and public
 * links stay attached to the same records. No scores, handicaps, averages or
 * roster assignments are modified.
 */

export const MAX_TEAM_NAME = 80;
export const MAX_BOWLER_NAME = 100;

export interface NamedRow {
  id: string;
  name: string;
}

export type NameValidation = { ok: true; value: string } | { ok: false; error: string };

/** Case/whitespace-insensitive key used for duplicate detection. */
export function nameKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Trim, reject blanks/over-long values, and reject duplicates within the same
 * season (ignoring the row being edited).
 */
export function validateName(
  raw: string,
  opts: { id: string; existing: NamedRow[]; label: "Team" | "Bowler"; maxLength: number },
): NameValidation {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, error: `${opts.label} name cannot be blank.` };
  if (value.length > opts.maxLength)
    return { ok: false, error: `${opts.label} name must be ${opts.maxLength} characters or fewer.` };

  const key = nameKey(value);
  const clash = opts.existing.find((r) => r.id !== opts.id && nameKey(r.name) === key);
  if (clash) return { ok: false, error: `Another ${opts.label.toLowerCase()} in this season already uses that name.` };

  return { ok: true, value };
}

/** Minimal shape of the Supabase client used by the rename helpers. */
export interface RenameClient {
  from(table: string): {
    update(patch: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
    };
  };
}

async function applyRename(
  client: RenameClient,
  table: "teams" | "bowlers",
  column: "name" | "full_name",
  id: string,
  value: string,
): Promise<void> {
  // Only the display-name column is written — never slug, season_id or any stat.
  const { error } = await client.from(table).update({ [column]: value }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function renameTeam(
  client: RenameClient,
  args: { id: string; name: string; existing: NamedRow[] },
): Promise<string> {
  const check = validateName(args.name, {
    id: args.id,
    existing: args.existing,
    label: "Team",
    maxLength: MAX_TEAM_NAME,
  });
  if (!check.ok) throw new Error(check.error);
  await applyRename(client, "teams", "name", args.id, check.value);
  return check.value;
}

export async function renameBowler(
  client: RenameClient,
  args: { id: string; name: string; existing: NamedRow[] },
): Promise<string> {
  const check = validateName(args.name, {
    id: args.id,
    existing: args.existing,
    label: "Bowler",
    maxLength: MAX_BOWLER_NAME,
  });
  if (!check.ok) throw new Error(check.error);
  await applyRename(client, "bowlers", "full_name", args.id, check.value);
  return check.value;
}
