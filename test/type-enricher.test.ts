import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { enrichExports } from "../src/type-enricher.js";
import { createTypeResolver } from "../src/type-resolver.js";
import type { PublicAPIEntry, Warning } from "../src/types.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");
const TYPE_CHECK_PKG = resolve(FIXTURES, "type-checker-target");

function getResolver() {
  const warnings: Warning[] = [];
  const result = createTypeResolver(TYPE_CHECK_PKG, warnings);
  if (!result) throw new Error("TypeResolver creation failed");
  return result;
}

function makeEntry(name: string, kind: string, sourceFile: string): PublicAPIEntry {
  return {
    name,
    kind: kind as PublicAPIEntry["kind"],
    sourceFile,
    isTypeOnly: false,
  };
}

describe("enrichExports", () => {
  it("enriches function parameter types", () => {
    const { checker, program } = getResolver();
    const api: PublicAPIEntry[] = [makeEntry("createUser", "function", "src/service.ts")];
    const warnings: Warning[] = [];

    const result = enrichExports(checker, program, api, TYPE_CHECK_PKG, warnings);

    expect(result.has("createUser")).toBe(true);
    const enriched = result.get("createUser")!;
    expect(enriched.parameterTypes).toBeDefined();
    expect(enriched.parameterTypes.length).toBeGreaterThanOrEqual(1);

    const configParam = enriched.parameterTypes.find((p) => p.name === "config");
    expect(configParam).toBeDefined();
    expect(configParam!.type).toBe("UserConfig");
  });

  it("enriches function return type (preserves type alias name)", () => {
    const { checker, program } = getResolver();
    const api: PublicAPIEntry[] = [makeEntry("createUser", "function", "src/service.ts")];
    const warnings: Warning[] = [];

    const result = enrichExports(checker, program, api, TYPE_CHECK_PKG, warnings);

    const enriched = result.get("createUser")!;
    expect(enriched.returnType).toBeDefined();
    // TypeChecker preserves the alias name, not the expanded union
    expect(enriched.returnType).toContain("Result");
  });

  it("enriches async function with Promise return type", () => {
    const { checker, program } = getResolver();
    const api: PublicAPIEntry[] = [makeEntry("fetchUser", "function", "src/service.ts")];
    const warnings: Warning[] = [];

    const result = enrichExports(checker, program, api, TYPE_CHECK_PKG, warnings);

    expect(result.has("fetchUser")).toBe(true);
    const enriched = result.get("fetchUser")!;
    expect(enriched.returnType).toContain("Promise");

    // Check optional parameter (timeout?)
    const timeoutParam = enriched.parameterTypes.find((p) => p.name === "timeout");
    expect(timeoutParam).toBeDefined();
    expect(timeoutParam!.optional).toBe(true);
  });

  it("enriches arrow function assigned to const", () => {
    const { checker, program } = getResolver();
    const api: PublicAPIEntry[] = [makeEntry("processUser", "const", "src/service.ts")];
    const warnings: Warning[] = [];

    const result = enrichExports(checker, program, api, TYPE_CHECK_PKG, warnings);

    expect(result.has("processUser")).toBe(true);
    const enriched = result.get("processUser")!;
    expect(enriched.parameterTypes).toBeDefined();
    expect(enriched.returnType).toBe("string");
  });

  it("skips type-only exports", () => {
    const { checker, program } = getResolver();
    const api: PublicAPIEntry[] = [
      { name: "UserConfig", kind: "interface", sourceFile: "src/types.ts", isTypeOnly: true },
    ];
    const warnings: Warning[] = [];

    const result = enrichExports(checker, program, api, TYPE_CHECK_PKG, warnings);
    expect(result.size).toBe(0);
  });

  it("skips const that is not a function", () => {
    const { checker, program } = getResolver();
    const api: PublicAPIEntry[] = [makeEntry("MAX_RETRIES", "const", "src/service.ts")];
    const warnings: Warning[] = [];

    const result = enrichExports(checker, program, api, TYPE_CHECK_PKG, warnings);
    expect(result.has("MAX_RETRIES")).toBe(false);
  });

  it("handles missing source file gracefully", () => {
    const { checker, program } = getResolver();
    const api: PublicAPIEntry[] = [makeEntry("nonexistent", "function", "src/missing.ts")];
    const warnings: Warning[] = [];

    const result = enrichExports(checker, program, api, TYPE_CHECK_PKG, warnings);
    expect(result.size).toBe(0);
  });

  it("handles export not found in source file gracefully", () => {
    const { checker, program } = getResolver();
    const api: PublicAPIEntry[] = [makeEntry("doesNotExist", "function", "src/service.ts")];
    const warnings: Warning[] = [];

    const result = enrichExports(checker, program, api, TYPE_CHECK_PKG, warnings);
    expect(result.size).toBe(0);
  });

  it("returns empty map for empty API", () => {
    const { checker, program } = getResolver();
    const warnings: Warning[] = [];

    const result = enrichExports(checker, program, [], TYPE_CHECK_PKG, warnings);
    expect(result.size).toBe(0);
  });
});
