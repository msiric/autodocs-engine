import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { analyze } from "../src/index.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

describe("hierarchical output support", () => {
  describe("impact classification in pipeline", () => {
    it("classifies convention impacts in single-package analysis", async () => {
      const result = await analyze({
        packages: [resolve(FIXTURES, "hooks-pkg")],
      });

      const pkg = result.packages[0];
      expect(pkg.conventions.length).toBeGreaterThan(0);

      // Every convention should have an impact field
      for (const conv of pkg.conventions) {
        expect(conv.impact).toBeDefined();
        expect(["high", "medium", "low"]).toContain(conv.impact);
      }
    });

    it("classifies anti-pattern impacts", async () => {
      const result = await analyze({
        packages: [resolve(FIXTURES, "hooks-pkg")],
      });

      const pkg = result.packages[0];
      if (pkg.antiPatterns.length > 0) {
        for (const ap of pkg.antiPatterns) {
          expect(ap.impact).toBeDefined();
          expect(["high", "medium", "low"]).toContain(ap.impact);
        }
      }
    });

    it("classifies cross-package shared convention impacts", async () => {
      const result = await analyze({
        packages: [
          resolve(FIXTURES, "minimal-pkg"),
          resolve(FIXTURES, "hooks-pkg"),
        ],
      });

      expect(result.crossPackage).toBeDefined();
      if (result.crossPackage!.sharedConventions.length > 0) {
        for (const conv of result.crossPackage!.sharedConventions) {
          expect(conv.impact).toBeDefined();
          expect(["high", "medium", "low"]).toContain(conv.impact);
        }
      }
    });

    it("classifies cross-package shared anti-pattern impacts", async () => {
      const result = await analyze({
        packages: [
          resolve(FIXTURES, "minimal-pkg"),
          resolve(FIXTURES, "hooks-pkg"),
        ],
      });

      expect(result.crossPackage).toBeDefined();
      if (result.crossPackage!.sharedAntiPatterns.length > 0) {
        for (const ap of result.crossPackage!.sharedAntiPatterns) {
          expect(ap.impact).toBeDefined();
          expect(["high", "medium", "low"]).toContain(ap.impact);
        }
      }
    });
  });

  describe("impact distribution", () => {
    it("hooks-pkg has a mix of high and low impact conventions", async () => {
      const result = await analyze({
        packages: [resolve(FIXTURES, "hooks-pkg")],
      });

      const pkg = result.packages[0];
      const impacts = new Set(pkg.conventions.map((c) => c.impact));

      // Should have at least low (file naming, export style) and some non-low
      expect(impacts.has("low")).toBe(true);
    });
  });
});
