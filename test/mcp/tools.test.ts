import { describe, it, expect } from "vitest";
import type { StructuredAnalysis, PackageAnalysis } from "../../src/types.js";
import * as tools from "../../src/mcp/tools.js";

// ─── Fixture ─────────────────────────────────────────────────────────────────

function makeAnalysis(overrides: Partial<PackageAnalysis> = {}): StructuredAnalysis {
  return {
    meta: { engineVersion: "0.5.0", analyzedAt: "", rootDir: "/tmp", config: {} as any, timingMs: 100 },
    packages: [{
      name: "test-pkg",
      version: "1.0.0",
      description: "Test package",
      relativePath: ".",
      files: { total: 20, byTier: { tier1: { count: 5, lines: 500, files: [] }, tier2: { count: 10, lines: 1000, files: [] }, tier3: { count: 5, lines: 200 } }, byExtension: { ".ts": 20 } },
      publicAPI: [
        { name: "analyze", kind: "function" as const, sourceFile: "src/index.ts", isTypeOnly: false, importCount: 12, signature: "(opts) => Promise<Analysis>" },
        { name: "format", kind: "function" as const, sourceFile: "src/index.ts", isTypeOnly: false, importCount: 8 },
        { name: "Config", kind: "type" as const, sourceFile: "src/types.ts", isTypeOnly: true, importCount: 20 },
      ],
      conventions: [
        { category: "file-naming" as const, name: "kebab-case", description: "Use kebab-case", confidence: { matched: 20, total: 20, percentage: 100, description: "20/20" }, examples: [], impact: "low" as const },
        { category: "testing" as const, name: "co-located tests", description: "Tests next to source", confidence: { matched: 15, total: 18, percentage: 83, description: "15/18" }, examples: [], impact: "high" as const },
      ],
      commands: {
        packageManager: "pnpm" as const,
        build: { run: "pnpm run build", source: "package.json" },
        test: { run: "pnpm run test", source: "package.json" },
        lint: { run: "pnpm run lint", source: "package.json" },
        other: [],
      },
      architecture: {
        entryPoint: "src/index.ts",
        directories: [
          { path: "src/detectors", purpose: "Convention detectors", fileCount: 8, exports: ["fileNaming", "hooks"], pattern: "{name}.ts" },
          { path: "src/llm", purpose: "LLM integration", fileCount: 5, exports: ["adapter", "client"] },
          { path: "src/bin", purpose: "CLI entry points", fileCount: 3, exports: [] },
        ],
        packageType: "library" as const,
        hasJSX: false,
      },
      dependencies: { internal: [], external: [{ name: "typescript", importCount: 5 }], totalUniqueDependencies: 3 },
      role: { summary: "Codebase intelligence engine", purpose: "", whenToUse: "", inferredFrom: [] },
      antiPatterns: [
        { rule: "Do NOT use camelCase", reason: "Project uses kebab-case", confidence: "high" as const, derivedFrom: "file-naming" },
      ],
      contributionPatterns: [
        {
          type: "function", directory: "src/detectors/", filePattern: "{name}.ts",
          exampleFile: "src/detectors/file-naming.ts",
          steps: ["Create file", "Import Convention", "Export as Detector", "Register"],
          commonImports: [{ specifier: "../types.js", symbols: ["Convention"], coverage: 0.9 }],
          exportSuffix: "Detector",
          registrationFile: "src/convention-extractor.ts",
        },
      ],
      importChain: [
        { importer: "src/pipeline.ts", source: "src/types.ts", symbolCount: 12, symbols: ["StructuredAnalysis", "PackageAnalysis"] },
        { importer: "src/formatter.ts", source: "src/types.ts", symbolCount: 8, symbols: ["Convention", "CommandSet"] },
      ],
      callGraph: [
        { from: "runPipeline", to: "analyzePackage", fromFile: "src/pipeline.ts", toFile: "src/pipeline.ts" },
        { from: "analyzePackage", to: "parseFile", fromFile: "src/pipeline.ts", toFile: "src/ast-parser.ts" },
      ],
      gitHistory: {
        coChangeEdges: [
          { file1: "src/formatter.ts", file2: "src/types.ts", coChangeCount: 8, file1Commits: 10, file2Commits: 15, jaccard: 0.47, lastCoChangeTimestamp: Date.now() / 1000 },
        ],
        totalCommitsAnalyzed: 25,
        commitsFilteredBySize: 1,
        historySpanDays: 30,
      },
      configAnalysis: { typescript: { strict: true, target: "ES2022", module: "esnext", moduleResolution: "bundler" } },
      dependencyInsights: {
        runtime: [{ name: "Node", version: "20" }],
        frameworks: [{ name: "TypeScript", version: "5.4" }],
        testFramework: { name: "Vitest", version: "2.0" },
      },
      ...overrides,
    } as PackageAnalysis],
    crossPackage: {
      dependencyGraph: [],
      sharedConventions: [],
      divergentConventions: [],
      sharedAntiPatterns: [],
      workflowRules: [
        { trigger: "When modifying src/types.ts", action: "Check 5 dependent files", source: "Import chain", impact: "high" as const },
        { trigger: "After changing convention detectors", action: "Run full test suite", source: "Technology", impact: "high" as const },
      ],
    },
    warnings: [],
  };
}

// ─── Tool Tests ──────────────────────────────────────────────────────────────

describe("handleGetCommands", () => {
  it("returns formatted command table", () => {
    const result = tools.handleGetCommands(makeAnalysis(), {});
    const text = result.content[0].text;
    expect(text).toContain("pnpm run build");
    expect(text).toContain("pnpm run test");
    expect(text).toContain("pnpm run lint");
    expect(text).toContain("Package manager: pnpm");
  });

  it("includes tech stack summary", () => {
    const result = tools.handleGetCommands(makeAnalysis(), {});
    expect(result.content[0].text).toContain("Node 20");
  });
});

describe("handleGetArchitecture", () => {
  it("returns directory tree with purposes", () => {
    const result = tools.handleGetArchitecture(makeAnalysis(), {});
    const text = result.content[0].text;
    expect(text).toContain("src/detectors");
    expect(text).toContain("Convention detectors");
    expect(text).toContain("8 files");
    expect(text).toContain("library");
  });
});

describe("handleAnalyzeImpact", () => {
  it("returns importers for a file", () => {
    const result = tools.handleAnalyzeImpact(makeAnalysis(), {
      filePath: "src/types.ts",
      scope: "imports",
    });
    const text = result.content[0].text;
    expect(text).toContain("src/pipeline.ts");
    expect(text).toContain("12 symbols");
    expect(text).toContain("Importers");
  });

  it("returns co-changes for a file", () => {
    const result = tools.handleAnalyzeImpact(makeAnalysis(), {
      filePath: "src/types.ts",
      scope: "cochanges",
    });
    const text = result.content[0].text;
    expect(text).toContain("src/formatter.ts");
    expect(text).toContain("Jaccard");
  });

  it("returns combined analysis with scope=all", () => {
    const result = tools.handleAnalyzeImpact(makeAnalysis(), {
      filePath: "src/types.ts",
      functionName: "runPipeline",
    });
    const text = result.content[0].text;
    expect(text).toContain("Importers");
    expect(text).toContain("Callers");
    expect(text).toContain("Co-change");
  });

  it("handles missing file gracefully", () => {
    const result = tools.handleAnalyzeImpact(makeAnalysis(), {
      filePath: "src/nonexistent.ts",
      scope: "imports",
    });
    expect(result.content[0].text).toContain("No files import");
  });
});

describe("handleGetWorkflowRules", () => {
  it("returns numbered rules", () => {
    const result = tools.handleGetWorkflowRules(makeAnalysis(), {});
    const text = result.content[0].text;
    expect(text).toContain("1.");
    expect(text).toContain("When modifying src/types.ts");
    expect(text).toContain("Check 5 dependent files");
  });
});

describe("handleListPackages", () => {
  it("returns package table", () => {
    const result = tools.handleListPackages(makeAnalysis());
    const text = result.content[0].text;
    expect(text).toContain("test-pkg");
    expect(text).toContain("library");
    expect(text).toContain("src/index.ts");
  });
});

describe("handleGetContributionGuide", () => {
  it("returns step-by-step recipe", () => {
    const result = tools.handleGetContributionGuide(makeAnalysis(), {});
    const text = result.content[0].text;
    expect(text).toContain("src/detectors/");
    expect(text).toContain("Detector");
    expect(text).toContain("Register");
    expect(text).toContain("../types.js");
  });

  it("filters by directory", () => {
    const result = tools.handleGetContributionGuide(makeAnalysis(), { directory: "src/llm" });
    expect(result.content[0].text).toContain("No contribution patterns");
  });
});

describe("handleGetExports", () => {
  it("returns API table", () => {
    const result = tools.handleGetExports(makeAnalysis(), {});
    const text = result.content[0].text;
    expect(text).toContain("analyze");
    expect(text).toContain("function");
    expect(text).toContain("12");
  });

  it("filters by query", () => {
    const result = tools.handleGetExports(makeAnalysis(), { query: "config" });
    const text = result.content[0].text;
    expect(text).toContain("Config");
    expect(text).not.toContain("analyze");
  });
});

describe("handleGetConventions", () => {
  it("returns DO/DON'T rules", () => {
    const result = tools.handleGetConventions(makeAnalysis(), {});
    const text = result.content[0].text;
    expect(text).toContain("DO");
    expect(text).toContain("DO NOT");
    expect(text).toContain("camelCase");
  });
});
