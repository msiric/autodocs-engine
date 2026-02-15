import type { Convention, ConventionConfidence, ConventionDetector } from "../types.js";
import { sourceParsedFiles } from "../convention-extractor.js";

export const importPatternDetector: ConventionDetector = (files, tiers, _warnings) => {
  const conventions: Convention[] = [];
  const sourceFiles = sourceParsedFiles(files, tiers);
  if (sourceFiles.length === 0) return conventions;

  let barrel = 0, deep = 0, relative = 0, absolute = 0, typeOnly = 0, total = 0;

  for (const f of sourceFiles) {
    for (const imp of f.imports) {
      if (imp.isDynamic) continue;
      total++;

      if (imp.moduleSpecifier.startsWith(".")) {
        relative++;
      } else {
        absolute++;
        // Check barrel vs deep: scoped @org/pkg/sub is deep, @org/pkg is barrel
        if (imp.moduleSpecifier.startsWith("@")) {
          const parts = imp.moduleSpecifier.split("/");
          if (parts.length > 2) deep++;
          else barrel++;
        } else {
          const parts = imp.moduleSpecifier.split("/");
          if (parts.length > 1) deep++;
          else barrel++;
        }
      }

      if (imp.isTypeOnly) typeOnly++;
    }
  }

  if (total === 0) return conventions;

  // Barrel vs deep imports for external packages
  const extTotal = barrel + deep;
  if (extTotal > 0 && barrel > 0) {
    const pct = Math.round((barrel / extTotal) * 100);
    if (pct >= 70) {
      conventions.push({
        category: "imports",
        name: "Barrel imports for external packages",
        description: `External packages are imported from their barrel (entry point), not deep paths`,
        confidence: conf(barrel, extTotal),
        examples: [`${barrel} barrel vs ${deep} deep imports`],
      });
    }
  }

  // Relative imports
  if (relative > 0) {
    conventions.push({
      category: "imports",
      name: "Relative imports within package",
      description: `Internal imports use relative paths`,
      confidence: conf(relative, total),
      examples: [`${relative} relative of ${total} total imports`],
    });
  }

  // Type-only imports
  if (typeOnly > 0) {
    const pct = Math.round((typeOnly / total) * 100);
    if (pct >= 10) {
      conventions.push({
        category: "imports",
        name: "Type-only imports",
        description: `Type-only import syntax used for type imports`,
        confidence: conf(typeOnly, total),
        examples: [`${typeOnly} type-only of ${total} imports (${pct}%)`],
      });
    }
  }

  return conventions;
};

function conf(matched: number, total: number): ConventionConfidence {
  const percentage = total > 0 ? Math.round((matched / total) * 100) : 0;
  return {
    matched,
    total,
    percentage,
    description: `${matched} of ${total} imports (${percentage}%)`,
  };
}
