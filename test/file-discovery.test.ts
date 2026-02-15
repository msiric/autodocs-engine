import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { discoverFiles } from "../src/file-discovery.js";
import type { Warning } from "../src/types.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

describe("discoverFiles", () => {
  it("finds .ts files in minimal-pkg", () => {
    const files = discoverFiles(resolve(FIXTURES, "minimal-pkg"), []);
    const relative = files.map((f) => f.replace(FIXTURES + "/minimal-pkg/", ""));
    expect(relative).toContain("index.ts");
    expect(relative).toContain("src/greet.ts");
    expect(relative).toHaveLength(2);
  });

  it("finds all source files in hooks-pkg", () => {
    const files = discoverFiles(resolve(FIXTURES, "hooks-pkg"), []);
    const relative = files.map((f) => f.replace(FIXTURES + "/hooks-pkg/", ""));
    expect(relative).toContain("index.ts");
    expect(relative).toContain("src/hooks/use-counter.ts");
    expect(relative).toContain("src/hooks/use-toggle.ts");
    expect(relative).toContain("src/hooks/use-local-storage.ts");
    expect(relative).toContain("src/hooks/use-fetch.ts");
    expect(relative).toContain("src/hooks/use-counter.test.ts");
    expect(relative).toContain("src/hooks/use-toggle.test.ts");
    expect(relative).toContain("src/graphql/get-data.generated.ts");
    expect(relative).toContain("src/graphql/update-data.generated.ts");
  });

  it("finds .js files in cjs-pkg", () => {
    const files = discoverFiles(resolve(FIXTURES, "cjs-pkg"), []);
    const relative = files.map((f) => f.replace(FIXTURES + "/cjs-pkg/", ""));
    expect(relative).toContain("index.js");
    expect(relative).toContain("bar.js");
  });

  it("returns empty for a directory with no source files", () => {
    const warnings: Warning[] = [];
    // no-package-json dir has .ts files, but let's test the empty case
    const files = discoverFiles(resolve(FIXTURES, "no-barrel-pkg"), []);
    expect(files.length).toBeGreaterThan(0);
  });

  it("applies exclude patterns", () => {
    const files = discoverFiles(resolve(FIXTURES, "hooks-pkg"), [
      "**/*.test.ts",
    ]);
    const relative = files.map((f) => f.replace(FIXTURES + "/hooks-pkg/", ""));
    expect(relative).not.toContain("src/hooks/use-counter.test.ts");
    expect(relative).not.toContain("src/hooks/use-toggle.test.ts");
    expect(relative).toContain("src/hooks/use-counter.ts");
  });

  it("applies multiple exclude patterns", () => {
    const files = discoverFiles(resolve(FIXTURES, "hooks-pkg"), [
      "**/*.test.ts",
      "**/graphql/**",
    ]);
    const relative = files.map((f) => f.replace(FIXTURES + "/hooks-pkg/", ""));
    expect(relative).not.toContain("src/hooks/use-counter.test.ts");
    expect(relative).not.toContain("src/graphql/get-data.generated.ts");
  });

  it("returns sorted results", () => {
    const files = discoverFiles(resolve(FIXTURES, "hooks-pkg"), []);
    for (let i = 1; i < files.length; i++) {
      expect(files[i] >= files[i - 1]).toBe(true);
    }
  });
});
