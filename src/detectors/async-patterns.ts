// src/detectors/async-patterns.ts — Async pattern detector
// Detects: Promise.all/allSettled usage, sequential await anti-patterns, AbortController.
// Uses ContentSignals: promiseAllCount, asyncFunctionCount, awaitInLoopCount.

import { buildConfidence, sourceParsedFiles } from "../convention-extractor.js";
import type { Convention, ConventionDetector } from "../types.js";

export const asyncPatternsDetector: ConventionDetector = (files, tiers, _warnings, _context) => {
  const conventions: Convention[] = [];
  const sourceFiles = sourceParsedFiles(files, tiers);
  if (sourceFiles.length === 0) return conventions;

  // AbortController usage — cancellation pattern (not gated on async functions)
  let abortControllerFiles = 0;
  for (const file of sourceFiles) {
    let found = false;
    for (const imp of file.imports) {
      if (imp.isTypeOnly) continue;
      if (imp.importedNames.includes("AbortController") || imp.importedNames.includes("AbortSignal")) {
        found = true;
        break;
      }
    }
    if (!found) {
      for (const exp of file.exports) {
        if (exp.signature?.includes("AbortSignal") || exp.signature?.includes("signal")) {
          found = true;
          break;
        }
      }
    }
    if (found) abortControllerFiles++;
  }
  if (abortControllerFiles >= 2) {
    conventions.push({
      category: "async-patterns",
      source: "asyncPatterns",
      name: "AbortController cancellation pattern",
      description: `Uses AbortController/AbortSignal for cancellation (${abortControllerFiles} files)`,
      confidence: buildConfidence(abortControllerFiles, sourceFiles.length),
      examples: [],
    });
  }

  // Async-specific patterns require async functions
  const asyncFiles = sourceFiles.filter((f) => f.contentSignals.asyncFunctionCount > 0);
  if (asyncFiles.length === 0) return conventions;

  // Concurrent patterns — Promise.all/allSettled/race
  const promiseAllFiles = asyncFiles.filter((f) => f.contentSignals.promiseAllCount > 0);
  if (promiseAllFiles.length > 0) {
    const ratio = promiseAllFiles.length / asyncFiles.length;
    if (ratio >= 0.15) {
      conventions.push({
        category: "async-patterns",
        source: "asyncPatterns",
        name: "Promise.all concurrent pattern",
        description: `Uses Promise.all/allSettled for concurrent async operations (${promiseAllFiles.length} of ${asyncFiles.length} async files)`,
        confidence: buildConfidence(promiseAllFiles.length, asyncFiles.length),
        examples: promiseAllFiles.slice(0, 3).map((f) => f.relativePath),
      });
    }
  }

  // Sequential await in loops — anti-pattern signal (higher threshold: must be widespread, not incidental)
  const awaitInLoopFiles = sourceFiles.filter((f) => f.contentSignals.awaitInLoopCount > 0);
  if (awaitInLoopFiles.length >= 3) {
    const ratio = awaitInLoopFiles.length / asyncFiles.length;
    if (ratio >= 0.25) {
      conventions.push({
        category: "async-patterns",
        source: "asyncPatterns",
        name: "Sequential await in loops",
        description: `${awaitInLoopFiles.length} file${awaitInLoopFiles.length === 1 ? "" : "s"} contain${awaitInLoopFiles.length === 1 ? "s" : ""} await inside loops — consider Promise.all for independent operations`,
        confidence: buildConfidence(awaitInLoopFiles.length, asyncFiles.length),
        examples: awaitInLoopFiles.slice(0, 3).map((f) => f.relativePath),
      });
    }
  }

  return conventions;
};
