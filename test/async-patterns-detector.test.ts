import { describe, expect, it } from "vitest";
import { asyncPatternsDetector } from "../src/detectors/async-patterns.js";
import { createContentSignals, createExport, createImport, createParsedFile, createTiers } from "./helpers/fixtures.js";

describe("async-patterns detector", () => {
  // ─── Promise.all concurrent pattern ────────────────────────────────────────

  it("detects Promise.all usage across async files", () => {
    const files = [
      createParsedFile({
        relativePath: "src/api.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 2, promiseAllCount: 1 }),
      }),
      createParsedFile({
        relativePath: "src/batch.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1, promiseAllCount: 1 }),
      }),
      createParsedFile({
        relativePath: "src/utils.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1 }),
      }),
    ];
    const tiers = createTiers(files);
    const result = asyncPatternsDetector(files, tiers, []);
    const conv = result.find((c) => c.name === "Promise.all concurrent pattern");
    expect(conv).toBeDefined();
    expect(conv!.category).toBe("async-patterns");
    expect(conv!.confidence.matched).toBe(2); // 2 of 3 async files use Promise.all
  });

  it("does not report Promise.all if ratio is too low", () => {
    const files = [
      createParsedFile({
        relativePath: "src/a.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1, promiseAllCount: 1 }),
      }),
      // 9 async files without Promise.all (ratio = 1/10 = 10% < 15%)
      ...Array.from({ length: 9 }, (_, i) =>
        createParsedFile({
          relativePath: `src/f${i}.ts`,
          contentSignals: createContentSignals({ asyncFunctionCount: 1 }),
        }),
      ),
    ];
    const tiers = createTiers(files);
    const result = asyncPatternsDetector(files, tiers, []);
    expect(result.find((c) => c.name === "Promise.all concurrent pattern")).toBeUndefined();
  });

  // ─── Sequential await in loops ─────────────────────────────────────────────

  it("detects await-in-loop pattern when widespread (≥3 files, ≥25%)", () => {
    const files = [
      // 3 files with await-in-loop out of 4 async files = 75% ratio
      createParsedFile({
        relativePath: "src/importer.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1, awaitInLoopCount: 2 }),
      }),
      createParsedFile({
        relativePath: "src/batch.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1, awaitInLoopCount: 1 }),
      }),
      createParsedFile({
        relativePath: "src/sync.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1, awaitInLoopCount: 1 }),
      }),
      createParsedFile({
        relativePath: "src/worker.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1 }),
      }),
    ];
    const tiers = createTiers(files);
    const result = asyncPatternsDetector(files, tiers, []);
    const conv = result.find((c) => c.name === "Sequential await in loops");
    expect(conv).toBeDefined();
    expect(conv!.description).toContain("3 files contain await inside loops");
  });

  it("does not report await-in-loop if fewer than 3 files", () => {
    const files = [
      createParsedFile({
        relativePath: "src/importer.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1, awaitInLoopCount: 2 }),
      }),
      createParsedFile({
        relativePath: "src/worker.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1 }),
      }),
    ];
    const tiers = createTiers(files);
    const result = asyncPatternsDetector(files, tiers, []);
    expect(result.find((c) => c.name === "Sequential await in loops")).toBeUndefined();
  });

  it("does not report await-in-loop if ratio is too low", () => {
    // 3 files with await-in-loop out of 20 async files = 15% (below 25% threshold)
    const files = [
      ...Array.from({ length: 3 }, (_, i) =>
        createParsedFile({
          relativePath: `src/loop${i}.ts`,
          contentSignals: createContentSignals({ asyncFunctionCount: 1, awaitInLoopCount: 1 }),
        }),
      ),
      ...Array.from({ length: 17 }, (_, i) =>
        createParsedFile({
          relativePath: `src/f${i}.ts`,
          contentSignals: createContentSignals({ asyncFunctionCount: 1 }),
        }),
      ),
    ];
    const tiers = createTiers(files);
    const result = asyncPatternsDetector(files, tiers, []);
    expect(result.find((c) => c.name === "Sequential await in loops")).toBeUndefined();
  });

  // ─── AbortController ──────────────────────────────────────────────────────

  it("detects AbortController usage from imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/fetch.ts",
        imports: [createImport({ moduleSpecifier: "node:abort-controller", importedNames: ["AbortController"] })],
      }),
      createParsedFile({
        relativePath: "src/cancel.ts",
        imports: [createImport({ moduleSpecifier: "node:events", importedNames: ["AbortSignal"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = asyncPatternsDetector(files, tiers, []);
    expect(result.find((c) => c.name === "AbortController cancellation pattern")).toBeDefined();
  });

  it("detects AbortSignal in function signatures", () => {
    const files = [
      createParsedFile({
        relativePath: "src/client.ts",
        exports: [
          createExport({ name: "fetchData", signature: "function fetchData(url: string, signal?: AbortSignal)" }),
        ],
      }),
      createParsedFile({
        relativePath: "src/api.ts",
        exports: [createExport({ name: "getData", signature: "function getData(opts: { signal: AbortSignal })" })],
      }),
    ];
    const tiers = createTiers(files);
    const result = asyncPatternsDetector(files, tiers, []);
    expect(result.find((c) => c.name === "AbortController cancellation pattern")).toBeDefined();
  });

  it("requires at least 2 files for AbortController convention", () => {
    const files = [
      createParsedFile({
        relativePath: "src/client.ts",
        exports: [createExport({ name: "fetchData", signature: "function fetchData(signal?: AbortSignal)" })],
      }),
    ];
    const tiers = createTiers(files);
    const result = asyncPatternsDetector(files, tiers, []);
    expect(result.find((c) => c.name === "AbortController cancellation pattern")).toBeUndefined();
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────

  it("returns empty for no async functions", () => {
    const files = [createParsedFile({ relativePath: "src/sync.ts" })];
    const tiers = createTiers(files);
    expect(asyncPatternsDetector(files, tiers, [])).toHaveLength(0);
  });

  it("returns empty for empty file list", () => {
    expect(asyncPatternsDetector([], new Map(), [])).toHaveLength(0);
  });

  it("skips T3 test files", () => {
    const files = [
      createParsedFile({
        relativePath: "test/async.test.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 5, promiseAllCount: 3 }),
        isTestFile: true,
      }),
    ];
    const tiers = createTiers(files, 3);
    expect(asyncPatternsDetector(files, tiers, [])).toHaveLength(0);
  });

  it("can detect both Promise.all and await-in-loop simultaneously", () => {
    const files = [
      // 2 files with Promise.all (2/5 = 40% > 15% threshold)
      createParsedFile({
        relativePath: "src/good1.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 2, promiseAllCount: 2 }),
      }),
      createParsedFile({
        relativePath: "src/good2.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1, promiseAllCount: 1 }),
      }),
      // 3 files with await-in-loop (3/5 = 60% > 25% threshold, ≥3 files)
      createParsedFile({
        relativePath: "src/bad1.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1, awaitInLoopCount: 1 }),
      }),
      createParsedFile({
        relativePath: "src/bad2.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1, awaitInLoopCount: 1 }),
      }),
      createParsedFile({
        relativePath: "src/bad3.ts",
        contentSignals: createContentSignals({ asyncFunctionCount: 1, awaitInLoopCount: 1 }),
      }),
    ];
    const tiers = createTiers(files);
    const result = asyncPatternsDetector(files, tiers, []);
    expect(result.find((c) => c.name === "Promise.all concurrent pattern")).toBeDefined();
    expect(result.find((c) => c.name === "Sequential await in loops")).toBeDefined();
  });
});
