// src/tier-classifier.ts — Module 4: Tier Classifier
// No errata corrections needed for this module.

import type { ParsedFile, SymbolGraph, TierInfo } from "./types.js";

/**
 * Classify each file as Tier 1 (public API), Tier 2 (internal), or Tier 3 (generated/test).
 * Algorithm: first match wins, applied in order.
 * Fix A: barrelSourceFiles now also includes files reachable from bin entry points.
 */
export function classifyTiers(
  parsedFiles: ParsedFile[],
  symbolGraph: SymbolGraph,
  barrelRelPath: string | undefined,
): Map<string, TierInfo> {
  const tiers = new Map<string, TierInfo>();

  for (const pf of parsedFiles) {
    if (pf.isTestFile) {
      tiers.set(pf.relativePath, { tier: 3, reason: "Test file" });
    } else if (pf.isGeneratedFile) {
      tiers.set(pf.relativePath, { tier: 3, reason: "Generated file" });
    } else if (barrelRelPath && pf.relativePath === barrelRelPath) {
      tiers.set(pf.relativePath, { tier: 1, reason: "Package entry point" });
    } else if (symbolGraph.barrelSourceFiles.has(pf.relativePath)) {
      tiers.set(pf.relativePath, {
        tier: 1,
        reason: "Exported from barrel",
      });
    } else {
      tiers.set(pf.relativePath, { tier: 2, reason: "Internal" });
    }
  }

  return tiers;
}
