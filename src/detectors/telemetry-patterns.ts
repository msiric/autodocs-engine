import type { Convention, ConventionConfidence, ConventionDetector } from "../types.js";
import { sourceParsedFiles } from "../convention-extractor.js";

export const telemetryPatternDetector: ConventionDetector = (files, tiers, _warnings) => {
  const conventions: Convention[] = [];
  const sourceFiles = sourceParsedFiles(files, tiers);
  if (sourceFiles.length === 0) return conventions;

  let telemetryFiles = 0;
  const telemetryImports: string[] = [];

  for (const f of sourceFiles) {
    const hasTelemetry = f.imports.some(
      (i) =>
        i.moduleSpecifier.includes("scenario") ||
        i.moduleSpecifier.includes("telemetry") ||
        i.moduleSpecifier.includes("logging"),
    );
    if (hasTelemetry) {
      telemetryFiles++;
      const matches = f.imports
        .filter(
          (i) =>
            i.moduleSpecifier.includes("scenario") ||
            i.moduleSpecifier.includes("telemetry"),
        )
        .map((i) => i.moduleSpecifier);
      telemetryImports.push(...matches);
    }
  }

  if (telemetryFiles > 0) {
    conventions.push({
      category: "telemetry",
      name: "Telemetry instrumentation",
      description: `Package uses telemetry/scenario instrumentation`,
      confidence: conf(telemetryFiles, sourceFiles.length),
      examples: [...new Set(telemetryImports)].slice(0, 3),
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
