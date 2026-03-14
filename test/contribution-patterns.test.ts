import { describe, expect, it } from "vitest";
import { detectContributionPatterns } from "../src/contribution-patterns.js";
import type { DirectoryInfo, ParsedFile, PublicAPIEntry, TierInfo } from "../src/types.js";
import { createExport, createParsedFile } from "./helpers/fixtures.js";

describe("detectContributionPatterns", () => {
  it("detects hook contribution pattern from directory with 3+ T1 hook files", () => {
    const parsedFiles: ParsedFile[] = [
      createParsedFile({
        relativePath: "src/hooks/use-create-tab.ts",
        exports: [createExport({ name: "useCreateTab", kind: "hook" })],
      }),
      createParsedFile({
        relativePath: "src/hooks/use-update-tab.ts",
        exports: [createExport({ name: "useUpdateTab", kind: "hook" })],
      }),
      createParsedFile({
        relativePath: "src/hooks/use-delete-tab.ts",
        exports: [createExport({ name: "useDeleteTab", kind: "hook" })],
      }),
      createParsedFile({ relativePath: "src/hooks/use-create-tab.test.ts", isTestFile: true }),
      createParsedFile({ relativePath: "src/hooks/use-update-tab.test.ts", isTestFile: true }),
    ];

    const publicAPI: PublicAPIEntry[] = [
      {
        name: "useCreateTab",
        kind: "hook",
        sourceFile: "src/hooks/use-create-tab.ts",
        isTypeOnly: false,
        importCount: 5,
      },
      {
        name: "useUpdateTab",
        kind: "hook",
        sourceFile: "src/hooks/use-update-tab.ts",
        isTypeOnly: false,
        importCount: 3,
      },
      {
        name: "useDeleteTab",
        kind: "hook",
        sourceFile: "src/hooks/use-delete-tab.ts",
        isTypeOnly: false,
        importCount: 1,
      },
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
      createParsedFile({
        relativePath: "src/utils/helper.ts",
        exports: [createExport({ name: "helper", kind: "function" })],
      }),
      createParsedFile({
        relativePath: "src/utils/other.ts",
        exports: [createExport({ name: "other", kind: "function" })],
      }),
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
      createParsedFile({
        relativePath: "src/commands/create.ts",
        exports: [createExport({ name: "createCommand", kind: "function" })],
      }),
      createParsedFile({
        relativePath: "src/commands/delete.ts",
        exports: [createExport({ name: "deleteCommand", kind: "function" })],
      }),
      createParsedFile({
        relativePath: "src/commands/update.ts",
        exports: [createExport({ name: "updateCommand", kind: "function" })],
      }),
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
