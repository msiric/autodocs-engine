import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { discoverFiles } from "../src/file-discovery.js";
import { parseFile } from "../src/ast-parser.js";
import { buildSymbolGraph } from "../src/symbol-graph.js";
import type { Warning } from "../src/types.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

function parsePackage(pkgName: string) {
  const pkgDir = resolve(FIXTURES, pkgName);
  const warnings: Warning[] = [];
  const files = discoverFiles(pkgDir, [], warnings);
  const parsed = files.map((f) => parseFile(f, pkgDir, warnings));
  return { pkgDir, parsed, warnings };
}

describe("buildSymbolGraph", () => {
  it("resolves barrel exports in minimal-pkg", () => {
    const { pkgDir, parsed, warnings } = parsePackage("minimal-pkg");
    const graph = buildSymbolGraph(parsed, pkgDir, warnings);

    expect(graph.barrelFile).toBe("index.ts");
    expect(graph.barrelExports).toHaveLength(1);
    expect(graph.barrelExports[0].name).toBe("greet");
    expect(graph.barrelExports[0].kind).toBe("function");
    expect(graph.barrelExports[0].definedIn).toBe("src/greet.ts");
    expect(graph.barrelExports[0].signature).toContain("name: string");
  });

  it("resolves barrel exports in hooks-pkg", () => {
    const { pkgDir, parsed, warnings } = parsePackage("hooks-pkg");
    const graph = buildSymbolGraph(parsed, pkgDir, warnings);

    expect(graph.barrelFile).toBe("index.ts");

    const exportNames = graph.barrelExports.map((e) => e.name);
    expect(exportNames).toContain("useCounter");
    expect(exportNames).toContain("useToggle");
    expect(exportNames).toContain("useLocalStorage");
    expect(exportNames).toContain("CounterOptions");

    // Star re-export from use-fetch should be expanded (E-24)
    expect(exportNames).toContain("useFetch");
    expect(exportNames).toContain("FetchResult");

    // Check resolved definitions
    const useCounter = graph.barrelExports.find(
      (e) => e.name === "useCounter",
    );
    expect(useCounter?.definedIn).toBe("src/hooks/use-counter.ts");
    expect(useCounter?.kind).toBe("hook");
  });

  it("tracks barrel source files", () => {
    const { pkgDir, parsed, warnings } = parsePackage("hooks-pkg");
    const graph = buildSymbolGraph(parsed, pkgDir, warnings);

    expect(graph.barrelSourceFiles.has("src/hooks/use-counter.ts")).toBe(true);
    expect(graph.barrelSourceFiles.has("src/hooks/use-toggle.ts")).toBe(true);
    expect(graph.barrelSourceFiles.has("src/hooks/use-fetch.ts")).toBe(true);
  });

  it("handles no-barrel package", () => {
    const { pkgDir, parsed, warnings } = parsePackage("no-barrel-pkg");
    const graph = buildSymbolGraph(parsed, pkgDir, warnings);

    expect(graph.barrelFile).toBeUndefined();
    expect(graph.barrelExports).toHaveLength(0);
    expect(warnings.some((w) => w.message.includes("No barrel file"))).toBe(
      true,
    );
  });

  it("handles circular re-exports without hanging (E-40)", () => {
    const { pkgDir, parsed, warnings } = parsePackage("circular-reexport-pkg");
    const graph = buildSymbolGraph(parsed, pkgDir, warnings);

    // Should complete without infinite loop
    expect(graph.barrelFile).toBe("index.ts");

    // Should detect the circular dependency
    const circularWarning = warnings.some(
      (w) =>
        w.message.includes("Circular") || w.message.includes("circular"),
    );
    expect(circularWarning).toBe(true);
  });

  it("finds barrel via exports field (E-41)", () => {
    const { pkgDir, parsed, warnings } = parsePackage("exports-pkg");
    const graph = buildSymbolGraph(parsed, pkgDir, warnings);

    expect(graph.barrelFile).toBe("src/index.ts");
    const exportNames = graph.barrelExports.map((e) => e.name);
    expect(exportNames).toContain("createClient");
    expect(exportNames).toContain("ClientOptions");

    const createClient = graph.barrelExports.find(
      (e) => e.name === "createClient",
    );
    expect(createClient?.definedIn).toBe("src/client.ts");
    expect(createClient?.kind).toBe("function");
  });

  it("builds allExports and importGraph", () => {
    const { pkgDir, parsed, warnings } = parsePackage("minimal-pkg");
    const graph = buildSymbolGraph(parsed, pkgDir, warnings);

    expect(graph.allExports.size).toBe(2); // index.ts and src/greet.ts
    expect(graph.importGraph.size).toBe(2);
  });
});
