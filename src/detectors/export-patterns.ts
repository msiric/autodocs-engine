import type { Convention, ConventionConfidence, ConventionDetector } from "../types.js";
import { sourceParsedFiles } from "../convention-extractor.js";

export const exportPatternDetector: ConventionDetector = (files, tiers, _warnings) => {
  const conventions: Convention[] = [];
  const sourceFiles = sourceParsedFiles(files, tiers);
  if (sourceFiles.length === 0) return conventions;

  let named = 0, defaults = 0, reExports = 0, total = 0;

  for (const f of sourceFiles) {
    for (const exp of f.exports) {
      total++;
      if (exp.name === "default") defaults++;
      else named++;
      if (exp.isReExport) reExports++;
    }
  }

  if (total === 0) return conventions;

  // Named vs default
  if (named > 0 && defaults === 0) {
    conventions.push({
      category: "exports",
      name: "Named exports only",
      description: `All exports use named exports (no default exports)`,
      confidence: conf(named, total),
      examples: [`${named} named, ${defaults} default exports`],
    });
  } else if (named > 0 && defaults > 0) {
    const namedPct = Math.round((named / total) * 100);
    if (namedPct >= 90) {
      conventions.push({
        category: "exports",
        name: "Named exports preferred",
        description: `Named exports are strongly preferred over default exports`,
        confidence: conf(named, total),
        examples: [`${named} named (${namedPct}%) vs ${defaults} default`],
      });
    }
  }

  // Re-exports
  if (reExports >= 3) {
    conventions.push({
      category: "exports",
      name: "Barrel re-exports",
      description: `Package uses barrel file re-exports to define public API`,
      confidence: conf(reExports, total),
      examples: [`${reExports} re-export statements`],
    });
  }

  return conventions;
};

function conf(matched: number, total: number): ConventionConfidence {
  const percentage = total > 0 ? Math.round((matched / total) * 100) : 0;
  return {
    matched,
    total,
    percentage,
    description: `${matched} of ${total} exports (${percentage}%)`,
  };
}
