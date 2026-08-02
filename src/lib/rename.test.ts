import { describe, expect, it } from "vitest";
import { nameKey, renameBowler, renameTeam, validateName, type RenameClient } from "./rename";

function fakeClient() {
  const calls: { table: string; patch: Record<string, unknown>; column: string; id: string }[] = [];
  const client: RenameClient = {
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          return {
            async eq(column: string, value: string) {
              calls.push({ table, patch, column, id: value });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

const teams = [
  { id: "t1", name: "Sortino William" },
  { id: "t2", name: "Warehime Lloyd" },
];
const bowlers = [
  { id: "b1", name: "Bill Sortino" },
  { id: "b2", name: "Lloyd Warehime" },
];

describe("validateName", () => {
  it("trims and collapses whitespace", () => {
    const r = validateName("  Sortino   Williams  ", { id: "t1", existing: teams, label: "Team", maxLength: 80 });
    expect(r).toEqual({ ok: true, value: "Sortino Williams" });
  });

  it("rejects blank names", () => {
    const r = validateName("   ", { id: "t1", existing: teams, label: "Team", maxLength: 80 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/blank/i);
  });

  it("rejects duplicates within the season, case-insensitively", () => {
    const r = validateName("warehime lloyd", { id: "t1", existing: teams, label: "Team", maxLength: 80 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already uses that name/i);
  });

  it("allows saving a row's own unchanged name", () => {
    const r = validateName("Sortino William", { id: "t1", existing: teams, label: "Team", maxLength: 80 });
    expect(r.ok).toBe(true);
  });

  it("rejects over-long names", () => {
    const r = validateName("x".repeat(81), { id: "t1", existing: teams, label: "Team", maxLength: 80 });
    expect(r.ok).toBe(false);
  });

  it("normalizes keys", () => {
    expect(nameKey("  A  B ")).toBe("a b");
  });
});

describe("renameTeam", () => {
  it("updates only the name column for the same id, leaving slug untouched", async () => {
    const { client, calls } = fakeClient();
    const value = await renameTeam(client, { id: "t1", name: " Sortino Williams ", existing: teams });
    expect(value).toBe("Sortino Williams");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      table: "teams",
      patch: { name: "Sortino Williams" },
      column: "id",
      id: "t1",
    });
    // no slug / season / stat fields written, id preserved
    expect(Object.keys(calls[0]!.patch)).toEqual(["name"]);
  });

  it("throws and writes nothing on blank input", async () => {
    const { client, calls } = fakeClient();
    await expect(renameTeam(client, { id: "t1", name: "  ", existing: teams })).rejects.toThrow(/blank/i);
    expect(calls).toHaveLength(0);
  });

  it("throws and writes nothing on a duplicate team name", async () => {
    const { client, calls } = fakeClient();
    await expect(
      renameTeam(client, { id: "t1", name: "Warehime Lloyd", existing: teams }),
    ).rejects.toThrow(/already uses that name/i);
    expect(calls).toHaveLength(0);
  });
});

describe("renameBowler", () => {
  it("updates full_name for the same id", async () => {
    const { client, calls } = fakeClient();
    const value = await renameBowler(client, { id: "b1", name: "Billy Sortino", existing: bowlers });
    expect(value).toBe("Billy Sortino");
    expect(calls[0]).toEqual({
      table: "bowlers",
      patch: { full_name: "Billy Sortino" },
      column: "id",
      id: "b1",
    });
  });

  it("rejects duplicate bowler names in the same season", async () => {
    const { client, calls } = fakeClient();
    await expect(
      renameBowler(client, { id: "b1", name: "Lloyd Warehime", existing: bowlers }),
    ).rejects.toThrow(/already uses that name/i);
    expect(calls).toHaveLength(0);
  });

  it("does not touch slug, averages or roster fields", async () => {
    const { client, calls } = fakeClient();
    await renameBowler(client, { id: "b2", name: "Lloyd W.", existing: bowlers });
    expect(Object.keys(calls[0]!.patch)).toEqual(["full_name"]);
    expect(calls.every((c) => c.table === "bowlers")).toBe(true);
  });
});
