import { describe, expect, it } from "vitest";
import {
  createContentSignals,
  createConvention,
  createExport,
  createImport,
  createParsedFile,
  createTiers,
  emptyTiers,
  emptyWarnings,
} from "./fixtures.js";

describe("test factory functions", () => {
  it("createContentSignals returns valid defaults", () => {
    const signals = createContentSignals();
    expect(signals.tryCatchCount).toBe(0);
    expect(signals.useMemoCount).toBe(0);
    expect(signals.hasErrorBoundary).toBe(false);
  });

  it("createContentSignals accepts overrides", () => {
    const signals = createContentSignals({ tryCatchCount: 5, hasErrorBoundary: true });
    expect(signals.tryCatchCount).toBe(5);
    expect(signals.hasErrorBoundary).toBe(true);
    expect(signals.useMemoCount).toBe(0);
  });

  it("createParsedFile returns valid defaults", () => {
    const pf = createParsedFile();
    expect(pf.relativePath).toBe("src/example.ts");
    expect(pf.exports).toEqual([]);
    expect(pf.imports).toEqual([]);
    expect(pf.contentSignals.tryCatchCount).toBe(0);
    expect(pf.isTestFile).toBe(false);
    expect(pf.hasCJS).toBe(false);
    expect(pf.callReferences).toEqual([]);
  });

  it("createParsedFile accepts nested overrides", () => {
    const pf = createParsedFile({
      relativePath: "src/hooks/use-counter.ts",
      exports: [createExport({ name: "useCounter", kind: "hook" })],
      imports: [createImport({ moduleSpecifier: "react", importedNames: ["useState"] })],
      isTestFile: false,
    });
    expect(pf.relativePath).toBe("src/hooks/use-counter.ts");
    expect(pf.exports[0].name).toBe("useCounter");
    expect(pf.imports[0].moduleSpecifier).toBe("react");
  });

  it("createExport returns valid defaults", () => {
    const exp = createExport();
    expect(exp.name).toBe("example");
    expect(exp.kind).toBe("function");
    expect(exp.isReExport).toBe(false);
  });

  it("createImport returns valid defaults", () => {
    const imp = createImport();
    expect(imp.moduleSpecifier).toBe("./example.js");
    expect(imp.isTypeOnly).toBe(false);
  });

  it("createTiers maps all files to specified tier", () => {
    const files = [createParsedFile({ relativePath: "src/a.ts" }), createParsedFile({ relativePath: "src/b.ts" })];
    const tiers = createTiers(files, 1);
    expect(tiers.get("src/a.ts")?.tier).toBe(1);
    expect(tiers.get("src/b.ts")?.tier).toBe(1);
  });

  it("createConvention returns valid defaults", () => {
    const conv = createConvention({ name: "kebab-case filenames" });
    expect(conv.name).toBe("kebab-case filenames");
    expect(conv.confidence.percentage).toBe(100);
  });

  it("emptyTiers and emptyWarnings are reusable", () => {
    expect(emptyTiers.size).toBe(0);
    expect(emptyWarnings.length).toBe(0);
  });
});
