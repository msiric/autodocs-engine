// src/convention-extractor.ts — Module 5: Convention Extractor (orchestrator)
// Errata applied: E-26 (report dominant pattern below threshold),
//                 E-27 (structured confidence), E-28 (filter by tier)
// W2-3: Added ecosystem-specific detectors with DetectorContext support.

import type {
  ParsedFile,
  TierInfo,
  Convention,
  ConventionDetector,
  DetectorContext,
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
// W2-3: Ecosystem-specific detectors
import { testFrameworkEcosystemDetector } from "./detectors/test-framework-ecosystem.js";
import { dataFetchingDetector } from "./detectors/data-fetching.js";
import { databaseDetector } from "./detectors/database.js";
import { webFrameworkDetector } from "./detectors/web-framework.js";
import { buildToolDetector } from "./detectors/build-tool.js";

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
  // W2-3: Ecosystem-specific detectors
  testFrameworkEcosystem: testFrameworkEcosystemDetector,
  dataFetching: dataFetchingDetector,
  database: databaseDetector,
  webFramework: webFrameworkDetector,
  buildTool: buildToolDetector,
};

/**
 * Run all convention detectors and collect results.
 * W2-3: Accepts optional DetectorContext for ecosystem-aware detectors.
 */
export function extractConventions(
  parsedFiles: ParsedFile[],
  tiers: Map<string, TierInfo>,
  disabledDetectors: string[],
  warnings: Warning[] = [],
  context?: DetectorContext,
): Convention[] {
  const conventions: Convention[] = [];
  const disabled = new Set(disabledDetectors);

  for (const [name, detector] of Object.entries(DETECTOR_REGISTRY)) {
    if (disabled.has(name)) continue;

    try {
      const results = detector(parsedFiles, tiers, warnings, context);
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

  // W2-3: If the data-fetching detector found a non-GraphQL source for useQuery,
  // suppress the old graphql-patterns detector's "GraphQL hooks" convention.
  const hasDataFetchingConvention = conventions.some(
    (c) => c.name.includes("TanStack Query") || c.name.includes("tRPC") ||
           c.name.includes("SWR") || c.name.includes("oRPC") ||
           c.name.includes("Custom data fetching"),
  );
  if (hasDataFetchingConvention) {
    // Remove the misleading "GraphQL hooks" convention from the old detector
    const filtered = conventions.filter(
      (c) => !(c.name === "GraphQL hooks" && c.category === "graphql"),
    );
    return filtered;
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
