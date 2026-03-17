// src/mcp/queries/search.ts — Symbol/file search

import type { StructuredAnalysis } from "../../types.js";
import { resolvePackage } from "./core.js";

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  name: string;
  kind: string;
  sourceFile: string;
  importCount: number;
  callers: string[];
  callees: string[];
  context?: string;
}

/**
 * Search across all data sources: public API, call graph functions, file paths,
 * conventions, and workflow rules. Results are deduplicated and sorted by signal
 * priority (API symbols first, then internal functions, files, conventions/rules).
 */
export function search(analysis: StructuredAnalysis, query: string, packagePath?: string, limit = 20): SearchResult[] {
  const pkg = resolvePackage(analysis, packagePath);
  const q = query.toLowerCase();
  const results = new Map<string, SearchResult>();
  const callGraph = pkg.callGraph ?? [];

  // Pre-build call graph indexes for enrichment (single pass)
  const callersOf = new Map<string, string[]>();
  const calleesOf = new Map<string, string[]>();
  for (const edge of callGraph) {
    let arr = callersOf.get(edge.to);
    if (!arr) {
      arr = [];
      callersOf.set(edge.to, arr);
    }
    arr.push(edge.from);

    arr = calleesOf.get(edge.from);
    if (!arr) {
      arr = [];
      calleesOf.set(edge.from, arr);
    }
    arr.push(edge.to);
  }

  // Pass 1: Public API (highest-value — has kind, signature, importCount)
  for (const entry of pkg.publicAPI ?? []) {
    if (!entry.name.toLowerCase().includes(q)) continue;
    results.set(entry.name, {
      name: entry.name,
      kind: entry.kind,
      sourceFile: entry.sourceFile,
      importCount: entry.importCount ?? 0,
      callers: (callersOf.get(entry.name) ?? []).slice(0, 3),
      callees: (calleesOf.get(entry.name) ?? []).slice(0, 3),
    });
  }

  // Pass 2: Call graph functions not in public API
  for (const edge of callGraph) {
    for (const fn of [edge.from, edge.to]) {
      if (results.has(fn) || !fn.toLowerCase().includes(q)) continue;
      const file = edge.from === fn ? edge.fromFile : edge.toFile;
      results.set(fn, {
        name: fn,
        kind: "function",
        sourceFile: file,
        importCount: 0,
        callers: (callersOf.get(fn) ?? []).slice(0, 3),
        callees: (calleesOf.get(fn) ?? []).slice(0, 3),
      });
    }
  }

  // Pass 3: File paths (skip files already shown as sourceFile of a matched symbol)
  const coveredFiles = new Set([...results.values()].map((r) => r.sourceFile));
  const seenFiles = new Set<string>();
  const coChangeEdges = pkg.gitHistory?.coChangeEdges ?? [];

  for (const edge of pkg.importChain ?? []) {
    for (const filePath of [edge.importer, edge.source]) {
      if (seenFiles.has(filePath) || coveredFiles.has(filePath)) continue;
      if (!filePath.toLowerCase().includes(q)) continue;
      seenFiles.add(filePath);

      // Find highest-Jaccard co-change partner for context
      let context: string | undefined;
      let coChange: (typeof coChangeEdges)[number] | undefined;
      for (const e of coChangeEdges) {
        if ((e.file1 === filePath || e.file2 === filePath) && (!coChange || e.jaccard > coChange.jaccard)) {
          coChange = e;
        }
      }
      if (coChange) {
        const partner = coChange.file1 === filePath ? coChange.file2 : coChange.file1;
        context = `co-changes with ${partner} (${Math.round(coChange.jaccard * 100)}%)`;
      }

      results.set(`file:${filePath}`, {
        name: filePath,
        kind: "file",
        sourceFile: filePath,
        importCount: 0,
        callers: [],
        callees: [],
        context,
      });
    }
  }

  // Pass 4: Conventions and workflow rules
  for (const conv of pkg.conventions ?? []) {
    if (!conv.name.toLowerCase().includes(q) && !conv.description.toLowerCase().includes(q)) continue;
    const key = `conv:${conv.name}`;
    if (results.has(key)) continue;
    results.set(key, {
      name: conv.name,
      kind: "convention",
      sourceFile: conv.source ?? conv.category,
      importCount: 0,
      callers: [],
      callees: [],
      context: conv.description,
    });
  }

  for (const rule of analysis.crossPackage?.workflowRules ?? []) {
    if (!rule.trigger.toLowerCase().includes(q) && !rule.action.toLowerCase().includes(q)) continue;
    const key = `rule:${rule.trigger}`;
    if (results.has(key)) continue;
    results.set(key, {
      name: rule.trigger,
      kind: "rule",
      sourceFile: rule.source,
      importCount: 0,
      callers: [],
      callees: [],
      context: rule.action,
    });
  }

  return [...results.values()].slice(0, limit);
}
