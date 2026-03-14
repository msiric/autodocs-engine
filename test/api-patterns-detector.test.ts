import { describe, expect, it } from "vitest";
import { apiPatternsDetector } from "../src/detectors/api-patterns.js";
import type { DetectorContext } from "../src/types.js";
import { createImport, createParsedFile, createTiers } from "./helpers/fixtures.js";

function makeContext(frameworks: { name: string; version: string }[] = []): DetectorContext {
  return {
    dependencies: {
      runtime: [],
      frameworks,
    },
  };
}

describe("api-patterns detector", () => {
  // ─── Framework-specific detection ──────────────────────────────────────────

  it("detects Express from imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/app.ts",
        imports: [createImport({ moduleSpecifier: "express", importedNames: ["Router"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = apiPatternsDetector(files, tiers, [], makeContext());
    const conv = result.find((c) => c.name === "Express API");
    expect(conv).toBeDefined();
    expect(conv!.category).toBe("api-patterns");
  });

  it("detects Fastify from imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/server.ts",
        imports: [createImport({ moduleSpecifier: "fastify", importedNames: ["Fastify"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = apiPatternsDetector(files, tiers, [], makeContext());
    expect(result.find((c) => c.name === "Fastify API")).toBeDefined();
  });

  it("detects Hono from imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/app.ts",
        imports: [createImport({ moduleSpecifier: "hono", importedNames: ["Hono"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = apiPatternsDetector(files, tiers, [], makeContext());
    expect(result.find((c) => c.name === "Hono API")).toBeDefined();
  });

  it("detects NestJS from @nestjs/common imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/users/users.controller.ts",
        imports: [createImport({ moduleSpecifier: "@nestjs/common", importedNames: ["Controller", "Get"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = apiPatternsDetector(files, tiers, [], makeContext());
    expect(result.find((c) => c.name === "NestJS API")).toBeDefined();
  });

  it("detects tRPC from @trpc/server imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/router.ts",
        imports: [createImport({ moduleSpecifier: "@trpc/server", importedNames: ["initTRPC"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = apiPatternsDetector(files, tiers, [], makeContext());
    expect(result.find((c) => c.name === "tRPC API")).toBeDefined();
  });

  it("detects GraphQL server from apollo imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/schema.ts",
        imports: [createImport({ moduleSpecifier: "@apollo/server", importedNames: ["ApolloServer"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = apiPatternsDetector(files, tiers, [], makeContext());
    expect(result.find((c) => c.name === "GraphQL server API")).toBeDefined();
  });

  // ─── Dependency context detection ──────────────────────────────────────────

  it("detects framework from DependencyInsights even without imports", () => {
    const files = [createParsedFile({ relativePath: "src/app.ts" })];
    const tiers = createTiers(files);
    const ctx = makeContext([{ name: "fastify", version: "4.0.0" }]);
    const result = apiPatternsDetector(files, tiers, [], ctx);
    expect(result.find((c) => c.name === "Fastify API")).toBeDefined();
  });

  it("reports file count when imports are present alongside deps", () => {
    const files = [
      createParsedFile({
        relativePath: "src/routes/users.ts",
        imports: [createImport({ moduleSpecifier: "express", importedNames: ["Router"] })],
      }),
      createParsedFile({
        relativePath: "src/routes/posts.ts",
        imports: [createImport({ moduleSpecifier: "express", importedNames: ["Router"] })],
      }),
    ];
    const tiers = createTiers(files);
    const ctx = makeContext([{ name: "express", version: "4.18.0" }]);
    const result = apiPatternsDetector(files, tiers, [], ctx);
    const conv = result.find((c) => c.name === "Express API");
    expect(conv).toBeDefined();
    expect(conv!.description).toContain("2 files");
  });

  // ─── Multiple frameworks ──────────────────────────────────────────────────

  it("detects multiple API frameworks", () => {
    const files = [
      createParsedFile({
        relativePath: "src/rest.ts",
        imports: [createImport({ moduleSpecifier: "express", importedNames: ["Router"] })],
      }),
      createParsedFile({
        relativePath: "src/graphql.ts",
        imports: [createImport({ moduleSpecifier: "@apollo/server", importedNames: ["ApolloServer"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = apiPatternsDetector(files, tiers, [], makeContext());
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.name === "Express API")).toBeDefined();
    expect(result.find((c) => c.name === "GraphQL server API")).toBeDefined();
  });

  // ─── Subpath imports ──────────────────────────────────────────────────────

  it("detects subpath imports (e.g., @nestjs/common/decorators)", () => {
    const files = [
      createParsedFile({
        relativePath: "src/app.ts",
        imports: [createImport({ moduleSpecifier: "@nestjs/common/decorators", importedNames: ["Get"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = apiPatternsDetector(files, tiers, [], makeContext());
    expect(result.find((c) => c.name === "NestJS API")).toBeDefined();
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────

  it("returns empty for no API framework imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/utils.ts",
        imports: [createImport({ moduleSpecifier: "lodash", importedNames: ["map"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = apiPatternsDetector(files, tiers, [], makeContext());
    expect(result).toHaveLength(0);
  });

  it("returns empty for empty files", () => {
    expect(apiPatternsDetector([], new Map(), [])).toHaveLength(0);
  });

  it("ignores type-only imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/types.ts",
        imports: [createImport({ moduleSpecifier: "express", importedNames: ["Request"], isTypeOnly: true })],
      }),
    ];
    const tiers = createTiers(files);
    const result = apiPatternsDetector(files, tiers, [], makeContext());
    expect(result).toHaveLength(0);
  });

  it("skips T3 test files", () => {
    const files = [
      createParsedFile({
        relativePath: "test/server.test.ts",
        imports: [createImport({ moduleSpecifier: "express", importedNames: ["Router"] })],
        isTestFile: true,
      }),
    ];
    const tiers = createTiers(files, 3);
    expect(apiPatternsDetector(files, tiers, [], makeContext())).toHaveLength(0);
  });

  it("handles no context gracefully", () => {
    const files = [
      createParsedFile({
        relativePath: "src/app.ts",
        imports: [createImport({ moduleSpecifier: "hono", importedNames: ["Hono"] })],
      }),
    ];
    const tiers = createTiers(files);
    // No context argument
    const result = apiPatternsDetector(files, tiers, []);
    expect(result.find((c) => c.name === "Hono API")).toBeDefined();
  });
});
