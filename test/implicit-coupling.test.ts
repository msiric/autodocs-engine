import { describe, expect, it } from "vitest";
import { detectImplicitCoupling } from "../src/implicit-coupling.js";
import type { CoChangeEdge, FileImportEdge } from "../src/types.js";

function makeCoChange(file1: string, file2: string, jaccard: number, coChangeCount: number): CoChangeEdge {
  return {
    file1,
    file2,
    jaccard,
    coChangeCount,
    file1Commits: coChangeCount + 2,
    file2Commits: coChangeCount + 3,
    lastCoChangeTimestamp: Date.now() / 1000,
  };
}

function makeImportEdge(importer: string, source: string, symbolCount = 1): FileImportEdge {
  return { importer, source, symbolCount, symbols: ["sym1"] };
}

describe("detectImplicitCoupling", () => {
  it("finds co-change pairs with no import relationship", () => {
    const coChanges = [makeCoChange("src/config.ts", "src/schema.ts", 0.6, 10)];
    const imports: FileImportEdge[] = []; // no imports at all

    const result = detectImplicitCoupling(coChanges, imports);
    expect(result).toHaveLength(1);
    expect(result[0].file1).toBe("src/config.ts");
    expect(result[0].file2).toBe("src/schema.ts");
    expect(result[0].jaccard).toBe(0.6);
  });

  it("excludes pairs that have an import relationship (A→B)", () => {
    const coChanges = [makeCoChange("src/auth.ts", "src/session.ts", 0.5, 8)];
    const imports = [makeImportEdge("src/auth.ts", "src/session.ts")];

    const result = detectImplicitCoupling(coChanges, imports);
    expect(result).toHaveLength(0);
  });

  it("excludes pairs that have a reverse import relationship (B→A)", () => {
    const coChanges = [makeCoChange("src/auth.ts", "src/session.ts", 0.5, 8)];
    const imports = [makeImportEdge("src/session.ts", "src/auth.ts")];

    const result = detectImplicitCoupling(coChanges, imports);
    expect(result).toHaveLength(0);
  });

  it("filters out pairs below Jaccard threshold (0.2)", () => {
    const coChanges = [makeCoChange("src/a.ts", "src/b.ts", 0.15, 5)];
    const result = detectImplicitCoupling(coChanges, []);
    expect(result).toHaveLength(0);
  });

  it("filters out pairs below co-change count threshold (3)", () => {
    const coChanges = [makeCoChange("src/a.ts", "src/b.ts", 0.5, 2)];
    const result = detectImplicitCoupling(coChanges, []);
    expect(result).toHaveLength(0);
  });

  it("includes pairs at exact threshold boundaries", () => {
    const coChanges = [makeCoChange("src/a.ts", "src/b.ts", 0.2, 3)];
    const result = detectImplicitCoupling(coChanges, []);
    expect(result).toHaveLength(1);
  });

  it("sorts results by Jaccard descending", () => {
    const coChanges = [
      makeCoChange("src/a.ts", "src/b.ts", 0.3, 5),
      makeCoChange("src/c.ts", "src/d.ts", 0.8, 10),
      makeCoChange("src/e.ts", "src/f.ts", 0.5, 7),
    ];
    const result = detectImplicitCoupling(coChanges, []);
    expect(result).toHaveLength(3);
    expect(result[0].jaccard).toBe(0.8);
    expect(result[1].jaccard).toBe(0.5);
    expect(result[2].jaccard).toBe(0.3);
  });

  it("caps at 20 edges", () => {
    const coChanges = Array.from({ length: 30 }, (_, i) =>
      makeCoChange(`src/a${i}.ts`, `src/b${i}.ts`, 0.3 + i * 0.01, 5),
    );
    const result = detectImplicitCoupling(coChanges, []);
    expect(result).toHaveLength(20);
  });

  it("handles mix of implicit and import-backed pairs", () => {
    const coChanges = [
      makeCoChange("src/auth.ts", "src/session.ts", 0.7, 12),
      makeCoChange("src/config.ts", "src/schema.ts", 0.5, 8),
      makeCoChange("src/utils.ts", "src/helpers.ts", 0.4, 6),
    ];
    const imports = [
      makeImportEdge("src/auth.ts", "src/session.ts"), // has import → excluded
    ];

    const result = detectImplicitCoupling(coChanges, imports);
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.file1 === "src/auth.ts")).toBeUndefined();
    expect(result.find((e) => e.file1 === "src/config.ts")).toBeDefined();
    expect(result.find((e) => e.file1 === "src/utils.ts")).toBeDefined();
  });

  it("returns empty for empty inputs", () => {
    expect(detectImplicitCoupling([], [])).toHaveLength(0);
  });

  it("returns empty when all co-changes have import relationships", () => {
    const coChanges = [makeCoChange("src/a.ts", "src/b.ts", 0.8, 15)];
    const imports = [makeImportEdge("src/a.ts", "src/b.ts")];
    expect(detectImplicitCoupling(coChanges, imports)).toHaveLength(0);
  });
});
