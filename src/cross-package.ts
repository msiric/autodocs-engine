// src/cross-package.ts — Module 8: Cross-Package Analyzer

import type {
  PackageAnalysis,
  CrossPackageAnalysis,
  CommandSet,
  Convention,
  PackageDependency,
} from "./types.js";
import { deriveSharedAntiPatterns } from "./anti-pattern-detector.js";
import { classifyImpacts } from "./impact-classifier.js";

/**
 * Combine multiple per-package analyses into a cross-package view.
 */
export function analyzeCrossPackage(
  packages: PackageAnalysis[],
  rootCommands?: CommandSet,
): CrossPackageAnalysis {
  const dependencyGraph = buildDependencyGraph(packages);
  const { shared, divergent } = analyzeConventions(packages);
  const rawSharedAntiPatterns = deriveSharedAntiPatterns(shared);

  // Classify impact on shared conventions and anti-patterns
  const classified = classifyImpacts(shared, rawSharedAntiPatterns);

  return {
    dependencyGraph,
    sharedConventions: classified.conventions,
    divergentConventions: divergent,
    rootCommands,
    sharedAntiPatterns: classified.antiPatterns,
  };
}

function buildDependencyGraph(
  packages: PackageAnalysis[],
): PackageDependency[] {
  const packageNames = new Set(packages.map((p) => p.name));
  const edges: PackageDependency[] = [];

  for (const pkg of packages) {
    for (const dep of pkg.dependencies.internal) {
      if (packageNames.has(dep)) {
        edges.push({
          from: pkg.name,
          to: dep,
          isDevOnly: false, // We don't distinguish in V1
        });
      }
    }
  }

  return edges;
}

function analyzeConventions(packages: PackageAnalysis[]): {
  shared: Convention[];
  divergent: CrossPackageAnalysis["divergentConventions"];
} {
  if (packages.length <= 1) {
    return { shared: [], divergent: [] };
  }

  // Group conventions by name across all packages
  const conventionByName = new Map<
    string,
    { convention: Convention; packages: string[] }[]
  >();

  for (const pkg of packages) {
    for (const conv of pkg.conventions) {
      const entries = conventionByName.get(conv.name) ?? [];
      entries.push({ convention: conv, packages: [pkg.name] });
      conventionByName.set(conv.name, entries);
    }
  }

  const shared: Convention[] = [];
  const divergent: CrossPackageAnalysis["divergentConventions"] = [];

  for (const [name, entries] of conventionByName) {
    const pkgNames = entries.map((e) => e.packages[0]);
    if (pkgNames.length === packages.length) {
      // Present in all packages → shared
      shared.push(entries[0].convention);
    } else if (pkgNames.length > 1) {
      // Present in some but not all → divergent
      divergent.push({
        convention: name,
        packages: entries.map((e) => ({
          name: e.packages[0],
          value: e.convention.confidence.description,
        })),
      });
    }
  }

  return { shared, divergent };
}
