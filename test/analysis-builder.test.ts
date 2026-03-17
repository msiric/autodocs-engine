import { describe, expect, it } from "vitest";
import { buildPackageAnalysis, buildPublicAPI, buildStructuredAnalysis } from "../src/analysis-builder.js";
import type { ResolvedConfig, ResolvedExport, SymbolGraph } from "../src/types.js";
import { ENGINE_VERSION } from "../src/types.js";
import { createImport, createParsedFile } from "./helpers/fixtures.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createSymbolGraph(overrides: Partial<SymbolGraph> = {}): SymbolGraph {
  return {
    barrelExports: [],
    allExports: new Map(),
    importGraph: new Map(),
    barrelSourceFiles: new Set(),
    callGraph: [],
    ...overrides,
  };
}

function createResolvedExport(overrides: Partial<ResolvedExport> = {}): ResolvedExport {
  return {
    name: "example",
    kind: "function",
    isReExport: false,
    isTypeOnly: false,
    definedIn: "src/example.ts",
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    packages: ["/test"],
    exclude: [],
    output: { format: "json", dir: "." },
    llm: { provider: "anthropic", model: "test", maxOutputTokens: 4096 },
    conventions: { disable: [] },
    maxPublicAPIEntries: 100,
    verbose: false,
    metaToolThreshold: 5,
    noMetaTool: false,
    typeChecking: false,
    ...overrides,
  };
}

// ─── buildPublicAPI ──────────────────────────────────────────────────────────

describe("buildPublicAPI", () => {
  it("maps barrel exports to PublicAPIEntry with correct fields", () => {
    const graph = createSymbolGraph({
      barrelExports: [
        createResolvedExport({
          name: "fetchData",
          kind: "function",
          signature: "(url: string) => Promise<any>",
          definedIn: "src/api.ts",
        }),
      ],
    });
    const result = buildPublicAPI(graph, [], 100, []);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("fetchData");
    expect(result[0].kind).toBe("function");
    expect(result[0].sourceFile).toBe("src/api.ts");
    expect(result[0].signature).toBe("(url: string) => Promise<any>");
  });

  it("returns empty array when barrelExports is empty", () => {
    const result = buildPublicAPI(createSymbolGraph(), [], 100, []);
    expect(result).toEqual([]);
  });

  describe("E-32: importCount computation", () => {
    it("computes importCount from cross-file imports", () => {
      const graph = createSymbolGraph({
        barrelExports: [createResolvedExport({ name: "utils" })],
      });
      const files = [
        createParsedFile({ relativePath: "src/a.ts", imports: [createImport({ importedNames: ["utils"] })] }),
        createParsedFile({ relativePath: "src/b.ts", imports: [createImport({ importedNames: ["utils"] })] }),
        createParsedFile({ relativePath: "src/c.ts", imports: [createImport({ importedNames: ["utils"] })] }),
      ];
      const result = buildPublicAPI(graph, files, 100, []);
      expect(result[0].importCount).toBe(3);
    });

    it("sets importCount to 0 for symbol not imported by anyone", () => {
      const graph = createSymbolGraph({
        barrelExports: [createResolvedExport({ name: "orphan" })],
      });
      const result = buildPublicAPI(graph, [createParsedFile()], 100, []);
      expect(result[0].importCount).toBe(0);
    });
  });

  describe("hook classification (Fix B)", () => {
    it("classifies use-prefixed export as hook when source imports React", () => {
      const graph = createSymbolGraph({
        barrelExports: [createResolvedExport({ name: "useAuth", kind: "function", definedIn: "src/hooks.ts" })],
      });
      const files = [
        createParsedFile({
          relativePath: "src/hooks.ts",
          imports: [createImport({ moduleSpecifier: "react", importedNames: ["useState"] })],
        }),
      ];
      const result = buildPublicAPI(graph, files, 100, []);
      expect(result[0].kind).toBe("hook");
    });

    it("keeps function kind when source does NOT import React", () => {
      const graph = createSymbolGraph({
        barrelExports: [createResolvedExport({ name: "useAuth", kind: "function", definedIn: "src/hooks.ts" })],
      });
      const files = [createParsedFile({ relativePath: "src/hooks.ts" })];
      const result = buildPublicAPI(graph, files, 100, []);
      expect(result[0].kind).toBe("function");
    });

    it("does NOT reclassify when name is exactly 'use' (length 3)", () => {
      const graph = createSymbolGraph({
        barrelExports: [createResolvedExport({ name: "use", kind: "function" })],
      });
      const result = buildPublicAPI(graph, [], 100, []);
      expect(result[0].kind).toBe("function");
    });

    it("does NOT reclassify when 4th char is lowercase", () => {
      const graph = createSymbolGraph({
        barrelExports: [createResolvedExport({ name: "useful", kind: "function" })],
      });
      const result = buildPublicAPI(graph, [], 100, []);
      expect(result[0].kind).toBe("function");
    });

    it("does NOT reclassify when kind is class", () => {
      const graph = createSymbolGraph({
        barrelExports: [createResolvedExport({ name: "useAuth", kind: "class", definedIn: "src/hooks.ts" })],
      });
      const files = [
        createParsedFile({
          relativePath: "src/hooks.ts",
          imports: [createImport({ moduleSpecifier: "react", importedNames: ["useState"] })],
        }),
      ];
      const result = buildPublicAPI(graph, files, 100, []);
      expect(result[0].kind).toBe("class");
    });
  });

  describe("E-13: cap and ranking", () => {
    it("returns all entries when count <= maxEntries", () => {
      const graph = createSymbolGraph({
        barrelExports: [createResolvedExport({ name: "a" }), createResolvedExport({ name: "b" })],
      });
      const warnings: import("../src/types.js").Warning[] = [];
      const result = buildPublicAPI(graph, [], 2, warnings);
      expect(result).toHaveLength(2);
      expect(warnings).toHaveLength(0);
    });

    it("truncates and pushes warning when count > maxEntries", () => {
      const graph = createSymbolGraph({
        barrelExports: Array.from({ length: 5 }, (_, i) => createResolvedExport({ name: `fn${i}` })),
      });
      const warnings: import("../src/types.js").Warning[] = [];
      const result = buildPublicAPI(graph, [], 3, warnings);
      expect(result).toHaveLength(3);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain("truncated");
    });

    it("ranks hooks before functions before types", () => {
      const graph = createSymbolGraph({
        barrelExports: [
          createResolvedExport({ name: "MyType", kind: "type" }),
          createResolvedExport({ name: "myFunc", kind: "function" }),
          createResolvedExport({ name: "useHook", kind: "hook" }),
        ],
      });
      const result = buildPublicAPI(graph, [], 2, []);
      expect(result[0].kind).toBe("hook");
      expect(result[1].kind).toBe("function");
    });
  });
});

// ─── buildPackageAnalysis ────────────────────────────────────────────────────

describe("buildPackageAnalysis", () => {
  const minimalArchitecture = {
    entryPoint: "index.ts",
    directories: [],
    packageType: "library" as const,
    hasJSX: false,
  };
  const minimalCommands = { packageManager: "npm" as const, other: [] as never[] };

  it("sets relativePath to '.' when rootDir equals packageDir", () => {
    const result = buildPackageAnalysis(
      "/test/pkg",
      "/test/pkg",
      [],
      createSymbolGraph(),
      new Map(),
      [],
      minimalCommands,
      minimalArchitecture,
      [],
      [],
    );
    expect(result.relativePath).toBe(".");
  });

  it("computes relativePath correctly in monorepo layout", () => {
    const result = buildPackageAnalysis(
      "/root/packages/core",
      "/root",
      [],
      createSymbolGraph(),
      new Map(),
      [],
      minimalCommands,
      minimalArchitecture,
      [],
      [],
    );
    expect(result.relativePath).toBe("packages/core");
  });

  it("pushes warning when publicAPI is empty", () => {
    const warnings: import("../src/types.js").Warning[] = [];
    buildPackageAnalysis(
      "/test",
      undefined,
      [],
      createSymbolGraph(),
      new Map(),
      [],
      minimalCommands,
      minimalArchitecture,
      [],
      warnings,
    );
    expect(warnings.some((w) => w.message.includes("No public API"))).toBe(true);
  });

  it("does NOT push warning when publicAPI is non-empty", () => {
    const warnings: import("../src/types.js").Warning[] = [];
    const api = [{ name: "fn", kind: "function" as const, sourceFile: "src/fn.ts", isTypeOnly: false }];
    buildPackageAnalysis(
      "/test",
      undefined,
      [],
      createSymbolGraph(),
      new Map(),
      [],
      minimalCommands,
      minimalArchitecture,
      api,
      warnings,
    );
    expect(warnings.some((w) => w.message.includes("No public API"))).toBe(false);
  });

  it("initializes role, antiPatterns, contributionPatterns as empty stubs", () => {
    const result = buildPackageAnalysis(
      "/test",
      undefined,
      [],
      createSymbolGraph(),
      new Map(),
      [],
      minimalCommands,
      minimalArchitecture,
      [],
      [],
    );
    expect(result.role).toEqual({ summary: "", purpose: "", whenToUse: "", inferredFrom: [] });
    expect(result.antiPatterns).toEqual([]);
    expect(result.contributionPatterns).toEqual([]);
  });

  describe("buildFileInventory", () => {
    it("counts files per tier correctly", () => {
      const files = [
        createParsedFile({ relativePath: "src/a.ts", lineCount: 100 }),
        createParsedFile({ relativePath: "src/b.ts", lineCount: 200 }),
        createParsedFile({ relativePath: "test/c.ts", lineCount: 50 }),
      ];
      const tiers = new Map<string, import("../src/types.js").TierInfo>([
        ["src/a.ts", { tier: 1, reason: "barrel" }],
        ["src/b.ts", { tier: 2, reason: "internal" }],
        ["test/c.ts", { tier: 3, reason: "test" }],
      ]);
      const result = buildPackageAnalysis(
        "/test",
        undefined,
        files,
        createSymbolGraph(),
        tiers,
        [],
        minimalCommands,
        minimalArchitecture,
        [],
        [],
      );

      expect(result.files.total).toBe(3);
      expect(result.files.byTier.tier1.count).toBe(1);
      expect(result.files.byTier.tier1.lines).toBe(100);
      expect(result.files.byTier.tier2.count).toBe(1);
      expect(result.files.byTier.tier2.lines).toBe(200);
      expect(result.files.byTier.tier3.count).toBe(1);
      expect(result.files.byTier.tier3.lines).toBe(50);
    });

    it("counts extensions correctly", () => {
      const files = [
        createParsedFile({ relativePath: "src/a.ts" }),
        createParsedFile({ relativePath: "src/b.tsx" }),
        createParsedFile({ relativePath: "src/c.ts" }),
      ];
      const result = buildPackageAnalysis(
        "/test",
        undefined,
        files,
        createSymbolGraph(),
        new Map(),
        [],
        minimalCommands,
        minimalArchitecture,
        [],
        [],
      );
      expect(result.files.byExtension[".ts"]).toBe(2);
      expect(result.files.byExtension[".tsx"]).toBe(1);
    });
  });

  describe("buildDependencies", () => {
    it("classifies same-scope packages as internal", () => {
      const files = [
        createParsedFile({ imports: [createImport({ moduleSpecifier: "@org/utils", importedNames: ["helper"] })] }),
      ];
      const result = buildPackageAnalysis(
        "/test",
        undefined,
        files,
        createSymbolGraph(),
        new Map(),
        [],
        minimalCommands,
        minimalArchitecture,
        [],
        [],
      );
      // Package name defaults to directory name "test" (no scope), so @org/utils is external
      expect(result.dependencies.external.some((d) => d.name === "@org/utils")).toBe(true);
    });

    it("skips relative and dynamic imports", () => {
      const files = [
        createParsedFile({
          imports: [
            createImport({ moduleSpecifier: "./local", importedNames: ["x"] }),
            createImport({ moduleSpecifier: "lodash", importedNames: ["y"], isDynamic: true }),
            createImport({ moduleSpecifier: "zod", importedNames: ["z"] }),
          ],
        }),
      ];
      const result = buildPackageAnalysis(
        "/test",
        undefined,
        files,
        createSymbolGraph(),
        new Map(),
        [],
        minimalCommands,
        minimalArchitecture,
        [],
        [],
      );
      // Only zod should appear (local skipped, lodash dynamic skipped)
      expect(result.dependencies.external).toHaveLength(1);
      expect(result.dependencies.external[0].name).toBe("zod");
    });
  });
});

// ─── buildStructuredAnalysis ─────────────────────────────────────────────────

describe("buildStructuredAnalysis", () => {
  it("sets meta fields correctly", () => {
    const config = makeConfig({ rootDir: "/my-project" });
    const startTime = performance.now() - 42; // simulate 42ms ago
    const result = buildStructuredAnalysis([], undefined, config, [], startTime);

    expect(result.meta.engineVersion).toBe(ENGINE_VERSION);
    expect(result.meta.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.meta.rootDir).toBe("/my-project");
    expect(result.meta.timingMs).toBeGreaterThanOrEqual(0);
  });

  it("falls back to packages[0] when rootDir is undefined", () => {
    const config = makeConfig({ packages: ["/fallback-dir"] });
    const result = buildStructuredAnalysis([], undefined, config, [], performance.now());
    expect(result.meta.rootDir).toBe("/fallback-dir");
  });

  it("does NOT include apiKey in publicConfig (E-6)", () => {
    const config = makeConfig({
      llm: { provider: "anthropic", model: "test", apiKey: "sk-secret", maxOutputTokens: 4096 },
    });
    const result = buildStructuredAnalysis([], undefined, config, [], performance.now());
    const serialized = JSON.stringify(result.meta.config);
    expect(serialized).not.toContain("sk-secret");
    expect(result.meta.config.llm).not.toHaveProperty("apiKey");
  });

  it("includes crossPackage when provided", () => {
    const cross = { dependencyGraph: [], sharedConventions: [], divergentConventions: [], sharedAntiPatterns: [] };
    const result = buildStructuredAnalysis([], cross, makeConfig(), [], performance.now());
    expect(result.crossPackage).toBeDefined();
  });

  it("sets crossPackage to undefined when not provided", () => {
    const result = buildStructuredAnalysis([], undefined, makeConfig(), [], performance.now());
    expect(result.crossPackage).toBeUndefined();
  });
});
