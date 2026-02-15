import type { Convention, ConventionConfidence, ConventionDetector } from "../types.js";
import { sourceParsedFiles } from "../convention-extractor.js";

export const componentPatternDetector: ConventionDetector = (files, tiers, _warnings) => {
  const conventions: Convention[] = [];
  const sourceFiles = sourceParsedFiles(files, tiers);

  let componentCount = 0;
  let displayNameCount = 0;
  let memoCount = 0;
  const componentFiles: string[] = [];

  for (const f of sourceFiles) {
    const hasComponent = f.exports.some((e) => e.kind === "component");
    if (hasComponent) {
      componentCount++;
      componentFiles.push(f.relativePath);
      if (f.contentSignals.hasDisplayName) displayNameCount++;
      if (f.contentSignals.useMemoCount > 0) memoCount++;
    }
  }

  if (componentCount === 0) return conventions;

  conventions.push({
    category: "components",
    name: "React components",
    description: `Package exports React components`,
    confidence: conf(componentCount, sourceFiles.length),
    examples: componentFiles.slice(0, 3),
  });

  if (displayNameCount > 0) {
    conventions.push({
      category: "components",
      name: "displayName convention",
      description: `Components set displayName for debugging`,
      confidence: conf(displayNameCount, componentCount),
      examples: [`${displayNameCount} of ${componentCount} component files`],
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
    description: `${matched} of ${total} (${percentage}%)`,
  };
}
