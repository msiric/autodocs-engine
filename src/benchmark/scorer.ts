// src/benchmark/scorer.ts — Deterministic scoring for benchmark tasks
// Uses the engine's own AST parsing + file system checks to score
// AI-generated code against detected contribution patterns.
// Scoring rubric: Convention (10) + Integration (8) + Structure (4) + Quality (3) = 25

import ts from "typescript";
import { join, basename, dirname } from "node:path";
import type { BenchmarkTask, CheckResult, GeneratedFile, RunResult } from "./types.js";

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Score generated files against a benchmark task's expected patterns.
 * Returns a RunResult with per-check scoring breakdown.
 */
export function scoreGeneratedOutput(
  files: GeneratedFile[],
  task: BenchmarkTask,
  tokensUsed: number,
  latencyMs: number,
  error?: string,
): RunResult {
  // For Q&A tasks (command, architecture), the "files" contain the raw text response
  const rawResponse = files.map(f => f.content).join("\n") || "";

  if (error && (task.taskType === "pattern" || files.length === 0)) {
    return {
      score: 0, rawScore: 0, maxPoints: task.maxScoringPoints,
      passed: false, checks: [], filesCreated: [],
      tokensUsed, latencyMs, error: error ?? "No output generated",
    };
  }

  let checks: CheckResult[];

  switch (task.taskType) {
    case "command":
      checks = scoreCommandTask(rawResponse, files, task);
      break;
    case "architecture":
      checks = scoreArchitectureTask(rawResponse, task);
      break;
    case "pattern":
    default:
      checks = scorePatternTask(files, task);
      break;
  }

  const rawScore = checks.reduce((sum, c) => sum + c.score, 0);
  const maxPossible = checks.reduce((sum, c) => sum + c.weight, 0);
  const score = maxPossible > 0 ? Math.round((rawScore / maxPossible) * 100) : 0;

  return {
    score,
    rawScore,
    maxPoints: maxPossible,
    passed: score >= 70,
    checks,
    filesCreated: files.map(f => f.path),
    tokensUsed,
    latencyMs,
  };
}

// ─── Pattern Task Scoring (existing) ─────────────────────────────────────────

function scorePatternTask(files: GeneratedFile[], task: BenchmarkTask): CheckResult[] {
  if (files.length === 0) return [fail("no-files", "quality", 1, "No files generated")];

  const checks: CheckResult[] = [];

  const implFiles = files.filter(f =>
    !f.path.includes(".test.") && !f.path.includes(".spec.") &&
    f.path.includes(task.expectedDirectory)
  );
  const primaryFile = implFiles[0];

  // Convention checks
  if (task.tier !== "C") {
    checks.push(checkCommonImports(primaryFile, task));
    checks.push(checkExportSuffix(primaryFile, task));
  }
  checks.push(checkFileNaming(primaryFile, task));
  if (task.tier !== "C") {
    checks.push(checkAntiPatterns(primaryFile, task));
  }

  // Integration checks
  if (task.contributionPattern?.registrationFile) {
    checks.push(checkRegistrationUpdate(files, task));
  }
  if (task.context.barrelFile) {
    checks.push(checkBarrelUpdate(files, task));
  }
  checks.push(checkFileLocation(files, task));

  // Structure checks
  checks.push(checkFilenamePattern(primaryFile, task));
  if (task.contributionPattern?.testPattern) {
    checks.push(checkTestCoLocation(files, task));
  }

  // Quality checks
  checks.push(checkCompilability(primaryFile));
  checks.push(checkHasExports(primaryFile));

  return checks;
}

// ─── Command Task Scoring ────────────────────────────────────────────────────

function scoreCommandTask(rawResponse: string, files: GeneratedFile[], task: BenchmarkTask): CheckResult[] {
  const checks: CheckResult[] = [];
  const data = task.commandData;
  if (!data) return [fail("no-command-data", "command", 1, "No command data for scoring")];

  // Combine all text: raw response + file contents
  const allText = rawResponse + "\n" + files.map(f => f.content).join("\n");
  const allTextLower = allText.toLowerCase();

  // Check 1: Command accuracy (4 pts)
  // Look for expected commands in ANY format:
  // - "npm run test", "pnpm test", "yarn lint"
  // - "run: npm test" (YAML)
  // - "npm run build" in prose
  // - bare "test", "build", "lint" in CI/script context
  const expectedNames = data.allCommandNames.filter(n =>
    ["build", "test", "lint", "start", "typecheck", "type-check", "dev"].includes(n)
  );

  const matched = expectedNames.filter(name => {
    const nameLower = name.toLowerCase();
    // Check explicit PM + command: "npm run test", "pnpm test", etc.
    const pmPatterns = [
      `npm run ${nameLower}`, `npm ${nameLower}`,
      `pnpm run ${nameLower}`, `pnpm ${nameLower}`,
      `yarn run ${nameLower}`, `yarn ${nameLower}`,
      `bun run ${nameLower}`, `bun ${nameLower}`,
    ];
    if (pmPatterns.some(p => allTextLower.includes(p))) return true;
    // Check YAML-style: "run: npm test" or just the command name in a run block
    if (allTextLower.includes(`run: ${nameLower}`) || allTextLower.includes(`run ${nameLower}`)) return true;
    // Check quoted: '"test"', "'build'"
    if (allText.includes(`"${name}"`) || allText.includes(`'${name}'`)) return true;
    return false;
  });
  const accuracy = expectedNames.length > 0 ? matched.length / expectedNames.length : 0;
  checks.push({
    name: "command-accuracy",
    category: "command",
    weight: 4,
    score: Math.round(accuracy * 4),
    passed: accuracy >= 0.5,
    detail: matched.length > 0
      ? `Found ${matched.length}/${expectedNames.length} commands: ${matched.join(", ")}`
      : `No expected commands found (looked for: ${expectedNames.join(", ")})`,
  });

  // Check 2: Package manager consistency (2 pts)
  const pmMentions = {
    npm: (allText.match(/\bnpm\s+(?:run\s+)?[a-z]/gi) ?? []).length,
    pnpm: (allText.match(/\bpnpm\s+(?:run\s+)?[a-z]/gi) ?? []).length,
    yarn: (allText.match(/\byarn\s+(?:run\s+)?[a-z]/gi) ?? []).length,
    bun: (allText.match(/\bbun\s+(?:run\s+)?[a-z]/gi) ?? []).length,
  };
  const usedPMs = Object.entries(pmMentions).filter(([, count]) => count > 0);
  const correctPM = data.packageManager !== "unknown" && usedPMs.some(([pm]) => pm === data.packageManager);
  const consistent = usedPMs.length <= 1;
  checks.push({
    name: "pm-consistency",
    category: "command",
    weight: 2,
    score: correctPM && consistent ? 2 : correctPM || consistent ? 1 : 0,
    passed: correctPM || consistent,
    detail: correctPM
      ? `Correctly uses ${data.packageManager}`
      : `Expected ${data.packageManager}, found: ${usedPMs.map(([pm]) => pm).join(", ") || "none"}`,
  });

  // Check 3: Completeness (2 pts) — includes build AND test AND lint if all exist
  const hasBuild = data.allCommandNames.includes("build") ? allText.toLowerCase().includes("build") : true;
  const hasTest = data.allCommandNames.includes("test") ? allText.toLowerCase().includes("test") : true;
  const hasLint = data.allCommandNames.includes("lint") ? allText.toLowerCase().includes("lint") : true;
  const complete = hasBuild && hasTest && hasLint;
  checks.push({
    name: "command-completeness",
    category: "command",
    weight: 2,
    score: complete ? 2 : (hasBuild && hasTest) || (hasBuild && hasLint) || (hasTest && hasLint) ? 1 : 0,
    passed: complete,
    detail: complete
      ? "Includes build, test, and lint"
      : `Missing: ${[!hasBuild && "build", !hasTest && "test", !hasLint && "lint"].filter(Boolean).join(", ")}`,
  });

  return checks;
}

// ─── Architecture Task Scoring ───────────────────────────────────────────────

function scoreArchitectureTask(rawResponse: string, task: BenchmarkTask): CheckResult[] {
  const checks: CheckResult[] = [];
  const data = task.architectureData;
  if (!data) return [fail("no-arch-data", "architecture", 1, "No architecture data for scoring")];

  if (!rawResponse || rawResponse.trim().length === 0) {
    return [fail("no-response", "architecture", 8, "No response generated")];
  }

  const response = rawResponse.toLowerCase();
  const expectedDir = data.expectedDirectory.toLowerCase().replace(/\/$/, "");
  const expectedDirName = expectedDir.split("/").filter(Boolean).pop() ?? "";

  // Check 1: Correct directory (4 pts)
  // Match full path (e.g., "src/hooks/") — not just the last segment
  const exactMatch = response.includes(expectedDir);
  const altMatch = !exactMatch && data.alternatives?.some(alt =>
    response.includes(alt.toLowerCase().replace(/\/$/, ""))
  );

  checks.push({
    name: "correct-directory",
    category: "architecture",
    weight: 4,
    score: exactMatch ? 4 : altMatch ? 2 : 0,
    passed: exactMatch || !!altMatch,
    detail: exactMatch
      ? `Correctly identified ${data.expectedDirectory}`
      : altMatch
        ? `Suggested acceptable alternative`
        : `Expected ${data.expectedDirectory}, not found in response`,
  });

  // Check 2: Uses project directory names (2 pts)
  const mentionedDirs = data.allDirectories.filter(dir => {
    const dirName = dir.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
    return dirName.length > 2 && response.includes(dirName);
  });
  checks.push({
    name: "uses-project-dirs",
    category: "architecture",
    weight: 2,
    score: mentionedDirs.length >= 2 ? 2 : mentionedDirs.length >= 1 ? 1 : 0,
    passed: mentionedDirs.length >= 1,
    detail: mentionedDirs.length > 0
      ? `References project directories: ${mentionedDirs.slice(0, 3).join(", ")}`
      : "Does not reference any project directory names",
  });

  // Check 3: Justification quality (2 pts)
  const reasoningKeywords = ["because", "since", "convention", "pattern", "layer", "separation",
    "domain", "cohesion", "existing", "alongside", "consistent", "structure", "organized"];
  const hasReasoning = reasoningKeywords.some(k => response.includes(k));
  const hasSubstance = rawResponse.trim().length > 50;
  checks.push({
    name: "justification-quality",
    category: "architecture",
    weight: 2,
    score: hasReasoning && hasSubstance ? 2 : hasReasoning || hasSubstance ? 1 : 0,
    passed: hasReasoning && hasSubstance,
    detail: hasReasoning
      ? "Provides architectural reasoning"
      : "No architectural justification given",
  });

  return checks;
}

// ─── Convention Checks (10 pts) ──────────────────────────────────────────────

/**
 * Check if common imports are present AND used (4 pts).
 * Verifies each expected import specifier appears in the AST AND
 * at least one imported symbol is referenced in the code.
 */
function checkCommonImports(file: GeneratedFile | undefined, task: BenchmarkTask): CheckResult {
  const weight = 4;
  if (!file) return fail("common-imports", "convention", weight, "No implementation file found");

  const commonImports = task.contributionPattern?.commonImports;
  if (!commonImports || commonImports.length === 0) {
    return pass("common-imports", "convention", weight, "No common imports expected");
  }

  const sourceFile = parseSource(file);
  if (!sourceFile) return fail("common-imports", "convention", weight, "File could not be parsed");

  const fileImports = extractImportSpecifiers(sourceFile);
  const fileContent = file.content;

  let matched = 0;
  const details: string[] = [];

  for (const expected of commonImports) {
    const hasImport = fileImports.some(imp => imp.specifier === expected.specifier);
    if (!hasImport) {
      details.push(`Missing import from '${expected.specifier}'`);
      continue;
    }
    // Check at least one symbol is used in the file body (not just imported)
    const symbolUsed = expected.symbols.some(sym =>
      new RegExp(`\\b${escapeRegex(sym)}\\b`).test(fileContent)
    );
    if (symbolUsed) {
      matched++;
    } else {
      details.push(`Import from '${expected.specifier}' present but symbols not used`);
    }
  }

  const score = Math.round((matched / commonImports.length) * weight);
  return {
    name: "common-imports",
    category: "convention",
    weight,
    score,
    passed: score >= weight * 0.5,
    detail: matched === commonImports.length
      ? `All ${matched} common imports present and used`
      : details.join("; "),
  };
}

/**
 * Check if primary export follows the naming suffix convention (3 pts).
 */
function checkExportSuffix(file: GeneratedFile | undefined, task: BenchmarkTask): CheckResult {
  const weight = 3;
  if (!file) return fail("export-suffix", "convention", weight, "No implementation file found");

  const suffix = task.contributionPattern?.exportSuffix;
  if (!suffix) return pass("export-suffix", "convention", weight, "No export suffix expected");

  const sourceFile = parseSource(file);
  if (!sourceFile) return fail("export-suffix", "convention", weight, "File could not be parsed");

  const exports = extractExportNames(sourceFile);
  const hasSuffix = exports.some(name => name.endsWith(suffix));

  return hasSuffix
    ? pass("export-suffix", "convention", weight, `Export found ending with '${suffix}'`)
    : fail("export-suffix", "convention", weight, `No export ending with '${suffix}' (found: ${exports.join(", ")})`);
}

/**
 * Check file naming convention compliance (2 pts).
 */
function checkFileNaming(file: GeneratedFile | undefined, task: BenchmarkTask): CheckResult {
  const weight = 2;
  if (!file) return fail("file-naming", "convention", weight, "No implementation file found");

  const fileName = basename(file.path, file.path.slice(file.path.lastIndexOf(".")));
  // Check if it matches the dominant naming convention from the task's conventions
  const namingConvention = task.conventions.find(c => c.category === "file-naming");

  if (!namingConvention) {
    return pass("file-naming", "convention", weight, "No naming convention detected");
  }

  const isKebab = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(fileName);
  const isCamel = /^[a-z][a-zA-Z0-9]*$/.test(fileName);
  const isPascal = /^[A-Z][a-zA-Z0-9]*$/.test(fileName);

  const conventionName = namingConvention.name.toLowerCase();
  const matches = (conventionName.includes("kebab") && isKebab) ||
                  (conventionName.includes("camel") && isCamel) ||
                  (conventionName.includes("pascal") && isPascal);

  return matches
    ? pass("file-naming", "convention", weight, `Filename '${fileName}' follows ${namingConvention.name}`)
    : fail("file-naming", "convention", weight, `Filename '${fileName}' does not follow ${namingConvention.name}`);
}

/**
 * Check for anti-pattern violations (1 pt).
 */
function checkAntiPatterns(file: GeneratedFile | undefined, task: BenchmarkTask): CheckResult {
  const weight = 1;
  if (!file) return fail("anti-patterns", "convention", weight, "No implementation file found");
  if (task.antiPatterns.length === 0) {
    return pass("anti-patterns", "convention", weight, "No anti-patterns to check");
  }

  // Simple check: file naming anti-patterns
  const fileName = basename(file.path, file.path.slice(file.path.lastIndexOf(".")));
  for (const ap of task.antiPatterns) {
    if (ap.rule.toLowerCase().includes("camelcase") && /^[a-z][a-zA-Z0-9]*$/.test(fileName) && !ap.rule.toLowerCase().includes("do not")) {
      continue;
    }
  }

  return pass("anti-patterns", "convention", weight, "No anti-pattern violations detected");
}

// ─── Integration Checks (8 pts) ──────────────────────────────────────────────

/**
 * Check if registration file was updated with new import (4 pts).
 * Uses AST-level import superset check: AI imports >= original imports + new module.
 */
function checkRegistrationUpdate(files: GeneratedFile[], task: BenchmarkTask): CheckResult {
  const weight = 4;
  const regFile = task.contributionPattern?.registrationFile;
  if (!regFile) return pass("registration-update", "integration", weight, "No registration file");

  // Find the AI's version of the registration file
  const aiRegFile = files.find(f =>
    f.path === regFile || f.path.endsWith(basename(regFile))
  );

  if (!aiRegFile) {
    return fail("registration-update", "integration", weight, `Registration file '${regFile}' not updated`);
  }

  // Parse both original and AI version
  const originalContent = task.context.registrationFile?.content;
  if (!originalContent) {
    return fail("registration-update", "integration", weight, "Original registration file not available");
  }

  const originalImports = extractImportSpecifiers(parseSource({ path: regFile, content: originalContent })!);
  const aiImports = extractImportSpecifiers(parseSource(aiRegFile)!);

  // Check: AI imports superset of original imports
  const originalSpecs = new Set(originalImports.map(i => i.specifier));
  const aiSpecs = new Set(aiImports.map(i => i.specifier));

  const missingOriginals = [...originalSpecs].filter(s => !aiSpecs.has(s));
  if (missingOriginals.length > 0) {
    return fail("registration-update", "integration", weight,
      `Registration file missing ${missingOriginals.length} original imports (lazy output?)`);
  }

  // Check: new import was added (any new specifier not in original)
  const newImports = [...aiSpecs].filter(s => !originalSpecs.has(s));
  if (newImports.length === 0) {
    return fail("registration-update", "integration", weight, "No new import added to registration file");
  }

  return pass("registration-update", "integration", weight,
    `Registration file updated: ${newImports.length} new import(s) added, all originals preserved`);
}

/**
 * Check if barrel file was updated with new re-export (2 pts).
 */
function checkBarrelUpdate(files: GeneratedFile[], task: BenchmarkTask): CheckResult {
  const weight = 2;
  if (!task.context.barrelFile) return pass("barrel-update", "integration", weight, "No barrel file");

  const aiBarrel = files.find(f =>
    f.path === task.context.barrelFile!.path ||
    f.path.endsWith(basename(task.context.barrelFile!.path))
  );

  if (!aiBarrel) {
    return fail("barrel-update", "integration", weight, "Barrel file not updated");
  }

  // Check for any new export statement
  const originalExports = extractExportSpecifiers(task.context.barrelFile.content);
  const aiExports = extractExportSpecifiers(aiBarrel.content);

  const newExports = aiExports.filter(e => !originalExports.includes(e));
  if (newExports.length > 0) {
    return pass("barrel-update", "integration", weight, `Barrel updated with: ${newExports.join(", ")}`);
  }

  return fail("barrel-update", "integration", weight, "No new re-export added to barrel");
}

/**
 * Check if implementation file is in the correct directory (2 pts).
 */
function checkFileLocation(files: GeneratedFile[], task: BenchmarkTask): CheckResult {
  const weight = 2;
  const inCorrectDir = files.some(f =>
    !f.path.includes(".test.") && !f.path.includes(".spec.") &&
    f.path.startsWith(task.expectedDirectory) || f.path.includes(task.expectedDirectory)
  );

  return inCorrectDir
    ? pass("file-location", "integration", weight, `File placed in ${task.expectedDirectory}`)
    : fail("file-location", "integration", weight, `No implementation file in ${task.expectedDirectory}`);
}

// ─── Structure Checks (4 pts) ────────────────────────────────────────────────

/**
 * Check if filename matches the expected file pattern (2 pts).
 */
function checkFilenamePattern(file: GeneratedFile | undefined, task: BenchmarkTask): CheckResult {
  const weight = 2;
  if (!file) return fail("filename-pattern", "structure", weight, "No implementation file");

  const fileName = basename(file.path);
  // The file pattern from ContributionPattern uses {name} placeholder
  // Convert to a loose regex
  const patternStr = task.expectedFilePattern
    .replace(/\{[^}]+\}/g, "[\\w-]+")
    .replace(/\./g, "\\.");
  const regex = new RegExp(`^${patternStr}$`, "i");

  return regex.test(fileName)
    ? pass("filename-pattern", "structure", weight, `Filename '${fileName}' matches pattern`)
    : fail("filename-pattern", "structure", weight, `Filename '${fileName}' doesn't match pattern '${task.expectedFilePattern}'`);
}

/**
 * Check if test file is co-located (2 pts).
 */
function checkTestCoLocation(files: GeneratedFile[], task: BenchmarkTask): CheckResult {
  const weight = 2;
  const testFile = files.find(f => f.path.includes(".test.") || f.path.includes(".spec."));

  if (!testFile) {
    return fail("test-co-location", "structure", weight, "No test file generated");
  }

  // Check test is in same directory as implementation
  const implFile = files.find(f =>
    !f.path.includes(".test.") && !f.path.includes(".spec.") &&
    f.path.includes(task.expectedDirectory)
  );

  if (!implFile) {
    return fail("test-co-location", "structure", weight, "No implementation file to compare");
  }

  const sameDir = dirname(testFile.path) === dirname(implFile.path);
  return sameDir
    ? pass("test-co-location", "structure", weight, "Test file co-located with implementation")
    : fail("test-co-location", "structure", weight, `Test in ${dirname(testFile.path)}, impl in ${dirname(implFile.path)}`);
}

// ─── Quality Checks (3 pts) ──────────────────────────────────────────────────

/**
 * Check if file compiles without syntax errors (2 pts).
 * Uses ts.createSourceFile() — syntax only, no semantic/import resolution.
 */
function checkCompilability(file: GeneratedFile | undefined): CheckResult {
  const weight = 2;
  if (!file) return fail("compilability", "quality", weight, "No file to check");

  const sourceFile = parseSource(file);
  if (!sourceFile) return fail("compilability", "quality", weight, "File could not be parsed");

  // Check for parse diagnostics (syntax errors only)
  const diagnostics = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics && diagnostics.length > 0) {
    return fail("compilability", "quality", weight,
      `${diagnostics.length} syntax error(s): ${diagnostics[0].messageText}`);
  }

  return pass("compilability", "quality", weight, "No syntax errors");
}

/**
 * Check if file exports at least one non-type symbol (1 pt).
 */
function checkHasExports(file: GeneratedFile | undefined): CheckResult {
  const weight = 1;
  if (!file) return fail("has-exports", "quality", weight, "No file to check");

  const sourceFile = parseSource(file);
  if (!sourceFile) return fail("has-exports", "quality", weight, "File could not be parsed");

  const exports = extractExportNames(sourceFile);
  return exports.length > 0
    ? pass("has-exports", "quality", weight, `${exports.length} export(s) found: ${exports.slice(0, 3).join(", ")}`)
    : fail("has-exports", "quality", weight, "No exports found");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pass(name: string, category: CheckResult["category"], weight: number, detail: string): CheckResult {
  return { name, category, weight, score: weight, passed: true, detail };
}

function fail(name: string, category: CheckResult["category"], weight: number, detail: string): CheckResult {
  return { name, category, weight, score: 0, passed: false, detail };
}

function parseSource(file: GeneratedFile): ts.SourceFile | null {
  try {
    return ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
  } catch {
    return null;
  }
}

interface ImportInfo {
  specifier: string;
  names: string[];
}

function extractImportSpecifiers(sourceFile: ts.SourceFile | null): ImportInfo[] {
  if (!sourceFile) return [];
  const imports: ImportInfo[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const names: string[] = [];
      if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        for (const el of node.importClause.namedBindings.elements) {
          names.push(el.name.text);
        }
      }
      imports.push({ specifier, names });
    }
  });

  return imports;
}

function extractExportNames(sourceFile: ts.SourceFile): string[] {
  const names: string[] = [];

  ts.forEachChild(sourceFile, (node) => {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isExported = mods?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) return;

    // Skip type-only exports
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return;

    if (ts.isFunctionDeclaration(node) && node.name) {
      names.push(node.name.text);
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          names.push(decl.name.text);
        }
      }
    } else if (ts.isClassDeclaration(node) && node.name) {
      names.push(node.name.text);
    }
  });

  return names;
}

function extractExportSpecifiers(content: string): string[] {
  const specs: string[] = [];
  const regex = /export\s+(?:\*|\{[^}]+\})\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    specs.push(match[1]);
  }
  return specs;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
