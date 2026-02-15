import { describe, it, expect, afterEach } from "vitest";
import { parseFile } from "../src/ast-parser.js";
import { buildPublicAPI } from "../src/analysis-builder.js";
import type { SymbolGraph, ParsedFile, ResolvedExport, Warning } from "../src/types.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = join(import.meta.dirname ?? __dirname, ".fixtures-temp");

function setupFixture(filename: string, content: string): string {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const filepath = join(FIXTURE_DIR, filename);
  writeFileSync(filepath, content);
  return filepath;
}

function cleanup(): void {
  try {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("Fix B: React check for hook classification", () => {
  afterEach(cleanup);

  it("classifies use-prefixed function as 'hook' when file imports React", () => {
    const filepath = setupFixture("use-data.ts", `
import { useState } from "react";
export function useData() {
  const [data, setData] = useState(null);
  return { data, setData };
}
`);
    const warnings: Warning[] = [];
    const parsed = parseFile(filepath, FIXTURE_DIR, warnings);
    const hookExport = parsed.exports.find((e) => e.name === "useData");
    expect(hookExport).toBeDefined();
    expect(hookExport!.kind).toBe("hook");
  });

  it("classifies use-prefixed function as 'function' when file does NOT import React", () => {
    const filepath = setupFixture("use-middleware.ts", `
export function useMiddleware(handler: any) {
  return (req: any, res: any, next: any) => {
    handler(req, res, next);
  };
}
`);
    const warnings: Warning[] = [];
    const parsed = parseFile(filepath, FIXTURE_DIR, warnings);
    const fnExport = parsed.exports.find((e) => e.name === "useMiddleware");
    expect(fnExport).toBeDefined();
    expect(fnExport!.kind).toBe("function");
  });

  it("classifies use-prefixed arrow function as 'function' in non-React file", () => {
    const filepath = setupFixture("use-query.ts", `
export const useQuery = (sql: string) => {
  return { rows: [], sql };
};
`);
    const warnings: Warning[] = [];
    const parsed = parseFile(filepath, FIXTURE_DIR, warnings);
    const fnExport = parsed.exports.find((e) => e.name === "useQuery");
    expect(fnExport).toBeDefined();
    expect(fnExport!.kind).toBe("function");
  });

  it("classifies use-prefixed function as 'hook' with preact import", () => {
    const filepath = setupFixture("use-signal.ts", `
import { signal } from "preact";
export function useSignal() {
  return signal(0);
}
`);
    const warnings: Warning[] = [];
    const parsed = parseFile(filepath, FIXTURE_DIR, warnings);
    const hookExport = parsed.exports.find((e) => e.name === "useSignal");
    expect(hookExport).toBeDefined();
    expect(hookExport!.kind).toBe("hook");
  });
});

describe("Fix B: buildPublicAPI also applies React check", () => {
  it("reclassifies use-prefixed export as function when source file has no React import", () => {
    const parsedFiles: ParsedFile[] = [
      {
        relativePath: "src/middleware.ts",
        exports: [{ name: "useMiddleware", kind: "unknown", isReExport: false, isTypeOnly: false }],
        imports: [{ moduleSpecifier: "hono", importedNames: ["Hono"], isTypeOnly: false, isDynamic: false }],
        contentSignals: { tryCatchCount: 0, useMemoCount: 0, useCallbackCount: 0, useEffectCount: 0, useStateCount: 0, useQueryCount: 0, useMutationCount: 0, jestMockCount: 0, hasDisplayName: false, hasErrorBoundary: false },
        lineCount: 10,
        isTestFile: false,
        isGeneratedFile: false,
        hasJSX: false,
        hasCJS: false,
        hasSyntaxErrors: false,
      },
    ];

    const symbolGraph: SymbolGraph = {
      barrelFile: "src/index.ts",
      barrelExports: [
        { name: "useMiddleware", kind: "unknown", isReExport: true, isTypeOnly: false, definedIn: "src/middleware.ts" },
      ],
      allExports: new Map(),
      importGraph: new Map(),
      barrelSourceFiles: new Set(["src/middleware.ts"]),
    };

    const warnings: Warning[] = [];
    const publicAPI = buildPublicAPI(symbolGraph, parsedFiles, 100, warnings);
    expect(publicAPI[0].kind).toBe("function");
  });
});

describe("Fix C: Export cap ranking by importance", () => {
  it("prioritizes hooks and functions over types when capping", () => {
    const barrelExports: ResolvedExport[] = [];

    // Add 60 types
    for (let i = 0; i < 60; i++) {
      barrelExports.push({
        name: `Type${i}`,
        kind: "type",
        isReExport: false,
        isTypeOnly: true,
        definedIn: "src/types.ts",
      });
    }

    // Add 30 hooks
    for (let i = 0; i < 30; i++) {
      barrelExports.push({
        name: `useHook${i}`,
        kind: "hook",
        isReExport: false,
        isTypeOnly: false,
        definedIn: `src/hooks/use-hook-${i}.ts`,
      });
    }

    // Add 20 functions
    for (let i = 0; i < 20; i++) {
      barrelExports.push({
        name: `func${i}`,
        kind: "function",
        isReExport: false,
        isTypeOnly: false,
        definedIn: "src/utils.ts",
      });
    }

    // Parsed files that import from react (so hooks stay as hooks)
    const parsedFiles: ParsedFile[] = [];
    for (let i = 0; i < 30; i++) {
      parsedFiles.push({
        relativePath: `src/hooks/use-hook-${i}.ts`,
        exports: [],
        imports: [{ moduleSpecifier: "react", importedNames: ["useState"], isTypeOnly: false, isDynamic: false }],
        contentSignals: { tryCatchCount: 0, useMemoCount: 0, useCallbackCount: 0, useEffectCount: 0, useStateCount: 0, useQueryCount: 0, useMutationCount: 0, jestMockCount: 0, hasDisplayName: false, hasErrorBoundary: false },
        lineCount: 10,
        isTestFile: false,
        isGeneratedFile: false,
        hasJSX: false,
        hasCJS: false,
        hasSyntaxErrors: false,
      });
    }

    const symbolGraph: SymbolGraph = {
      barrelFile: "src/index.ts",
      barrelExports,
      allExports: new Map(),
      importGraph: new Map(),
      barrelSourceFiles: new Set(),
    };

    const warnings: Warning[] = [];
    // Cap at 50 (total is 110)
    const publicAPI = buildPublicAPI(symbolGraph, parsedFiles, 50, warnings);

    expect(publicAPI).toHaveLength(50);

    // All 30 hooks should survive
    const hooks = publicAPI.filter((e) => e.kind === "hook");
    expect(hooks).toHaveLength(30);

    // All 20 functions should survive
    const functions = publicAPI.filter((e) => e.kind === "function");
    expect(functions).toHaveLength(20);

    // No types should survive (only 50 slots, 30 hooks + 20 functions = 50)
    const types = publicAPI.filter((e) => e.kind === "type");
    expect(types).toHaveLength(0);
  });
});
