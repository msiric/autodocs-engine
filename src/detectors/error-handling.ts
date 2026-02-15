import type { Convention, ConventionConfidence, ConventionDetector } from "../types.js";
import { sourceParsedFiles } from "../convention-extractor.js";

export const errorHandlingDetector: ConventionDetector = (files, tiers, _warnings) => {
  const conventions: Convention[] = [];
  const sourceFiles = sourceParsedFiles(files, tiers);
  if (sourceFiles.length === 0) return conventions;

  let tryCatchTotal = 0;
  let filesWithTryCatch = 0;
  let errorBoundaryCount = 0;

  for (const f of sourceFiles) {
    if (f.contentSignals.tryCatchCount > 0) {
      tryCatchTotal += f.contentSignals.tryCatchCount;
      filesWithTryCatch++;
    }
    if (f.contentSignals.hasErrorBoundary) errorBoundaryCount++;
  }

  if (tryCatchTotal > 0) {
    conventions.push({
      category: "error-handling",
      name: "Try-catch error handling",
      description: `Uses try-catch blocks for error handling`,
      confidence: conf(filesWithTryCatch, sourceFiles.length),
      examples: [`${tryCatchTotal} try-catch blocks in ${filesWithTryCatch} files`],
    });
  }

  if (errorBoundaryCount > 0) {
    conventions.push({
      category: "error-handling",
      name: "Error boundaries",
      description: `Uses React Error Boundaries for UI error handling`,
      confidence: conf(errorBoundaryCount, sourceFiles.length),
      examples: [`${errorBoundaryCount} files reference ErrorBoundary`],
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
