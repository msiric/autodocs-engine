// src/implicit-coupling.ts — Detect co-change pairs with no import relationship.
// These are "implicit coupling" — files that historically change together but have
// no static dependency. They represent shared config, runtime registration, database
// schema dependencies, or conventions that both files must follow.
// Computed in the pipeline, stored in PackageAnalysis, served via queries.

import type { CoChangeEdge, FileImportEdge, ImplicitCouplingEdge } from "./types.js";

const MIN_JACCARD = 0.2; // Pairs below 20% Jaccard are filtered out (noise)
const MIN_CO_CHANGE_COUNT = 3; // Require ≥3 commits where both files changed
const MAX_EDGES = 20; // Cap output to top 20 pairs (avoid noise in large repos)

/**
 * Find co-change pairs that have NO import relationship in either direction.
 * These are high-value signals for plan_change because they represent coupling
 * that static analysis alone cannot detect.
 */
export function detectImplicitCoupling(
  coChangeEdges: CoChangeEdge[],
  importChain: FileImportEdge[],
): ImplicitCouplingEdge[] {
  // Build set of all import pairs (both directions)
  const importPairs = new Set<string>();
  for (const edge of importChain) {
    importPairs.add(`${edge.importer}\0${edge.source}`);
    importPairs.add(`${edge.source}\0${edge.importer}`);
  }

  const results: ImplicitCouplingEdge[] = [];

  for (const edge of coChangeEdges) {
    if (edge.jaccard < MIN_JACCARD || edge.coChangeCount < MIN_CO_CHANGE_COUNT) continue;

    // Check if there's an import relationship in either direction
    const hasImport =
      importPairs.has(`${edge.file1}\0${edge.file2}`) || importPairs.has(`${edge.file2}\0${edge.file1}`);

    if (!hasImport) {
      results.push({
        file1: edge.file1,
        file2: edge.file2,
        jaccard: edge.jaccard,
        coChangeCount: edge.coChangeCount,
      });
    }
  }

  // Sort by jaccard descending, cap at MAX_EDGES
  results.sort((a, b) => b.jaccard - a.jaccard);
  return results.slice(0, MAX_EDGES);
}
