// src/detectors/error-handling.ts — Error handling pattern detector
// Detects: custom error classes, Result/Either patterns, error class hierarchies.
// Does NOT use try/catch density — per adversarial review, that's a false signal
// (mature codebases use middleware/Result types, not widespread try/catch).

import { buildConfidence, sourceParsedFiles } from "../convention-extractor.js";
import type { Convention, ConventionDetector } from "../types.js";

// Libraries that provide typed error/result patterns
const RESULT_LIBRARIES: Record<string, string> = {
  neverthrow: "neverthrow (Result<T, E>)",
  "fp-ts": "fp-ts (Either<E, A>)",
  "oxide.ts": "oxide.ts (Result<T, E>)",
  effect: "Effect (typed errors via Effect<A, E, R>)",
  "ts-results": "ts-results (Result<T, E>)",
  "true-myth": "true-myth (Result<T, E>)",
};

// Names that suggest a custom Result/Either type
const RESULT_EXPORT_NAMES = new Set(["Result", "Ok", "Err", "Either", "Left", "Right", "Success", "Failure"]);

export const errorHandlingDetector: ConventionDetector = (files, tiers, _warnings, _context) => {
  const conventions: Convention[] = [];
  const sourceFiles = sourceParsedFiles(files, tiers);
  if (sourceFiles.length === 0) return conventions;

  // 1. Custom error classes — exports with kind:"class" and name ending in Error/Exception
  const errorClasses: string[] = [];
  for (const file of sourceFiles) {
    for (const exp of file.exports) {
      if (exp.kind === "class" && (/Error$/.test(exp.name) || /Exception$/.test(exp.name))) {
        errorClasses.push(exp.name);
      }
    }
  }

  if (errorClasses.length >= 2) {
    // Check for hierarchy pattern: multiple error classes suggest a typed error hierarchy
    const isHierarchy = errorClasses.length >= 3;
    const name = isHierarchy ? "Typed error class hierarchy" : "Custom error classes";
    const description = isHierarchy
      ? `Uses a hierarchy of ${errorClasses.length} typed error classes (${errorClasses.slice(0, 3).join(", ")}${errorClasses.length > 3 ? `, ...${errorClasses.length - 3} more` : ""})`
      : `Defines custom error classes: ${errorClasses.join(", ")}`;

    conventions.push({
      category: "error-handling",
      source: "errorHandling",
      name,
      description,
      confidence: buildConfidence(errorClasses.length, errorClasses.length),
      examples: errorClasses.slice(0, 5),
    });
  }

  // 2. Result/Either pattern — check imports for known result-type libraries (count files, not imports)
  const resultLibraryImports = new Map<string, number>();
  for (const file of sourceFiles) {
    const fileLibs = new Set<string>(); // dedupe per file
    for (const imp of file.imports) {
      if (imp.isTypeOnly) continue;
      for (const [pkg, label] of Object.entries(RESULT_LIBRARIES)) {
        if (imp.moduleSpecifier === pkg || imp.moduleSpecifier.startsWith(`${pkg}/`)) {
          fileLibs.add(label);
        }
      }
    }
    for (const label of fileLibs) {
      resultLibraryImports.set(label, (resultLibraryImports.get(label) ?? 0) + 1);
    }
  }

  if (resultLibraryImports.size > 0) {
    const totalFiles = [...resultLibraryImports.values()].reduce((a, b) => a + b, 0);
    const libs = [...resultLibraryImports.entries()].sort((a, b) => b[1] - a[1]);
    conventions.push({
      category: "error-handling",
      source: "errorHandling",
      name: "Result/Either pattern",
      description: `Uses ${libs[0][0]} for typed error handling (${totalFiles} files)`,
      confidence: buildConfidence(totalFiles, sourceFiles.length),
      examples: libs.map(([lib, count]) => `${lib}: ${count} files`),
    });
  }

  // 3. Custom Result types — exports named Result/Ok/Err/Either without a library
  if (resultLibraryImports.size === 0) {
    const resultExports: string[] = [];
    for (const file of sourceFiles) {
      for (const exp of file.exports) {
        if (RESULT_EXPORT_NAMES.has(exp.name) && (exp.kind === "type" || exp.kind === "interface")) {
          resultExports.push(exp.name);
        }
      }
    }

    if (resultExports.length >= 2) {
      conventions.push({
        category: "error-handling",
        source: "errorHandling",
        name: "Custom Result type pattern",
        description: `Defines custom Result types: ${[...new Set(resultExports)].join(", ")}`,
        confidence: buildConfidence(resultExports.length, resultExports.length),
        examples: [...new Set(resultExports)].slice(0, 5),
      });
    }
  }

  return conventions;
};
