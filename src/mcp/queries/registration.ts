// src/mcp/queries/registration.ts — Barrel detection, test resolution, registration

import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import type { ContributionPattern, StructuredAnalysis } from "../../types.js";
import { resolvePackage } from "./core.js";

// ─── Plan Change / Test Info Queries ────────────────────────────────────────

export function getBarrelFile(analysis: StructuredAnalysis, directory: string, packagePath?: string): string | null {
  const pkg = resolvePackage(analysis, packagePath);
  const dir = directory.replace(/\/$/, "");
  const rootDir = analysis.meta?.rootDir;
  // Check if index.ts or index.tsx exists AND actually contains re-exports
  // (index.ts files that are entry points, not barrels, should be skipped)
  const allFiles = new Set(pkg.files.byTier.tier1.files.concat(pkg.files.byTier.tier2.files));
  for (const barrelPath of [`${dir}/index.ts`, `${dir}/index.tsx`]) {
    if (!allFiles.has(barrelPath)) continue;
    if (rootDir) {
      const content = safeReadFile(rootDir, barrelPath);
      if (content && /export\s+(?:\*|\{[^}]+\})\s+from\s+["']/.test(content)) {
        return barrelPath;
      }
    } else {
      return barrelPath; // No rootDir to verify — trust the file list
    }
  }
  return null;
}

export interface TestFileInfo {
  testFile: string | null;
  exists: boolean;
  framework: string;
  command: string;
  pattern: string;
}

export function resolveTestFile(
  analysis: StructuredAnalysis,
  sourceFilePath: string,
  packagePath?: string,
): TestFileInfo {
  const pkg = resolvePackage(analysis, packagePath);
  const dir = sourceFilePath.replace(/\/[^/]+$/, "");
  const fileBase = sourceFilePath.replace(/.*\//, "").replace(/\.[^.]+$/, "");
  const ext = sourceFilePath.slice(sourceFilePath.lastIndexOf("."));
  const rootDir = analysis.meta?.rootDir;

  // Find contribution pattern for export suffix (most-specific match)
  const patterns = pkg.contributionPatterns ?? [];
  const pattern = findBestPattern(patterns, sourceFilePath);

  // Build comprehensive candidate list covering all common test patterns:
  // 1. Co-located in same directory
  // 2. Separate test/ directory mirroring src/ structure
  // 3. Separate test/ directory flattened (no subdirs)
  // 4. Separate test/ with export-suffix naming
  // 5. __tests__/ subdirectory
  const strippedPath = sourceFilePath.replace(/^src\//, "");
  const strippedBase = strippedPath.replace(/\.[^.]+$/, "");

  const candidates: string[] = [
    // Co-located: src/foo.ts → src/foo.test.ts
    `${dir}/${fileBase}.test${ext}`,
    `${dir}/${fileBase}.spec${ext}`,

    // Separate test/ mirroring src/ subdirectories: src/mcp/tools.ts → test/mcp/tools.test.ts
    `test/${strippedBase}.test${ext}`,
    `test/${strippedBase}.spec${ext}`,

    // Separate test/ flattened: src/detectors/foo.ts → test/foo.test.ts
    `test/${fileBase}.test${ext}`,
    `test/${fileBase}.spec${ext}`,

    // __tests__ subdirectory: src/foo.ts → src/__tests__/foo.test.ts
    `${dir}/__tests__/${fileBase}.test${ext}`,
    `${dir}/__tests__/${fileBase}.spec${ext}`,

    // tests/ (plural) variants of all above
    `tests/${strippedBase}.test${ext}`,
    `tests/${fileBase}.test${ext}`,
  ];

  // If pattern has export suffix, also try test named with suffix
  // e.g., src/detectors/foo.ts with suffix "Detector" → test/foo-detector.test.ts
  if (pattern?.exportSuffix) {
    const suffix = pattern.exportSuffix.replace(/^[A-Z]/, (c) => c.toLowerCase());
    candidates.push(`test/${fileBase}-${suffix}.test${ext}`, `test/${fileBase}-${suffix}.spec${ext}`);
  }

  // Check which exists on disk (test files are in tier3, no file list)
  let testFile: string | null = null;
  let exists = false;
  for (const candidate of candidates) {
    if (rootDir && existsSync(resolve(rootDir, candidate))) {
      testFile = candidate;
      exists = true;
      break;
    }
  }
  // Suggest the most likely candidate: mirrored test/ dir if src/ file, else co-located
  if (!testFile) {
    testFile = sourceFilePath.startsWith("src/") ? `test/${strippedBase}.test${ext}` : `${dir}/${fileBase}.test${ext}`;
  }

  // Detect framework from test command + dependencies
  const testCmd = pkg.commands.test?.run ?? "";
  const testSource = pkg.commands.test?.source ?? "";
  const testFrameworkDep = pkg.dependencyInsights?.testFramework?.name ?? "";
  const frameworkSignal = `${testCmd} ${testSource} ${testFrameworkDep}`.toLowerCase();
  let framework = "unknown";
  if (/vitest/i.test(frameworkSignal)) framework = "vitest";
  else if (/jest/i.test(frameworkSignal)) framework = "jest";
  else if (/mocha/i.test(frameworkSignal)) framework = "mocha";
  else if (/ava/i.test(frameworkSignal)) framework = "ava";

  // Construct per-file command
  let command: string;
  if (framework === "vitest") {
    command = `npx vitest run ${testFile}`;
  } else if (framework === "jest") {
    command = `npx jest ${testFile}`;
  } else if (testCmd) {
    command = `${testCmd} -- ${testFile}`;
  } else {
    command = `${pkg.commands.packageManager} test -- ${testFile}`;
  }

  const patternDesc = exists
    ? `Test file found at ${testFile}`
    : pattern?.testPattern
      ? `Pattern: ${pattern.testPattern} (test file does not exist yet)`
      : "No test file found";

  return { testFile, exists, framework, command, pattern: patternDesc };
}

// ─── Auto-Register Queries ──────────────────────────────────────────────────

export interface RegistrationInsertions {
  registrationFile: {
    path: string;
    lastImportLine: number;
    importStatement: string;
    registryHintLine?: number;
  } | null;
  barrelFile: {
    path: string;
    lastExportLine: number;
    exportStatement: string;
  } | null;
  exportName: string;
}

export function getRegistrationInsertions(
  analysis: StructuredAnalysis,
  newFilePath: string,
  packagePath?: string,
): RegistrationInsertions {
  const pkg = resolvePackage(analysis, packagePath);
  const dir = newFilePath.replace(/\/[^/]+$/, "");
  const rootDir = analysis.meta?.rootDir ?? ".";

  // Find contribution pattern for this directory (most-specific match)
  const patterns = pkg.contributionPatterns ?? [];
  const pattern = findBestPattern(patterns, newFilePath);

  // For registration: if the most-specific pattern has no registrationFile,
  // walk up to the nearest parent that does (child may inherit parent's registration)
  const regPattern = pattern?.registrationFile
    ? pattern
    : patterns
        .filter(
          (p) =>
            newFilePath.startsWith(p.directory) &&
            p.registrationFile &&
            (!pattern || p.directory.length < pattern.directory.length),
        )
        .sort((a, b) => b.directory.length - a.directory.length)[0];

  // Infer export name from most-specific pattern's suffix
  const fileBase = newFilePath.replace(/.*\//, "").replace(/\.[^.]+$/, "");
  const exportName = pattern?.exportSuffix ? kebabToCamel(fileBase) + pattern.exportSuffix : kebabToCamel(fileBase);

  // Registration file insertions (may come from parent pattern)
  let regResult: RegistrationInsertions["registrationFile"] = null;
  if (regPattern?.registrationFile) {
    const content = safeReadFile(rootDir, regPattern.registrationFile);
    if (content) {
      try {
        const boundary = findImportBoundary(content);
        // If file has no imports, insert at line 1 (top of file)
        const insertLine = boundary.lastImportLine || 1;

        // Compute relative path from registration file to new file
        const regDir = regPattern.registrationFile.replace(/\/[^/]+$/, "");
        let relPath = newFilePath;
        if (newFilePath.startsWith(`${regDir}/`)) {
          relPath = `./${newFilePath.slice(regDir.length + 1)}`;
        } else {
          relPath = `./${newFilePath}`;
        }
        relPath = relPath.replace(/\.tsx?$/, ".js"); // .ts → .js for imports

        regResult = {
          path: regPattern.registrationFile,
          lastImportLine: insertLine,
          importStatement: `import { ${exportName} } from "${relPath}";`,
          registryHintLine: boundary.firstNonImportLine || insertLine + 1,
        };
      } catch {
        /* findImportBoundary failed */
      }
    }
  }

  // Barrel file insertions
  let barrelResult: RegistrationInsertions["barrelFile"] = null;
  const barrelPath = getBarrelFile(analysis, dir, packagePath);
  if (barrelPath) {
    const barrelContent = safeReadFile(rootDir, barrelPath);
    if (barrelContent) {
      const lastExportLine = findLastExportFromLine(barrelContent);
      // Use .ts extension if barrel uses .ts imports (e.g., nitro), else .js
      const useTsExtension = barrelContent.includes('.ts"') || barrelContent.includes(".ts'");
      const moduleRef = `./${fileBase}${useTsExtension ? ".ts" : ".js"}`;

      barrelResult = {
        path: barrelPath,
        lastExportLine: lastExportLine || barrelContent.split("\n").length,
        exportStatement: `export * from "${moduleRef}";`,
      };
    }
  }

  return { registrationFile: regResult, barrelFile: barrelResult, exportName };
}

// ─── Pattern Matching Helper ────────────────────────────────────────────────

/**
 * Find the most-specific contribution pattern matching a file path.
 * Patterns are matched by directory prefix and sorted by specificity (longest first).
 * This avoids the array-order dependency of `.find()` when nested directories
 * both have patterns (e.g., src/adapters/ and src/adapters/llm/).
 */
export function findBestPattern(patterns: ContributionPattern[], filePath: string): ContributionPattern | undefined {
  return patterns
    .filter((p) => filePath.startsWith(p.directory))
    .sort((a, b) => b.directory.length - a.directory.length)[0];
}

// ─── Auto-Register Helpers ──────────────────────────────────────────────────

function kebabToCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function findImportBoundary(content: string): { lastImportLine: number; firstNonImportLine: number } {
  const sf = ts.createSourceFile("file.ts", content, ts.ScriptTarget.Latest, true);
  let lastImportLine = 0;
  let firstNonImportLine = 0;

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const pos = sf.getLineAndCharacterOfPosition(stmt.getEnd());
      lastImportLine = pos.line + 1; // 1-based
    } else if (lastImportLine > 0 && firstNonImportLine === 0) {
      const pos = sf.getLineAndCharacterOfPosition(stmt.getStart());
      firstNonImportLine = pos.line + 1;
    }
  }

  return { lastImportLine, firstNonImportLine };
}

function findLastExportFromLine(content: string): number {
  const lines = content.split("\n");
  let lastLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/export\s+(?:\*|\{[^}]+\})\s+from\s+["']/.test(lines[i])) {
      lastLine = i + 1; // 1-based
    }
  }
  return lastLine;
}

/** Read a file only if it's within rootDir (prevents path traversal). */
export function safeReadFile(rootDir: string, filePath: string): string | null {
  const absPath = resolve(rootDir, filePath);
  if (relative(rootDir, absPath).startsWith("..")) return null;
  try {
    return readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
}
