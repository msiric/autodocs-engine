import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { discoverFiles } from "../src/file-discovery.js";
import { parseFile } from "../src/ast-parser.js";
import { buildSymbolGraph } from "../src/symbol-graph.js";
import { classifyTiers } from "../src/tier-classifier.js";
import type { Warning } from "../src/types.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

function analyzePackage(pkgName: string) {
  const pkgDir = resolve(FIXTURES, pkgName);
  const warnings: Warning[] = [];
  const files = discoverFiles(pkgDir, [], warnings);
  const parsed = files.map((f) => parseFile(f, pkgDir, warnings));
  const graph = buildSymbolGraph(parsed, pkgDir, warnings);
  const tiers = classifyTiers(parsed, graph, graph.barrelFile);
  return { tiers, graph, warnings };
}

describe("classifyTiers", () => {
  it("classifies minimal-pkg files correctly", () => {
    const { tiers } = analyzePackage("minimal-pkg");

    expect(tiers.get("index.ts")?.tier).toBe(1);
    expect(tiers.get("index.ts")?.reason).toBe("Package entry point");

    expect(tiers.get("src/greet.ts")?.tier).toBe(1);
    expect(tiers.get("src/greet.ts")?.reason).toBe("Exported from barrel");
  });

  it("classifies hooks-pkg files correctly", () => {
    const { tiers } = analyzePackage("hooks-pkg");

    // Barrel → Tier 1
    expect(tiers.get("index.ts")?.tier).toBe(1);

    // Source hook files → Tier 1 (exported from barrel)
    expect(tiers.get("src/hooks/use-counter.ts")?.tier).toBe(1);
    expect(tiers.get("src/hooks/use-toggle.ts")?.tier).toBe(1);
    expect(tiers.get("src/hooks/use-local-storage.ts")?.tier).toBe(1);
    expect(tiers.get("src/hooks/use-fetch.ts")?.tier).toBe(1);

    // Test files → Tier 3
    expect(tiers.get("src/hooks/use-counter.test.ts")?.tier).toBe(3);
    expect(tiers.get("src/hooks/use-toggle.test.ts")?.tier).toBe(3);

    // Generated files → Tier 3
    expect(
      tiers.get("src/graphql/get-data.generated.ts")?.tier,
    ).toBe(3);
    expect(
      tiers.get("src/graphql/update-data.generated.ts")?.tier,
    ).toBe(3);
  });

  it("classifies no-barrel-pkg files as Tier 2", () => {
    const { tiers } = analyzePackage("no-barrel-pkg");

    expect(tiers.get("src/utils.ts")?.tier).toBe(2);
    expect(tiers.get("src/helpers.ts")?.tier).toBe(2);
  });

  it("test file in barrel sources still classified as Tier 3", () => {
    // Test rule wins over barrel rule (ordering)
    const { tiers } = analyzePackage("hooks-pkg");
    expect(tiers.get("src/hooks/use-counter.test.ts")?.tier).toBe(3);
    expect(tiers.get("src/hooks/use-counter.test.ts")?.reason).toBe(
      "Test file",
    );
  });

  it("counts match expected distribution for hooks-pkg", () => {
    const { tiers } = analyzePackage("hooks-pkg");
    let t1 = 0, t2 = 0, t3 = 0;
    for (const [, info] of tiers) {
      if (info.tier === 1) t1++;
      else if (info.tier === 2) t2++;
      else t3++;
    }
    // 5 hook files + barrel = 5 T1 files (barrel is T1)
    expect(t1).toBe(5); // index.ts + 4 hook files
    expect(t3).toBe(4); // 2 test + 2 generated
  });
});
