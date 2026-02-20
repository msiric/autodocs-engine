// src/impact-radius.ts — Compute change impact radius from call graph
// Answers: "If I change function X, what else is affected?"
// Uses BFS on the reverse call graph for transitive impact.

import type { CallGraphEdge } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImpactEntry {
  functionName: string;
  file: string;
  directCallers: number;
  transitiveCallers: number;
  directCalls: number;
}

export interface ImpactAnalysis {
  /** Functions with the most callers — high blast radius if changed. */
  highImpact: ImpactEntry[];
  /** Functions that call the most others — complex orchestrators. */
  complex: ImpactEntry[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_EDGES = 10;
const TOP_IMPACT_COUNT = 5;
const TOP_COMPLEX_COUNT = 3;

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * Compute impact radius metrics from a call graph.
 * Returns empty arrays if the graph has fewer than MIN_EDGES edges.
 */
export function computeImpactRadius(callGraph: CallGraphEdge[]): ImpactAnalysis {
  if (callGraph.length < MIN_EDGES) {
    return { highImpact: [], complex: [] };
  }

  const reverseAdj = buildReverseAdjacency(callGraph);
  const forwardAdj = buildForwardAdjacency(callGraph);

  // Collect file mapping: function → first file it appears in as a callee
  const fileMap = new Map<string, string>();
  for (const edge of callGraph) {
    if (!fileMap.has(edge.to)) fileMap.set(edge.to, edge.toFile);
    if (!fileMap.has(edge.from)) fileMap.set(edge.from, edge.fromFile);
  }

  // Compute metrics for all functions that appear as callees (have callers)
  const entries: ImpactEntry[] = [];
  for (const [fn, directCallerSet] of reverseAdj) {
    const transitiveCallers = bfsReachability(fn, reverseAdj);
    const directCalls = forwardAdj.get(fn)?.size ?? 0;
    entries.push({
      functionName: fn,
      file: fileMap.get(fn) ?? "",
      directCallers: directCallerSet.size,
      transitiveCallers,
      directCalls,
    });
  }

  // Also add functions that are only callers (not callees) for the complex list
  for (const [fn, calleeSet] of forwardAdj) {
    if (reverseAdj.has(fn)) continue; // Already in entries
    entries.push({
      functionName: fn,
      file: fileMap.get(fn) ?? "",
      directCallers: 0,
      transitiveCallers: 0,
      directCalls: calleeSet.size,
    });
  }

  // High impact: sort by transitive callers descending, then direct callers
  const highImpact = [...entries]
    .filter((e) => e.directCallers >= 2)
    .sort((a, b) => b.transitiveCallers - a.transitiveCallers || b.directCallers - a.directCallers)
    .slice(0, TOP_IMPACT_COUNT);

  // Complex: sort by out-degree descending, exclude those already in highImpact
  const highImpactNames = new Set(highImpact.map((e) => e.functionName));
  const complex = [...entries]
    .filter((e) => e.directCalls >= 3 && !highImpactNames.has(e.functionName))
    .sort((a, b) => b.directCalls - a.directCalls)
    .slice(0, TOP_COMPLEX_COUNT);

  return { highImpact, complex };
}

// ─── Graph Helpers ───────────────────────────────────────────────────────────

/** Build reverse adjacency: callee → Set<callers>. */
function buildReverseAdjacency(edges: CallGraphEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    const set = adj.get(edge.to) ?? new Set();
    set.add(edge.from);
    adj.set(edge.to, set);
  }
  return adj;
}

/** Build forward adjacency: caller → Set<callees>. */
function buildForwardAdjacency(edges: CallGraphEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    const set = adj.get(edge.from) ?? new Set();
    set.add(edge.to);
    adj.set(edge.from, set);
  }
  return adj;
}

/**
 * BFS from a function through the reverse adjacency to count all transitive callers.
 * "If this function changes, how many functions are transitively affected?"
 */
function bfsReachability(start: string, reverseAdj: Map<string, Set<string>>): number {
  const visited = new Set<string>();
  const queue = [start];
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const callers = reverseAdj.get(current);
    if (!callers) continue;
    for (const caller of callers) {
      if (!visited.has(caller)) {
        visited.add(caller);
        queue.push(caller);
      }
    }
  }

  // Subtract 1 to exclude the start node itself
  return visited.size - 1;
}

// ─── Impact Labels ───────────────────────────────────────────────────────────

/** Generate a short impact label based on caller count. */
export function impactLabel(transitiveCallers: number): string {
  if (transitiveCallers >= 15) return "Critical — widely depended on";
  if (transitiveCallers >= 8) return "High — used by many modules";
  if (transitiveCallers >= 3) return "Moderate — multiple callers";
  return "Low";
}

/** Generate a complexity label based on call count. */
export function complexityLabel(directCalls: number): string {
  if (directCalls >= 12) return "Very complex — many dependencies";
  if (directCalls >= 7) return "Complex — many dependencies";
  if (directCalls >= 4) return "Moderate complexity";
  return "Simple";
}
