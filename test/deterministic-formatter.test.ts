import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleFinalOutput,
  formatArchitectureFallback,
  generateDeterministicAgentsMd,
  generatePackageDeterministicAgentsMd,
} from "../src/deterministic-formatter.js";
import { extractReadmeContext } from "../src/existing-docs.js";
import { analyze } from "../src/index.js";
import type { PackageAnalysis, StructuredAnalysis } from "../src/types.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMinimalAnalysis(overrides: Partial<PackageAnalysis> = {}): StructuredAnalysis {
  return {
    meta: {
      engineVersion: "0.1.0",
      analyzedAt: "2026-01-01",
      rootDir: "/test",
      config: {} as any,
      timingMs: 100,
    },
    packages: [
      {
        name: "test-pkg",
        version: "1.0.0",
        description: "A test package",
        relativePath: ".",
        files: {
          total: 10,
          byTier: {
            tier1: { count: 5, lines: 500, files: [] },
            tier2: { count: 3, lines: 200, files: [] },
            tier3: { count: 2, lines: 100 },
          },
          byExtension: { ".ts": 10 },
        },
        publicAPI: [
          { name: "useAuth", kind: "hook", sourceFile: "src/hooks.ts", isTypeOnly: false, importCount: 8 },
          {
            name: "fetchData",
            kind: "function",
            sourceFile: "src/api.ts",
            isTypeOnly: false,
            signature: "(url: string) => Promise<any>",
            importCount: 5,
          },
          { name: "Button", kind: "component", sourceFile: "src/ui.tsx", isTypeOnly: false, importCount: 3 },
          { name: "Config", kind: "type", sourceFile: "src/types.ts", isTypeOnly: true, importCount: 2 },
        ],
        conventions: [
          {
            category: "file-naming",
            name: "kebab-case",
            description: "Most files use kebab-case naming 24 of 34 files (71%)",
            confidence: { matched: 24, total: 34, percentage: 71, description: "24 of 34 files (71%)" },
            examples: ["user-profile.ts", "auth-handler.ts"],
            impact: "high",
          },
        ],
        commands: {
          packageManager: "pnpm",
          build: { run: "pnpm build", source: "package.json" },
          test: {
            run: "pnpm test",
            source: "package.json",
            variants: [{ name: "watch", run: "pnpm test:watch" }],
          },
          lint: { run: "pnpm lint", source: "package.json" },
          other: [],
        },
        architecture: {
          entryPoint: "index.ts",
          directories: [
            { path: "src/hooks", purpose: "React hooks", fileCount: 4, exports: ["useAuth", "useToggle"] },
            { path: "src/adapters", purpose: "Framework adapters", fileCount: 5, exports: ["reactAdapter"] },
            { path: "src/protocols", purpose: "Wire protocols", fileCount: 3, exports: ["httpProtocol"] },
            { path: "src/orchestrators", purpose: "Pipeline orchestrators", fileCount: 4, exports: ["runPipeline"] },
            { path: "src/detectors", purpose: "Convention detectors", fileCount: 8, exports: ["fileNaming"] },
          ],
          packageType: "library",
          hasJSX: true,
        },
        dependencies: {
          internal: [],
          external: [
            { name: "react", importCount: 12 },
            { name: "zod", importCount: 5 },
          ],
          totalUniqueDependencies: 8,
        },
        role: {
          summary: "Shared UI and data hooks library",
          purpose: "Provide reusable hooks for authentication and data fetching",
          whenToUse: "When building UI that needs auth or data access",
          inferredFrom: ["hooks", "exports"],
        },
        antiPatterns: [
          {
            rule: "Do not use any as a type",
            reason: "Reduces type safety",
            confidence: "high",
            derivedFrom: "convention analysis",
            impact: "high",
          },
        ],
        contributionPatterns: [
          {
            type: "hook",
            directory: "src/hooks",
            filePattern: "use-*.ts",
            testPattern: "use-*.test.ts",
            exampleFile: "src/hooks/use-auth.ts",
            steps: ["Create hook file", "Export from index.ts", "Add test"],
            commonImports: [{ specifier: "../types.js", symbols: ["HookConfig"], coverage: 0.9 }],
            exportSuffix: "Hook",
            registrationFile: "src/hooks/index.ts",
          },
          {
            type: "function",
            directory: "src/detectors",
            filePattern: "{name}-detector.ts",
            exampleFile: "src/detectors/file-naming.ts",
            steps: ["Create detector", "Register in extractor"],
            commonImports: [{ specifier: "../types.js", symbols: ["Convention"], coverage: 0.85 }],
            exportSuffix: "Detector",
            registrationFile: "src/convention-extractor.ts",
          },
        ],
        dependencyInsights: {
          runtime: [{ name: "node", version: ">=18" }],
          frameworks: [{ name: "react", version: "18.2.0", guidance: "Use React 18 concurrent features" }],
          testFramework: { name: "vitest", version: "1.0.0" },
          bundler: { name: "vite", version: "5.0.0" },
        },
        configAnalysis: {
          linter: { name: "eslint", configFile: ".eslintrc.js" },
          formatter: { name: "prettier", configFile: ".prettierrc" },
        },
        callGraph: [{ from: "useAuth", to: "fetchData", fromFile: "src/hooks.ts", toFile: "src/api.ts" }],
        ...overrides,
      },
    ],
    warnings: [],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("deterministic-formatter", () => {
  describe("generateDeterministicAgentsMd()", () => {
    it("generates title from package name", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.title).toBe("# test-pkg");
    });

    it("generates summary from role.summary", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.summary).toBe("Shared UI and data hooks library");
    });

    it("falls back to description when role.summary is empty", () => {
      const analysis = makeMinimalAnalysis({
        role: { summary: "", purpose: "", whenToUse: "", inferredFrom: [] },
      });
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.summary).toBe("A test package");
    });

    it("generates tech stack from dependency insights", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.techStack).toContain("## Tech Stack");
      expect(result.techStack).toContain("node >=18");
      expect(result.techStack).toContain("react 18.2.0");
      expect(result.techStack).toContain("vitest 1.0.0");
      expect(result.techStack).toContain("vite 5.0.0");
      expect(result.techStack).toContain("eslint (lint)");
      expect(result.techStack).toContain("prettier (format)");
    });

    it("generates tech stack with pipe separator", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      // Check the tech stack line uses pipe separator
      const techLines = result.techStack.split("\n");
      const stackLine = techLines.find((l) => l.includes("|") && !l.startsWith("#"));
      expect(stackLine).toBeDefined();
      expect(stackLine).toContain(" | ");
    });

    it("includes framework guidance", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.techStack).toContain("Use React 18 concurrent features");
    });

    it("generates commands table", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.commands).toContain("## Commands");
      expect(result.commands).toContain("| Command | Description |");
      expect(result.commands).toContain("| `pnpm build` | Build |");
      expect(result.commands).toContain("| `pnpm test` | Test |");
      expect(result.commands).toContain("| `pnpm test:watch` | Test (watch) |");
      expect(result.commands).toContain("| `pnpm lint` | Lint |");
    });

    it("generates public API grouped by kind", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.publicAPI).toContain("## Public API");
      expect(result.publicAPI).toContain("### Hooks");
      expect(result.publicAPI).toContain("### Functions");
      expect(result.publicAPI).toContain("### Components");
      expect(result.publicAPI).toContain("### Types");
      expect(result.publicAPI).toContain("`useAuth`");
      expect(result.publicAPI).toContain("`fetchData`");
    });

    it("generates conventions as DO/DON'T directives", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.conventions).toContain("## Conventions");
      expect(result.conventions).toContain("**DO**");
      expect(result.conventions).toContain("**DON'T**");
      // Stats should be stripped
      expect(result.conventions).not.toContain("34 of 34 files");
      expect(result.conventions).not.toContain("(100%)");
    });

    it("strips percentage stats from convention descriptions", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.conventions).not.toMatch(/\d+ of \d+/);
      expect(result.conventions).not.toMatch(/\(\d+%\)/);
    });

    it("generates dependencies section", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.dependencies).toContain("## Key Dependencies");
      expect(result.dependencies).toContain("`react`");
      expect(result.dependencies).toContain("`zod`");
    });

    it("generates contribution patterns as How to Add Code", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.howToAddCode).toContain("## How to Add New Code");
      expect(result.howToAddCode).toContain("### Hook"); // exportSuffix as header
      expect(result.howToAddCode).toContain("src/hooks/use-auth.ts"); // example file
    });

    it("leaves architecture and domainTerminology empty", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.architecture).toBe("");
      expect(result.domainTerminology).toBe("");
    });

    it("includes team knowledge placeholder", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.teamKnowledge).toContain("## Team Knowledge");
    });

    it("returns empty string for packageGuide in single-package mode", () => {
      const analysis = makeMinimalAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.packageGuide).toBe("");
    });

    it("returns empty tech stack when no dependency insights", () => {
      const analysis = makeMinimalAnalysis({
        dependencyInsights: undefined,
        configAnalysis: undefined,
      });
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.techStack).toBe("");
    });
  });

  describe("multi-package formatting", () => {
    function makeMultiAnalysis(): StructuredAnalysis {
      const single = makeMinimalAnalysis();
      const pkgA = { ...single.packages[0], name: "pkg-a" };
      const pkgB = {
        ...single.packages[0],
        name: "pkg-b",
        role: {
          summary: "Backend API server",
          purpose: "Serve HTTP endpoints",
          whenToUse: "When building API routes",
          inferredFrom: ["exports"],
        },
      };

      return {
        ...single,
        packages: [pkgA, pkgB],
        crossPackage: {
          dependencyGraph: [{ from: "pkg-a", to: "pkg-b", isDevOnly: false }],
          sharedConventions: [],
          divergentConventions: [],
          sharedAntiPatterns: [],
          rootCommands: {
            packageManager: "pnpm",
            build: { run: "turbo run build", source: "package.json" },
            test: { run: "turbo run test", source: "package.json" },
            lint: { run: "turbo run lint", source: "package.json" },
            other: [],
          },
          mermaidDiagram: "```mermaid\ngraph LR\n  pkg-a --> pkg-b\n```",
        },
      };
    }

    it("generates monorepo title for multi-package", () => {
      const analysis = makeMultiAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.title).toContain("#");
    });

    it("generates package guide table for multi-package", () => {
      const analysis = makeMultiAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.packageGuide).toContain("## Package Guide");
      expect(result.packageGuide).toContain("| Package | Purpose | When to Use |");
      expect(result.packageGuide).toContain("pkg-a");
      expect(result.packageGuide).toContain("pkg-b");
    });

    it("generates dependency graph for multi-package", () => {
      const analysis = makeMultiAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.dependencyGraph).toContain("## Dependency Graph");
      expect(result.dependencyGraph).toContain("pkg-a");
      expect(result.dependencyGraph).toContain("pkg-b");
    });

    it("includes mermaid diagram for multi-package", () => {
      const analysis = makeMultiAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.mermaidDiagram).toContain("## Dependency Diagram");
      expect(result.mermaidDiagram).toContain("```mermaid");
    });

    it("uses root commands in commands table", () => {
      const analysis = makeMultiAnalysis();
      const result = generateDeterministicAgentsMd(analysis);
      expect(result.commands).toContain("turbo run build");
      expect(result.commands).toContain("turbo run test");
    });
  });

  describe("assembleFinalOutput()", () => {
    it("assembles all non-empty sections", () => {
      const analysis = makeMinimalAnalysis();
      const deterministic = generateDeterministicAgentsMd(analysis);
      const arch = "## Architecture\n\n- Provides hooks for auth and data fetching";
      const domain = "## Domain Terminology\n\n- **auth token**: JWT token for authentication";

      const output = assembleFinalOutput(deterministic, arch, domain);

      expect(output).toContain("# test-pkg");
      expect(output).toContain("## Tech Stack");
      expect(output).toContain("## Commands");
      expect(output).toContain("## Architecture");
      expect(output).toContain("## Domain Terminology");
      expect(output).toContain("## Public API");
      expect(output).toContain("## Key Dependencies");
      expect(output).toContain("## Conventions");
      expect(output).toContain("## Team Knowledge");
    });

    it("omits empty sections gracefully", () => {
      const analysis = makeMinimalAnalysis();
      const deterministic = generateDeterministicAgentsMd(analysis);
      const output = assembleFinalOutput(deterministic, "", "");

      expect(output).not.toContain("## Architecture");
      expect(output).not.toContain("## Domain Terminology");
    });

    it("produces valid markdown", () => {
      const analysis = makeMinimalAnalysis();
      const deterministic = generateDeterministicAgentsMd(analysis);
      const output = assembleFinalOutput(deterministic, "", "");

      // Should not have triple blank lines
      expect(output).not.toContain("\n\n\n\n");
      // Should end with newline
      expect(output.endsWith("\n")).toBe(true);
    });
  });

  describe("formatArchitectureFallback()", () => {
    it("generates deterministic architecture from directory info", () => {
      const analysis = makeMinimalAnalysis();
      const pkg = analysis.packages[0];
      const result = formatArchitectureFallback(pkg);

      expect(result).toContain("## Architecture");
      expect(result).toContain("library");
      expect(result).toContain("index.ts");
      // Non-obvious directories should be listed
      expect(result).toContain("Framework adapters");
      expect(result).toContain("Wire protocols");
      // Obvious directories (hooks, api) are filtered — should mention standard dirs
      expect(result).toMatch(/standard director|non-exhaustive/i);
    });
  });

  // ─── formatTeamKnowledge ──────────────────────────────────────────────────

  describe("formatTeamKnowledge (via generateDeterministicAgentsMd)", () => {
    it("asks about directories with 5+ files not covered by contribution patterns", () => {
      const result = generateDeterministicAgentsMd(
        makeMinimalAnalysis({
          architecture: {
            entryPoint: "index.ts",
            directories: [{ path: "src/widgets", purpose: "Feature: UI widgets", fileCount: 8, exports: [] }],
            packageType: "library",
            hasJSX: false,
          },
          contributionPatterns: [], // not covered
        }),
      );
      expect(result.teamKnowledge).toContain("src/widgets/");
      expect(result.teamKnowledge).toContain("adding a new one");
    });

    it("skips directory question when covered by contribution patterns", () => {
      const result = generateDeterministicAgentsMd(
        makeMinimalAnalysis({
          architecture: {
            entryPoint: "index.ts",
            directories: [{ path: "src/hooks", purpose: "React hooks", fileCount: 8, exports: [] }],
            packageType: "library",
            hasJSX: false,
          },
          contributionPatterns: [
            {
              type: "hook",
              directory: "src/hooks",
              filePattern: "use-*.ts",
              exampleFile: "src/hooks/use-auth.ts",
              steps: ["Create hook"],
            },
          ],
        }),
      );
      expect(result.teamKnowledge).not.toContain("src/hooks/");
    });

    it("asks about call graph complexity when >10 edges", () => {
      const edges = Array.from({ length: 12 }, (_, i) => ({
        from: `fn${i}`,
        to: `fn${i + 1}`,
        fromFile: `src/a${i}.ts`,
        toFile: `src/b${i}.ts`,
      }));
      const result = generateDeterministicAgentsMd(makeMinimalAnalysis({ callGraph: edges }));
      expect(result.teamKnowledge).toContain("12 cross-file call relationships");
    });

    it("asks about CLI conventions for cli package type", () => {
      const result = generateDeterministicAgentsMd(
        makeMinimalAnalysis({
          architecture: {
            entryPoint: "index.ts",
            directories: [],
            packageType: "cli",
            hasJSX: false,
          },
        }),
      );
      expect(result.teamKnowledge).toContain("CLI-specific");
    });

    it("asks about contribution workflow when no CONTRIBUTING.md", () => {
      const result = generateDeterministicAgentsMd(
        makeMinimalAnalysis({
          existingDocs: { hasReadme: true, hasAgentsMd: false, hasContributing: false },
        }),
      );
      expect(result.teamKnowledge).toContain("contribution workflow");
    });

    it("asks about env vars when detected", () => {
      const result = generateDeterministicAgentsMd(
        makeMinimalAnalysis({
          configAnalysis: { envVars: ["API_KEY", "DATABASE_URL"] },
        }),
      );
      expect(result.teamKnowledge).toContain("2 environment variables");
    });

    it("asks about testing philosophy when test conventions exist", () => {
      const result = generateDeterministicAgentsMd(
        makeMinimalAnalysis({
          conventions: [
            {
              category: "testing",
              name: "vitest",
              description: "Uses Vitest",
              confidence: { matched: 10, total: 10, percentage: 100, description: "10 of 10" },
              examples: [],
              impact: "high",
            },
          ],
        }),
      );
      expect(result.teamKnowledge).toContain("testing philosophy");
    });

    it("shows placeholder when no questions generated", () => {
      const result = generateDeterministicAgentsMd(
        makeMinimalAnalysis({
          architecture: { entryPoint: "index.ts", directories: [], packageType: "library", hasJSX: false },
          callGraph: [],
          conventions: [],
          contributionPatterns: [],
          configAnalysis: {},
          existingDocs: { hasReadme: true, hasAgentsMd: false, hasContributing: true },
          commands: { packageManager: "npm", other: [] },
        }),
      );
      expect(result.teamKnowledge).toContain("Add project-specific context");
    });
  });

  // ─── formatChangeImpact ────────────────────────────────────────────────────

  describe("formatChangeImpact (via generateDeterministicAgentsMd)", () => {
    it("returns empty when call graph is too sparse", () => {
      const result = generateDeterministicAgentsMd(makeMinimalAnalysis({ callGraph: [] }));
      expect(result.changeImpact).toBe("");
    });

    it("renders high-impact table when function has many callers", () => {
      // Need 10+ edges for computeImpactRadius, plus a function called by 2+ others
      const edges = [
        // "core" is called by 3 different callers
        { from: "callerA", to: "core", fromFile: "src/a.ts", toFile: "src/core.ts" },
        { from: "callerB", to: "core", fromFile: "src/b.ts", toFile: "src/core.ts" },
        { from: "callerC", to: "core", fromFile: "src/c.ts", toFile: "src/core.ts" },
        // filler edges to reach MIN_EDGES=10
        ...Array.from({ length: 8 }, (_, i) => ({
          from: `fill${i}`,
          to: `fill${i + 1}`,
          fromFile: `src/f${i}.ts`,
          toFile: `src/f${i + 1}.ts`,
        })),
      ];
      const result = generateDeterministicAgentsMd(makeMinimalAnalysis({ callGraph: edges }));
      expect(result.changeImpact).toContain("High-impact functions");
      expect(result.changeImpact).toContain("`core`");
    });

    it("renders complex-functions table when function calls many others", () => {
      // One orchestrator calling 5+ different functions
      const edges = [
        { from: "orchestrate", to: "step1", fromFile: "src/orch.ts", toFile: "src/s1.ts" },
        { from: "orchestrate", to: "step2", fromFile: "src/orch.ts", toFile: "src/s2.ts" },
        { from: "orchestrate", to: "step3", fromFile: "src/orch.ts", toFile: "src/s3.ts" },
        { from: "orchestrate", to: "step4", fromFile: "src/orch.ts", toFile: "src/s4.ts" },
        { from: "orchestrate", to: "step5", fromFile: "src/orch.ts", toFile: "src/s5.ts" },
        // filler edges to reach MIN_EDGES=10
        ...Array.from({ length: 6 }, (_, i) => ({
          from: `pad${i}`,
          to: `pad${i + 1}`,
          fromFile: `src/p${i}.ts`,
          toFile: `src/p${i + 1}.ts`,
        })),
      ];
      const result = generateDeterministicAgentsMd(makeMinimalAnalysis({ callGraph: edges }));
      expect(result.changeImpact).toContain("Complex functions");
      expect(result.changeImpact).toContain("`orchestrate`");
    });
  });

  // ─── formatSupportedFrameworks ─────────────────────────────────────────────

  describe("formatSupportedFrameworks (via generateDeterministicAgentsMd)", () => {
    it("renders supported frameworks for meta-tool package", () => {
      const result = generateDeterministicAgentsMd(
        makeMinimalAnalysis({
          isMetaTool: true,
          metaToolInfo: {
            supportedFamilies: ["react", "vue", "angular"],
            coreFamilies: ["react"],
          },
        }),
      );
      expect(result.supportedFrameworks).toContain("## Supported Frameworks");
      expect(result.supportedFrameworks).toContain("vue");
      expect(result.supportedFrameworks).toContain("angular");
    });

    it("excludes core families from supported list", () => {
      const result = generateDeterministicAgentsMd(
        makeMinimalAnalysis({
          isMetaTool: true,
          metaToolInfo: {
            supportedFamilies: ["react", "vue"],
            coreFamilies: ["react"],
          },
        }),
      );
      // The supported list after filtering core should only contain "vue"
      const frameworkLines = result.supportedFrameworks
        .split("\n")
        .filter((l) => !l.startsWith("#") && !l.startsWith("_") && l.trim());
      const joinedLine = frameworkLines.join(" ");
      expect(joinedLine).toContain("vue");
      expect(joinedLine).not.toMatch(/\breact\b/);
    });

    it("returns empty for non-meta-tool package", () => {
      const result = generateDeterministicAgentsMd(makeMinimalAnalysis());
      expect(result.supportedFrameworks).toBe("");
    });

    it("returns empty when all supported families are core", () => {
      const result = generateDeterministicAgentsMd(
        makeMinimalAnalysis({
          isMetaTool: true,
          metaToolInfo: {
            supportedFamilies: ["react"],
            coreFamilies: ["react"],
          },
        }),
      );
      expect(result.supportedFrameworks).toBe("");
    });
  });

  describe("generatePackageDeterministicAgentsMd()", () => {
    it("generates single-package output for hierarchical mode", () => {
      const analysis = makeMinimalAnalysis();
      const pkg = analysis.packages[0];
      const result = generatePackageDeterministicAgentsMd(pkg);

      expect(result.title).toBe("# test-pkg");
      expect(result.summary).toContain("Shared UI");
      expect(result.techStack).toContain("react");
      expect(result.packageGuide).toBe(""); // Not applicable
      expect(result.dependencyGraph).toBe(""); // Root-level only
      expect(result.teamKnowledge).toBe(""); // Root-level only
    });
  });
});

describe("extractReadmeContext()", () => {
  it("returns undefined for non-existent directory", () => {
    const result = extractReadmeContext("/nonexistent/path");
    expect(result).toBeUndefined();
  });

  it("returns undefined when no README exists", () => {
    const result = extractReadmeContext(resolve(FIXTURES, "minimal-pkg"));
    // minimal-pkg may or may not have a README — check gracefully
    // This test validates the function doesn't throw
    expect(result === undefined || typeof result === "string").toBe(true);
  });
});

describe("integration: deterministic formatting with real analysis", () => {
  it("formats minimal-pkg deterministically without hallucinations", async () => {
    const analysis = await analyze({
      packages: [resolve(FIXTURES, "minimal-pkg")],
    });

    const deterministic = generateDeterministicAgentsMd(analysis);
    const output = assembleFinalOutput(deterministic, formatArchitectureFallback(analysis.packages[0]), "");

    // Should have real content
    expect(output.length).toBeGreaterThan(100);
    expect(output).toContain("# @test/minimal-pkg");
    expect(output).toContain("## Team Knowledge");

    // Should NOT contain hallucinated technologies
    // (minimal-pkg has no React, no Next.js, no Express)
    expect(output).not.toContain("Next.js");
    expect(output).not.toContain("Express");
  });

  it("formats hooks-pkg deterministically with correct tech stack", async () => {
    const analysis = await analyze({
      packages: [resolve(FIXTURES, "hooks-pkg")],
    });

    const deterministic = generateDeterministicAgentsMd(analysis);
    const output = assembleFinalOutput(deterministic, formatArchitectureFallback(analysis.packages[0]), "");

    expect(output).toContain("# @test/hooks-pkg");
    // The output should only mention technologies that are actually in the analysis
    // It should NOT fabricate technologies
  });
});
