// src/mcp/queries/rename.ts — Rename impact

import type { StructuredAnalysis } from "../../types.js";
import { resolvePackage } from "./core.js";

// ─── Rename Queries ──────────────────────────────────────────────────────────

export interface RenameReference {
  file: string;
  kind: "definition" | "import" | "call" | "re-export";
  context: string; // e.g., "imports { parseFile } from './ast-parser.js'"
}

export interface RenameResult {
  symbol: string;
  sourceFile: string | null;
  symbolKind: string;
  references: RenameReference[];
}

/**
 * Find all references to a symbol across the codebase via import chain and call graph.
 * Returns the definition location and every file that imports or calls the symbol.
 * Optional filePath narrows to the definition in that specific file (disambiguation).
 */
export function findReferences(
  analysis: StructuredAnalysis,
  symbolName: string,
  packagePath?: string,
  filePath?: string,
): RenameResult {
  const pkg = resolvePackage(analysis, packagePath);

  // Determine definition location and kind (filePath narrows when multiple files export same name)
  const apiEntry = filePath
    ? pkg.publicAPI.find((e) => e.name === symbolName && e.sourceFile === filePath)
    : pkg.publicAPI.find((e) => e.name === symbolName);
  let sourceFile: string | null = apiEntry?.sourceFile ?? filePath ?? null;
  let symbolKind: string = apiEntry?.kind ?? "unknown";

  // Fall back to call graph for internal functions
  if (!sourceFile) {
    for (const edge of pkg.callGraph ?? []) {
      if (edge.from === symbolName) {
        sourceFile = edge.fromFile;
        symbolKind = "function";
        break;
      }
      if (edge.to === symbolName) {
        sourceFile = edge.toFile;
        symbolKind = "function";
        break;
      }
    }
  }

  // Fall back to import chain (someone imports it — the source is where it's defined)
  if (!sourceFile) {
    const edge = (pkg.importChain ?? []).find((e) => e.symbols.includes(symbolName));
    if (edge) {
      sourceFile = edge.source;
      if (symbolKind === "unknown") symbolKind = "symbol";
    }
  }

  const refs: RenameReference[] = [];

  // Pre-index: which exported names exist per file? (avoids O(n) filter per edge)
  const exportsByFile = new Map<string, Set<string>>();
  for (const e of pkg.publicAPI) {
    let s = exportsByFile.get(e.sourceFile);
    if (!s) {
      s = new Set();
      exportsByFile.set(e.sourceFile, s);
    }
    s.add(e.name);
  }

  // Definition site
  if (sourceFile) {
    refs.push({ file: sourceFile, kind: "definition", context: `defines ${symbolKind} ${symbolName}` });
  }

  // Import references
  for (const edge of pkg.importChain ?? []) {
    if (!edge.symbols.includes(symbolName)) continue;
    if (edge.importer === sourceFile) continue; // Skip self-import
    refs.push({
      file: edge.importer,
      kind: "import",
      context: `imports { ${symbolName} } from '${edge.source}'`,
    });
  }

  // Re-export references (barrel files re-exporting this symbol)
  const refsByFile = new Map<string, RenameReference>();
  for (const r of refs) refsByFile.set(`${r.file}:${r.kind}`, r);

  for (const edge of pkg.importChain ?? []) {
    if (!edge.symbols.includes(symbolName)) continue;
    if (edge.source !== sourceFile) continue;
    // Check if this importer also exports the symbol (re-export chain)
    if (exportsByFile.get(edge.importer)?.has(symbolName)) {
      // Already counted as import — upgrade to re-export
      const existing = refsByFile.get(`${edge.importer}:import`);
      if (existing) {
        existing.kind = "re-export";
        existing.context = `re-exports { ${symbolName} } from '${edge.source}'`;
      }
    }
  }

  // Call graph references
  const referencedFiles = new Set(refs.map((r) => r.file));
  for (const edge of pkg.callGraph ?? []) {
    if (edge.to === symbolName && edge.fromFile !== sourceFile) {
      if (!referencedFiles.has(edge.fromFile)) {
        referencedFiles.add(edge.fromFile);
        refs.push({ file: edge.fromFile, kind: "call", context: `${edge.from}() calls ${symbolName}()` });
      }
    }
  }

  return { symbol: symbolName, sourceFile, symbolKind, references: refs };
}
