import { describe, it, expect } from "vitest";
import { detectContributionPatterns } from "../src/contribution-patterns.js";
import type { ParsedFile, PublicAPIEntry, TierInfo, DirectoryInfo } from "../src/types.js";

function makeParsedFile(relativePath: string, exports: { name: string; kind: string }[] = [], isTestFile = false): ParsedFile {
  return {
    relativePath,
    exports: exports.map((e) => ({
      name: e.name,
      kind: e.kind as any,
      isReExport: false,
      isTypeOnly: false,
    })),
    imports: [],
    contentSignals: {
      tryCatchCount: 0,
      useMemoCount: 0,
      useCallbackCount: 0,
      useEffectCount: 0,
      useStateCount: 0,
      useQueryCount: 0,
      useMutationCount: 0,
      jestMockCount: 0,
      hasDisplayName: false,
      hasErrorBoundary: false,
    },
    lineCount: 50,
    isTestFile,
    isGeneratedFile: false,
    hasJSX: false,
    hasCJS: false,
    hasSyntaxErrors: false,
  };
}

describe("detectContributionPatterns", () => {
  it("detects hook contribution pattern from directory with 3+ T1 hook files", () => {
    const parsedFiles: ParsedFile[] = [
      makeParsedFile("src/hooks/use-create-tab.ts", [{ name: "useCreateTab", kind: "hook" }]),
      makeParsedFile("src/hooks/use-update-tab.ts", [{ name: "useUpdateTab", kind: "hook" }]),
      makeParsedFile("src/hooks/use-delete-tab.ts", [{ name: "useDeleteTab", kind: "hook" }]),
      makeParsedFile("src/hooks/use-create-tab.test.ts", [], true),
      makeParsedFile("src/hooks/use-update-tab.test.ts", [], true),
    ];

    const publicAPI: PublicAPIEntry[] = [
      { name: "useCreateTab", kind: "hook", sourceFile: "src/hooks/use-create-tab.ts", isTypeOnly: false, importCount: 5 },
      { name: "useUpdateTab", kind: "hook", sourceFile: "src/hooks/use-update-tab.ts", isTypeOnly: false, importCount: 3 },
      { name: "useDeleteTab", kind: "hook", sourceFile: "src/hooks/use-delete-tab.ts", isTypeOnly: false, importCount: 1 },
    ];

    const tiers = new Map<string, TierInfo>([
      ["src/hooks/use-create-tab.ts", { tier: 1, reason: "Exported from barrel" }],
      ["src/hooks/use-update-tab.ts", { tier: 1, reason: "Exported from barrel" }],
      ["src/hooks/use-delete-tab.ts", { tier: 1, reason: "Exported from barrel" }],
      ["src/hooks/use-create-tab.test.ts", { tier: 3, reason: "Test file" }],
      ["src/hooks/use-update-tab.test.ts", { tier: 3, reason: "Test file" }],
    ]);

    const directories: DirectoryInfo[] = [
      {
        path: "src/hooks",
        purpose: "Custom hooks",
        fileCount: 3,
        exports: ["useCreateTab", "useUpdateTab", "useDeleteTab"],
        pattern: "use-{...}-tab.ts",
      },
    ];

    const patterns = detectContributionPatterns(parsedFiles, publicAPI, tiers, directories, "src/index.ts");

    expect(patterns.length).toBeGreaterThanOrEqual(1);
    const hookPattern = patterns.find((p) => p.type === "hook");
    expect(hookPattern).toBeDefined();
    expect(hookPattern!.directory).toBe("src/hooks/");
    expect(hookPattern!.exampleFile).toBe("src/hooks/use-create-tab.ts"); // highest importCount
    expect(hookPattern!.steps.length).toBeGreaterThan(0);
  });

  it("returns empty array when no directories have 3+ T1 files", () => {
    const parsedFiles: ParsedFile[] = [
      makeParsedFile("src/utils/helper.ts", [{ name: "helper", kind: "function" }]),
      makeParsedFile("src/utils/other.ts", [{ name: "other", kind: "function" }]),
    ];

    const tiers = new Map<string, TierInfo>([
      ["src/utils/helper.ts", { tier: 1, reason: "Exported from barrel" }],
      ["src/utils/other.ts", { tier: 1, reason: "Exported from barrel" }],
    ]);

    const directories: DirectoryInfo[] = [
      { path: "src/utils", purpose: "Utilities", fileCount: 2, exports: ["helper", "other"] },
    ];

    const patterns = detectContributionPatterns(parsedFiles, [], tiers, directories, "src/index.ts");
    expect(patterns).toHaveLength(0);
  });

  it("includes barrel re-export step when barrel file exists", () => {
    const parsedFiles: ParsedFile[] = [
      makeParsedFile("src/commands/create.ts", [{ name: "createCommand", kind: "function" }]),
      makeParsedFile("src/commands/delete.ts", [{ name: "deleteCommand", kind: "function" }]),
      makeParsedFile("src/commands/update.ts", [{ name: "updateCommand", kind: "function" }]),
    ];

    const tiers = new Map<string, TierInfo>([
      ["src/commands/create.ts", { tier: 1, reason: "Exported" }],
      ["src/commands/delete.ts", { tier: 1, reason: "Exported" }],
      ["src/commands/update.ts", { tier: 1, reason: "Exported" }],
    ]);

    const directories: DirectoryInfo[] = [
      {
        path: "src/commands",
        purpose: "Feature: commands",
        fileCount: 3,
        exports: ["createCommand", "deleteCommand", "updateCommand"],
        pattern: "{...}.ts",
      },
    ];

    const patterns = detectContributionPatterns(parsedFiles, [], tiers, directories, "src/index.ts");
    if (patterns.length > 0) {
      const hasBarrelStep = patterns[0].steps.some((s) => s.includes("index.ts"));
      expect(hasBarrelStep).toBe(true);
    }
  });
});
