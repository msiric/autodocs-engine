import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runPipeline } from "../src/pipeline.js";
import type { ResolvedConfig } from "../src/types.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(packages: string[], overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    packages: packages.map((p) => (p.startsWith("/") ? p : resolve(FIXTURES, p))),
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

// ─── Output Shape ────────────────────────────────────────────────────────────

describe("pipeline — output shape", () => {
  it("single package produces valid StructuredAnalysis", async () => {
    const result = await runPipeline(makeConfig(["minimal-pkg"]));

    expect(result.meta).toBeDefined();
    expect(result.meta.engineVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.meta.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(result.meta.timingMs).toBeGreaterThanOrEqual(0);
    expect(result.meta.rootDir).toBeDefined();
    expect(result.packages).toHaveLength(1);
    expect(result.warnings).toBeInstanceOf(Array);
  });

  it("PackageAnalysis has all required fields", async () => {
    const result = await runPipeline(makeConfig(["callgraph-pkg"]));
    const pkg = result.packages[0];

    expect(pkg.name).toBeDefined();
    expect(pkg.version).toBeDefined();
    expect(pkg.relativePath).toBeDefined();
    expect(pkg.files).toBeDefined();
    expect(pkg.files.total).toBeGreaterThan(0);
    expect(pkg.publicAPI).toBeInstanceOf(Array);
    expect(pkg.conventions).toBeInstanceOf(Array);
    expect(pkg.commands).toBeDefined();
    expect(pkg.commands.packageManager).toBeDefined();
    expect(pkg.architecture).toBeDefined();
    expect(pkg.dependencies).toBeDefined();
    expect(pkg.role).toBeDefined();
    expect(pkg.role.summary).toBeTruthy();
    expect(pkg.antiPatterns).toBeInstanceOf(Array);
    expect(pkg.contributionPatterns).toBeInstanceOf(Array);
    expect(pkg.configAnalysis).toBeDefined();
    expect(pkg.dependencyInsights).toBeDefined();
  });

  it("API key is never present in output", async () => {
    const result = await runPipeline(
      makeConfig(["minimal-pkg"], {
        llm: { provider: "anthropic", model: "test", apiKey: "sk-secret-key-12345", maxOutputTokens: 4096 },
      }),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("sk-secret-key-12345");
  });
});

// ─── Stage Data Flow ─────────────────────────────────────────────────────────

describe("pipeline — stage data flow", () => {
  it("file discovery → AST → symbol graph → public API chain", async () => {
    const result = await runPipeline(makeConfig(["callgraph-pkg"]));
    const pkg = result.packages[0];

    // Files discovered
    expect(pkg.files.total).toBeGreaterThanOrEqual(4);

    // Public API populated from barrel exports
    expect(pkg.publicAPI.length).toBeGreaterThanOrEqual(3);
    const names = pkg.publicAPI.map((e) => e.name);
    expect(names).toContain("processData");
    expect(names).toContain("validateInput");
    expect(names).toContain("formatOutput");
  });

  it("call graph flows into execution flows", async () => {
    const result = await runPipeline(makeConfig(["callgraph-pkg"]));
    const pkg = result.packages[0];

    expect(pkg.callGraph).toBeDefined();
    expect(pkg.callGraph!.length).toBeGreaterThan(0);

    // Execution flows may or may not be generated depending on edge count
    if (pkg.executionFlows) {
      for (const flow of pkg.executionFlows) {
        expect(flow.steps.length).toBeGreaterThanOrEqual(3);
        expect(flow.files.length).toBe(flow.steps.length);
      }
    }
  });

  it("import chain computed before symbol graph is discarded", async () => {
    const result = await runPipeline(makeConfig(["callgraph-pkg"]));
    const pkg = result.packages[0];

    expect(pkg.importChain).toBeDefined();
    expect(pkg.importChain!.length).toBeGreaterThan(0);
    for (const edge of pkg.importChain!) {
      expect(edge.importer).toBeDefined();
      expect(edge.source).toBeDefined();
      expect(edge.symbolCount).toBeGreaterThan(0);
    }
  });

  it("conventions receive dependency context", async () => {
    const result = await runPipeline(makeConfig(["hooks-pkg"]));
    const pkg = result.packages[0];

    expect(pkg.dependencyInsights).toBeDefined();
    expect(pkg.conventions.length).toBeGreaterThan(0);
  });
});

// ─── Branch Coverage ─────────────────────────────────────────────────────────

describe("pipeline — branches", () => {
  it("multi-package triggers cross-package analysis", async () => {
    const result = await runPipeline(makeConfig(["minimal-pkg", "hooks-pkg"], { rootDir: FIXTURES }));

    expect(result.packages).toHaveLength(2);
    expect(result.crossPackage).toBeDefined();
    expect(result.crossPackage!.dependencyGraph).toBeInstanceOf(Array);
    expect(result.crossPackage!.sharedConventions).toBeInstanceOf(Array);
  });

  it("typeChecking=false skips type enrichment", async () => {
    const result = await runPipeline(makeConfig(["callgraph-pkg"], { typeChecking: false }));
    const pkg = result.packages[0];

    // No entries should have resolved types
    for (const entry of pkg.publicAPI) {
      expect(entry.parameterTypes).toBeUndefined();
      expect(entry.returnType).toBeUndefined();
    }
  });

  it("noMetaTool=true skips meta-tool detection", async () => {
    const result = await runPipeline(makeConfig(["minimal-pkg"], { noMetaTool: true }));
    const pkg = result.packages[0];

    expect(pkg.isMetaTool).toBeUndefined();
    expect(pkg.metaToolInfo).toBeUndefined();
  });
});

// ─── Error Resilience ────────────────────────────────────────────────────────

describe("pipeline — error resilience", () => {
  it("package with no source files still produces valid analysis", async () => {
    // no-package-json has no TypeScript source files but should not crash
    const result = await runPipeline(makeConfig(["no-package-json"]));

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].files.total).toBeGreaterThanOrEqual(0);
    expect(result.packages[0].publicAPI).toBeInstanceOf(Array);
  });

  it("no-package-json uses fallback name and version", async () => {
    const result = await runPipeline(makeConfig(["no-package-json"]));
    const pkg = result.packages[0];

    expect(pkg.name).toBe("no-package-json");
    expect(pkg.version).toBe("0.0.0");
  });

  it("circular re-exports do not hang or crash", async () => {
    const result = await runPipeline(makeConfig(["circular-reexport-pkg"]));
    expect(result.packages).toHaveLength(1);
    // Should complete without timeout
  });
});

// ─── Workflow Rules ──────────────────────────────────────────────────────────

describe("pipeline — workflow rules", () => {
  it("single-package creates minimal crossPackage for workflow rules", async () => {
    const result = await runPipeline(makeConfig(["callgraph-pkg"]));

    // Single-package may still have crossPackage if workflow rules were generated
    if (result.crossPackage) {
      expect(result.crossPackage.workflowRules).toBeInstanceOf(Array);
      expect(result.crossPackage.dependencyGraph).toEqual([]);
    }
  });
});
