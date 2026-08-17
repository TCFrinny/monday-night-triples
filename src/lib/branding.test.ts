import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LEAGUE_NAME, brandText, resolveLeagueName } from "./branding";

describe("resolveLeagueName", () => {
  it("prefers display name when populated", () => {
    expect(resolveLeagueName({ display_name: "Duckpin Nights", league_name: "MNT" })).toBe(
      "Duckpin Nights",
    );
  });

  it("trims whitespace on display name", () => {
    expect(resolveLeagueName({ display_name: "  Duckpin Nights  " })).toBe("Duckpin Nights");
  });

  it("falls back to league name when display name is blank or null", () => {
    expect(resolveLeagueName({ display_name: "   ", league_name: "Formal League" })).toBe(
      "Formal League",
    );
    expect(resolveLeagueName({ display_name: null, league_name: "Formal League" })).toBe(
      "Formal League",
    );
  });

  it("falls back to the literal default when neither value exists", () => {
    expect(resolveLeagueName(null)).toBe(DEFAULT_LEAGUE_NAME);
    expect(resolveLeagueName(undefined)).toBe(DEFAULT_LEAGUE_NAME);
    expect(resolveLeagueName({ display_name: "", league_name: "" })).toBe(DEFAULT_LEAGUE_NAME);
  });
});

describe("brandText", () => {
  it("swaps the literal default for the live league name", () => {
    expect(brandText("Standings — Monday Night Triples", "Duckpin Nights")).toBe(
      "Standings — Duckpin Nights",
    );
  });

  it("is a no-op when the league name is the default", () => {
    const t = "Standings — Monday Night Triples";
    expect(brandText(t, DEFAULT_LEAGUE_NAME)).toBe(t);
  });
});

const PUBLIC_BRANDING_FILES = [
  "src/components/site-header.tsx",
  "src/components/site-footer.tsx",
  "src/routes/index.tsx",
];

describe("no hard-coded public branding", () => {
  it("keeps visible branding components free of the literal name", () => {
    for (const file of PUBLIC_BRANDING_FILES) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      const body = src
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(body, `${file} should not hard-code the league name`).not.toContain(
        DEFAULT_LEAGUE_NAME,
      );
    }
  });

  it("only allows the literal name in branding.ts and its test", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(tsx?|css)$/.test(entry)) continue;
        if (p.includes("branding")) continue;
        if (p.endsWith("routeTree.gen.ts")) continue;
        if (readFileSync(p, "utf8").includes(DEFAULT_LEAGUE_NAME)) hits.push(p);
      }
    };
    walk(join(process.cwd(), "src"));
    // Allowed: design-system comment, rules doc comment, admin persisted defaults.
    const allowed = new Set([
      join(process.cwd(), "src/styles.css"),
      join(process.cwd(), "src/lib/league.ts"),
      join(process.cwd(), "src/routes/admin.index.tsx"),
    ]);
    expect(hits.filter((h) => !allowed.has(h))).toEqual([]);
  });
});
