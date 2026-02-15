// src/contribution-patterns.ts — Enhancement 4: Contribution Pattern Detection
// Detects "how to add new code" patterns from existing directory structure.

import type {
  ParsedFile,
  PublicAPIEntry,
  TierInfo,
  DirectoryInfo,
  ContributionPattern,
} from "./types.js";

/**
 * Detect contribution patterns from the analyzed package structure.
 */
export function detectContributionPatterns(
  parsedFiles: ParsedFile[],
  publicAPI: PublicAPIEntry[],
  tiers: Map<string, TierInfo>,
  directories: DirectoryInfo[],
  barrelFile: string | undefined,
): ContributionPattern[] {
  const patterns: ContributionPattern[] = [];

  // Group T1 files by directory
  const t1FilesByDir = new Map<string, ParsedFile[]>();
  for (const pf of parsedFiles) {
    const tier = tiers.get(pf.relativePath);
    if (!tier || tier.tier !== 1) continue;
    if (pf.isTestFile || pf.isGeneratedFile) continue;

    // Find which directory this file belongs to
    const dir = findParentDir(pf.relativePath, directories);
    if (!dir) continue;

    const existing = t1FilesByDir.get(dir.path) ?? [];
    existing.push(pf);
    t1FilesByDir.set(dir.path, existing);
  }

  for (const [dirPath, files] of t1FilesByDir) {
    if (files.length < 3) continue;

    const dirInfo = directories.find((d) => d.path === dirPath);
    if (!dirInfo) continue;

    // Group by dominant export kind
    const kindCounts = new Map<string, number>();
    for (const pf of files) {
      for (const exp of pf.exports) {
        if (exp.isTypeOnly) continue;
        const kind = exp.kind === "unknown" ? "function" : exp.kind;
        kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
      }
    }

    // Find dominant kind
    let dominantKind = "function";
    let maxCount = 0;
    for (const [kind, count] of kindCounts) {
      if (count > maxCount) {
        dominantKind = kind;
        maxCount = count;
      }
    }

    // Use the naming pattern from the directory
    const filePattern = dirInfo.pattern ?? detectSimplePattern(files, dominantKind);
    if (!filePattern) continue;

    // Check for co-located tests
    const testFiles = parsedFiles.filter(
      (pf) =>
        pf.isTestFile &&
        pf.relativePath.startsWith(dirPath + "/"),
    );
    const hasCoLocatedTests = testFiles.length >= Math.floor(files.length / 2);

    // Build test pattern from actual test files
    let testPattern: string | undefined;
    if (hasCoLocatedTests && testFiles.length > 0) {
      const testNames = testFiles.map((f) => {
        const parts = f.relativePath.split("/");
        return parts[parts.length - 1];
      });
      // Derive test pattern: same as file pattern but with .test. inserted
      testPattern = filePattern.replace(/(\.[a-z]+)$/, ".test$1");
    }

    // Find the best example file (most-imported)
    const dirExports = publicAPI.filter(
      (e) => e.sourceFile.startsWith(dirPath + "/"),
    );
    const bestExport = dirExports.reduce(
      (best, exp) => ((exp.importCount ?? 0) > (best?.importCount ?? 0) ? exp : best),
      dirExports[0],
    );
    const exampleFile = bestExport?.sourceFile ?? files[0].relativePath;

    // Build steps
    const steps: string[] = [];
    steps.push(`Create \`${filePattern}\` in \`${dirPath}/\``);
    if (testPattern) {
      steps.push(`Create co-located test file \`${testPattern}\``);
    }
    if (barrelFile) {
      steps.push(`Add re-export to \`${barrelFile}\``);
    }

    patterns.push({
      type: dominantKind,
      directory: dirPath + "/",
      filePattern,
      testPattern,
      exampleFile,
      steps,
    });
  }

  return patterns;
}

function findParentDir(
  filePath: string,
  directories: DirectoryInfo[],
): DirectoryInfo | undefined {
  // Find the most specific (longest path) directory that contains this file
  let best: DirectoryInfo | undefined;
  for (const dir of directories) {
    if (filePath.startsWith(dir.path + "/")) {
      if (!best || dir.path.length > best.path.length) {
        best = dir;
      }
    }
  }
  return best;
}

function detectSimplePattern(files: ParsedFile[], kind: string): string | undefined {
  const names = files.map((f) => {
    const parts = f.relativePath.split("/");
    return parts[parts.length - 1];
  }).filter((n) => !n.startsWith("index."));

  if (names.length < 3) return undefined;

  // Find most common extension
  const extCounts = new Map<string, number>();
  for (const name of names) {
    const match = name.match(/\.(tsx?|jsx?)$/);
    if (match) {
      extCounts.set("." + match[1], (extCounts.get("." + match[1]) ?? 0) + 1);
    }
  }
  let ext = ".ts";
  let maxExtCount = 0;
  for (const [e, c] of extCounts) {
    if (c > maxExtCount) {
      ext = e;
      maxExtCount = c;
    }
  }

  // Produce a pattern based on kind
  switch (kind) {
    case "hook":
      return `use-{feature}${ext}`;
    case "component":
      return `{ComponentName}${ext}`;
    default:
      return `{name}${ext}`;
  }
}
