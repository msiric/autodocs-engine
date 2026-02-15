// src/convention-extractor.ts — Module 5: Convention Extractor (orchestrator)
// Errata applied: E-26 (report dominant pattern below threshold),
//                 E-27 (structured confidence), E-28 (filter by tier)

import type {
  ParsedFile,
  TierInfo,
  Convention,
  ConventionDetector,
  Warning,
} from "./types.js";

import { fileNamingDetector } from "./detectors/file-naming.js";
import { importPatternDetector } from "./detectors/import-patterns.js";
import { exportPatternDetector } from "./detectors/export-patterns.js";
import { componentPatternDetector } from "./detectors/component-patterns.js";
import { hookPatternDetector } from "./detectors/hook-patterns.js";
import { testPatternDetector } from "./detectors/test-patterns.js";
import { errorHandlingDetector } from "./detectors/error-handling.js";
import { graphqlPatternDetector } from "./detectors/graphql-patterns.js";
import { telemetryPatternDetector } from "./detectors/telemetry-patterns.js";

const DETECTOR_REGISTRY: Record<string, ConventionDetector> = {
  fileNaming: fileNamingDetector,
  importPatterns: importPatternDetector,
  exportPatterns: exportPatternDetector,
  componentPatterns: componentPatternDetector,
  hookPatterns: hookPatternDetector,
  testPatterns: testPatternDetector,
  errorHandling: errorHandlingDetector,
  graphqlPatterns: graphqlPatternDetector,
  telemetryPatterns: telemetryPatternDetector,
};

/**
 * Run all convention detectors and collect results.
 */
export function extractConventions(
  parsedFiles: ParsedFile[],
  tiers: Map<string, TierInfo>,
  disabledDetectors: string[],
  warnings: Warning[] = [],
): Convention[] {
  const conventions: Convention[] = [];
  const disabled = new Set(disabledDetectors);

  for (const [name, detector] of Object.entries(DETECTOR_REGISTRY)) {
    if (disabled.has(name)) continue;

    try {
      const results = detector(parsedFiles, tiers, warnings);
      conventions.push(...results);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push({
        level: "warn",
        module: "convention-extractor",
        message: `Detector "${name}" threw: ${msg}`,
      });
    }
  }

  return conventions;
}

/**
 * E-28: Helper to filter to Tier 1 and Tier 2 source files only.
 */
export function sourceParsedFiles(
  files: ParsedFile[],
  tiers: Map<string, TierInfo>,
): ParsedFile[] {
  return files.filter((f) => {
    const t = tiers.get(f.relativePath);
    return t && t.tier !== 3;
  });
}
