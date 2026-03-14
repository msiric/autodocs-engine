import { describe, expect, it } from "vitest";
import { errorHandlingDetector } from "../src/detectors/error-handling.js";
import { createExport, createImport, createParsedFile, createTiers } from "./helpers/fixtures.js";

describe("error-handling detector", () => {
  // ─── Custom error classes ──────────────────────────────────────────────────

  it("detects custom error classes from exports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/errors/not-found.ts",
        exports: [createExport({ name: "NotFoundError", kind: "class" })],
      }),
      createParsedFile({
        relativePath: "src/errors/validation.ts",
        exports: [createExport({ name: "ValidationError", kind: "class" })],
      }),
      createParsedFile({
        relativePath: "src/utils.ts",
        exports: [createExport({ name: "formatDate", kind: "function" })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    const errorConv = result.find((c) => c.name.includes("Custom error class"));
    expect(errorConv).toBeDefined();
    expect(errorConv!.category).toBe("error-handling");
    expect(errorConv!.examples).toContain("NotFoundError");
    expect(errorConv!.examples).toContain("ValidationError");
  });

  it("detects typed error class hierarchy when >= 3 error classes", () => {
    const files = [
      createParsedFile({
        relativePath: "src/errors/base.ts",
        exports: [createExport({ name: "AppError", kind: "class" })],
      }),
      createParsedFile({
        relativePath: "src/errors/not-found.ts",
        exports: [createExport({ name: "NotFoundError", kind: "class" })],
      }),
      createParsedFile({
        relativePath: "src/errors/auth.ts",
        exports: [createExport({ name: "AuthError", kind: "class" })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    const hierarchyConv = result.find((c) => c.name === "Typed error class hierarchy");
    expect(hierarchyConv).toBeDefined();
    expect(hierarchyConv!.description).toContain("3 typed error class");
  });

  it("ignores classes not ending in Error or Exception", () => {
    const files = [
      createParsedFile({
        relativePath: "src/user.ts",
        exports: [createExport({ name: "UserService", kind: "class" })],
      }),
      createParsedFile({
        relativePath: "src/db.ts",
        exports: [createExport({ name: "DatabaseClient", kind: "class" })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    expect(result).toHaveLength(0);
  });

  it("requires at least 2 error classes to report", () => {
    const files = [
      createParsedFile({
        relativePath: "src/errors.ts",
        exports: [createExport({ name: "AppError", kind: "class" })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    expect(result.filter((c) => c.name.includes("error class"))).toHaveLength(0);
  });

  it("detects Exception suffix as well as Error", () => {
    const files = [
      createParsedFile({
        relativePath: "src/errors/http.ts",
        exports: [createExport({ name: "HttpException", kind: "class" })],
      }),
      createParsedFile({
        relativePath: "src/errors/timeout.ts",
        exports: [createExport({ name: "TimeoutError", kind: "class" })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    expect(result.find((c) => c.name.includes("Custom error class"))).toBeDefined();
  });

  // ─── Result/Either library detection ───────────────────────────────────────

  it("detects neverthrow usage", () => {
    const files = [
      createParsedFile({
        relativePath: "src/service.ts",
        imports: [createImport({ moduleSpecifier: "neverthrow", importedNames: ["Result", "ok", "err"] })],
      }),
      createParsedFile({
        relativePath: "src/handler.ts",
        imports: [createImport({ moduleSpecifier: "neverthrow", importedNames: ["Result"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    const resultConv = result.find((c) => c.name === "Result/Either pattern");
    expect(resultConv).toBeDefined();
    expect(resultConv!.description).toContain("neverthrow");
    expect(resultConv!.confidence.matched).toBe(2);
  });

  it("detects Effect (typed errors)", () => {
    const files = [
      createParsedFile({
        relativePath: "src/program.ts",
        imports: [createImport({ moduleSpecifier: "effect", importedNames: ["Effect"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    const effectConv = result.find((c) => c.name === "Result/Either pattern");
    expect(effectConv).toBeDefined();
    expect(effectConv!.description).toContain("Effect");
  });

  it("detects fp-ts Either", () => {
    const files = [
      createParsedFile({
        relativePath: "src/either.ts",
        imports: [createImport({ moduleSpecifier: "fp-ts/Either", importedNames: ["Either", "left", "right"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    expect(result.find((c) => c.name === "Result/Either pattern")).toBeDefined();
  });

  it("ignores type-only imports of result libraries", () => {
    const files = [
      createParsedFile({
        relativePath: "src/types.ts",
        imports: [createImport({ moduleSpecifier: "neverthrow", importedNames: ["Result"], isTypeOnly: true })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    expect(result.filter((c) => c.name === "Result/Either pattern")).toHaveLength(0);
  });

  // ─── Custom Result types ──────────────────────────────────────────────────

  it("detects custom Result/Ok/Err type exports when no library is used", () => {
    const files = [
      createParsedFile({
        relativePath: "src/result.ts",
        exports: [
          createExport({ name: "Result", kind: "type" }),
          createExport({ name: "Ok", kind: "type" }),
          createExport({ name: "Err", kind: "type" }),
        ],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    const customConv = result.find((c) => c.name === "Custom Result type pattern");
    expect(customConv).toBeDefined();
    expect(customConv!.description).toContain("Result");
  });

  it("does not report custom Result types if a library is detected", () => {
    const files = [
      createParsedFile({
        relativePath: "src/result.ts",
        exports: [createExport({ name: "Result", kind: "type" }), createExport({ name: "Ok", kind: "type" })],
        imports: [createImport({ moduleSpecifier: "neverthrow", importedNames: ["Result"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    expect(result.find((c) => c.name === "Custom Result type pattern")).toBeUndefined();
    expect(result.find((c) => c.name === "Result/Either pattern")).toBeDefined();
  });

  it("requires at least 2 result-style exports to report", () => {
    const files = [
      createParsedFile({
        relativePath: "src/result.ts",
        exports: [createExport({ name: "Result", kind: "type" })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    expect(result.find((c) => c.name === "Custom Result type pattern")).toBeUndefined();
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────

  it("returns empty for empty file list", () => {
    const result = errorHandlingDetector([], new Map(), []);
    expect(result).toHaveLength(0);
  });

  it("only analyzes T1/T2 files (skips T3 test files)", () => {
    const files = [
      createParsedFile({
        relativePath: "test/errors.test.ts",
        exports: [
          createExport({ name: "TestError", kind: "class" }),
          createExport({ name: "MockError", kind: "class" }),
        ],
        isTestFile: true,
      }),
    ];
    const tiers = createTiers(files, 3);
    const result = errorHandlingDetector(files, tiers, []);
    expect(result).toHaveLength(0);
  });

  it("can detect both error classes and Result pattern simultaneously", () => {
    const files = [
      createParsedFile({
        relativePath: "src/errors/app.ts",
        exports: [createExport({ name: "AppError", kind: "class" })],
      }),
      createParsedFile({
        relativePath: "src/errors/validation.ts",
        exports: [createExport({ name: "ValidationError", kind: "class" })],
      }),
      createParsedFile({
        relativePath: "src/service.ts",
        imports: [createImport({ moduleSpecifier: "neverthrow", importedNames: ["Result"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = errorHandlingDetector(files, tiers, []);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.find((c) => c.name.includes("error class"))).toBeDefined();
    expect(result.find((c) => c.name === "Result/Either pattern")).toBeDefined();
  });
});
