// test/helpers/fixtures.ts — Shared test factory functions for ParsedFile, ExportEntry, ImportEntry, ContentSignals.
// Centralizes defaults so adding new fields (e.g., ContentSignals.promiseAllCount) doesn't break every test file.

import type {
  ContentSignals,
  Convention,
  ConventionConfidence,
  ExportEntry,
  ImportEntry,
  ParsedFile,
  SymbolKind,
  TierInfo,
  Warning,
} from "../../src/types.js";

// ─── ContentSignals ─────────────────────────────────────────────────────────

export function createContentSignals(overrides: Partial<ContentSignals> = {}): ContentSignals {
  return {
    tryCatchCount: 0,
    useMemoCount: 0,
    useCallbackCount: 0,
    useEffectCount: 0,
    useStateCount: 0,
    useQueryCount: 0,
    useMutationCount: 0,
    promiseAllCount: 0,
    asyncFunctionCount: 0,
    awaitInLoopCount: 0,
    jestMockCount: 0,
    hasDisplayName: false,
    hasErrorBoundary: false,
    ...overrides,
  };
}

// ─── ExportEntry ─────────────────────────────────────────────────────────────

export function createExport(overrides: Partial<ExportEntry> = {}): ExportEntry {
  return {
    name: "example",
    kind: "function" as SymbolKind,
    isReExport: false,
    isTypeOnly: false,
    ...overrides,
  };
}

// ─── ImportEntry ─────────────────────────────────────────────────────────────

export function createImport(overrides: Partial<ImportEntry> = {}): ImportEntry {
  return {
    moduleSpecifier: "./example.js",
    importedNames: [],
    isTypeOnly: false,
    isDynamic: false,
    ...overrides,
  };
}

// ─── ParsedFile ──────────────────────────────────────────────────────────────

export function createParsedFile(overrides: Partial<ParsedFile> = {}): ParsedFile {
  return {
    relativePath: "src/example.ts",
    exports: [],
    imports: [],
    contentSignals: createContentSignals(),
    lineCount: 50,
    isTestFile: false,
    isGeneratedFile: false,
    hasJSX: false,
    hasCJS: false,
    hasSyntaxErrors: false,
    callReferences: [],
    ...overrides,
  };
}

// ─── Tier helpers ────────────────────────────────────────────────────────────

export function createTiers(files: ParsedFile[], tier: 1 | 2 | 3 = 2): Map<string, TierInfo> {
  const map = new Map<string, TierInfo>();
  for (const f of files) {
    map.set(f.relativePath, { tier, reason: "test" });
  }
  return map;
}

export const emptyTiers = new Map<string, TierInfo>();
export const emptyWarnings: Warning[] = [];

// ─── Convention helpers ──────────────────────────────────────────────────────

export function createConvention(overrides: Partial<Convention> = {}): Convention {
  return {
    category: "ecosystem",
    name: "Test convention",
    description: "A test convention",
    confidence: createConfidence(),
    examples: [],
    ...overrides,
  };
}

export function createConfidence(overrides: Partial<ConventionConfidence> = {}): ConventionConfidence {
  return {
    matched: 10,
    total: 10,
    percentage: 100,
    description: "10 of 10 (100%)",
    ...overrides,
  };
}
