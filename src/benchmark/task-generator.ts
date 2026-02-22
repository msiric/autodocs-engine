// src/benchmark/task-generator.ts — Generate benchmark tasks from ContributionPatterns
// Tasks are self-referential: the engine tests whether its own AGENTS.md helps AI follow
// the patterns the engine detected.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, dirname, relative } from "node:path";
import type { StructuredAnalysis, ContributionPattern, Convention, AntiPattern } from "../types.js";
import { SOURCE_EXTENSIONS } from "../types.js";
import type { BenchmarkTask, TaskContext, TaskTier, TaskType } from "./types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_SIBLING_LINES = 100;
const TASK_NAME_POOL = [
  "import-ordering", "error-boundary", "accessibility", "keyboard-navigation",
  "dark-mode", "internationalization", "pagination", "search-filter",
  "form-validation", "notification", "authentication", "rate-limiting",
  "caching", "retry-logic", "health-check", "metric-collection",
];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate benchmark tasks from analysis results.
 * Returns tasks sorted by tier (A > B > C) with deterministic sibling selection.
 */
export function generateTasksFromAnalysis(
  analysis: StructuredAnalysis,
  repoPath: string,
  maxTasks: number = 20,
): BenchmarkTask[] {
  const tasks: BenchmarkTask[] = [];

  for (const pkg of analysis.packages) {
    const patterns = pkg.contributionPatterns ?? [];
    const conventions = pkg.conventions ?? [];
    const antiPatterns = pkg.antiPatterns ?? [];
    const pkgPath = join(repoPath, pkg.relativePath);

    for (const pattern of patterns) {
      const tier = classifyTier(pattern);
      const task = generateTaskFromPattern(
        pattern, pkg.name, pkgPath, tier, conventions, antiPatterns,
      );
      if (task) tasks.push(task);
    }

    // Command tasks — generate from pkg.commands
    const cmdTasks = generateCommandTasks(pkg, pkgPath, conventions, antiPatterns);
    tasks.push(...cmdTasks);

    // Architecture tasks — generate from pkg.architecture.directories
    const archTasks = generateArchitectureTasks(pkg, pkgPath, conventions, antiPatterns);
    tasks.push(...archTasks);
  }

  // Sort by tier quality (A first), then by maxScoringPoints descending
  tasks.sort((a, b) => {
    const tierOrder = { A: 0, B: 1, C: 2 };
    const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return b.maxScoringPoints - a.maxScoringPoints;
  });

  return tasks.slice(0, maxTasks);
}

/**
 * Classify a ContributionPattern into a tier based on deep signal richness.
 */
export function classifyTier(pattern: ContributionPattern): TaskTier {
  const hasCommonImports = (pattern.commonImports?.length ?? 0) > 0;
  const hasExportSuffix = !!pattern.exportSuffix;
  const hasRegistration = !!pattern.registrationFile;
  const signals = [hasCommonImports, hasExportSuffix, hasRegistration].filter(Boolean).length;

  if (signals === 3) return "A";
  if (signals >= 1) return "B";
  return "C";
}

// ─── Task Generation ─────────────────────────────────────────────────────────

function generateTaskFromPattern(
  pattern: ContributionPattern,
  packageName: string,
  pkgPath: string,
  tier: TaskTier,
  conventions: Convention[],
  antiPatterns: AntiPattern[],
): BenchmarkTask | null {
  const absDir = join(pkgPath, pattern.directory);

  // Derive a task name that doesn't collide with existing files
  const taskName = deriveTaskName(pattern, absDir);
  if (!taskName) return null;

  // Build the prompt (deliberately vague — AGENTS.md should fill in the details)
  const prompt = buildTaskPrompt(pattern, taskName, packageName);

  // Collect context files (siblings, registration, barrel)
  const context = collectContext(pattern, pkgPath, absDir);

  // Calculate max scoring points based on tier
  const maxPoints = tier === "A" ? 25 : tier === "B" ? 18 : 12;

  return {
    id: `pattern-${pattern.directory.replace(/\//g, "-")}-${taskName}`,
    repoPath: pkgPath,
    packageName,
    tier,
    taskType: "pattern" as const,
    prompt,
    contributionPattern: pattern,
    conventions,
    antiPatterns,
    expectedDirectory: pattern.directory,
    expectedFilePattern: pattern.filePattern,
    maxScoringPoints: maxPoints,
    context,
  };
}

/**
 * Derive a plausible task name that doesn't collide with existing exports.
 */
export function deriveTaskName(
  pattern: ContributionPattern,
  absDir: string,
): string | null {
  // List existing files in the directory
  let existingFiles: string[] = [];
  try {
    existingFiles = readdirSync(absDir)
      .filter(f => SOURCE_EXTENSIONS.test(f))
      .map(f => basename(f, f.slice(f.lastIndexOf("."))));
  } catch {
    return null;
  }

  const existing = new Set(existingFiles.map(f => f.toLowerCase()));

  // Try names from the pool, applying the pattern's naming convention
  for (const candidate of TASK_NAME_POOL) {
    const name = pattern.exportSuffix
      ? candidate  // Will get suffix applied later
      : candidate;

    if (!existing.has(name.toLowerCase())) {
      return name;
    }
  }

  return null;
}

function buildTaskPrompt(
  pattern: ContributionPattern,
  taskName: string,
  packageName: string,
): string {
  const typeLabel = pattern.type === "function" ? "utility function"
    : pattern.type === "hook" ? "React hook"
    : pattern.type === "component" ? "React component"
    : pattern.type;

  // Deliberately vague — doesn't mention imports, suffixes, or registration
  return `Add a new ${typeLabel} for "${taskName}" to the ${packageName} project. `
    + `It should handle ${taskName.replace(/-/g, " ")} functionality. `
    + `Include implementation, any necessary registration or re-exports, and a test file.`;
}

// ─── Context Collection ──────────────────────────────────────────────────────

/**
 * Collect context files for benchmark conditions.
 * Deterministic sibling selection: exampleFile + most recent + median-dated.
 */
export function collectContext(
  pattern: ContributionPattern,
  pkgPath: string,
  absDir: string,
): TaskContext {
  const siblingFiles = selectSiblings(pattern, pkgPath, absDir);
  const directoryListing = listDirectory(absDir);

  let registrationFile: TaskContext["registrationFile"];
  if (pattern.registrationFile) {
    const regPath = join(pkgPath, pattern.registrationFile);
    try {
      registrationFile = {
        path: pattern.registrationFile,
        content: readFileSync(regPath, "utf-8"),
      };
    } catch { /* file doesn't exist */ }
  }

  // Find barrel file (index.ts in directory or parent)
  let barrelFile: TaskContext["barrelFile"];
  for (const candidate of ["index.ts", "index.tsx", "../index.ts"]) {
    const barrelPath = join(absDir, candidate);
    try {
      const content = readFileSync(barrelPath, "utf-8");
      barrelFile = {
        path: relative(pkgPath, barrelPath),
        content,
      };
      break;
    } catch { /* try next */ }
  }

  return { siblingFiles, registrationFile, barrelFile, directoryListing };
}

/**
 * Deterministic sibling selection algorithm.
 * 1. Always include exampleFile
 * 2. Most recently modified non-example sibling
 * 3. If 5+ files, add median-dated file
 */
function selectSiblings(
  pattern: ContributionPattern,
  pkgPath: string,
  absDir: string,
): TaskContext["siblingFiles"] {
  const result: TaskContext["siblingFiles"] = [];

  // 1. Always include the example file
  const examplePath = join(pkgPath, pattern.exampleFile);
  try {
    result.push({
      path: pattern.exampleFile,
      content: truncateFile(readFileSync(examplePath, "utf-8")),
    });
  } catch { /* missing */ }

  // List all source files in directory, with modification times
  let filesWithMtime: { name: string; mtime: number }[] = [];
  try {
    filesWithMtime = readdirSync(absDir)
      .filter(f => SOURCE_EXTENSIONS.test(f) && !f.includes(".test.") && !f.includes(".spec.") && f !== "index.ts" && f !== "index.tsx")
      .map(f => {
        try {
          return { name: f, mtime: statSync(join(absDir, f)).mtimeMs };
        } catch {
          return { name: f, mtime: 0 };
        }
      })
      .filter(f => {
        const relPath = relative(pkgPath, join(absDir, f.name));
        return relPath !== pattern.exampleFile;
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch { /* dir read error */ }

  // 2. Most recently modified non-example sibling
  if (filesWithMtime.length > 0) {
    const newest = filesWithMtime[0];
    const newestPath = join(absDir, newest.name);
    try {
      result.push({
        path: relative(pkgPath, newestPath),
        content: truncateFile(readFileSync(newestPath, "utf-8")),
      });
    } catch { /* read error */ }
  }

  // 3. If 5+ files, add median-dated file
  if (filesWithMtime.length >= 4) {
    const medianIdx = Math.floor(filesWithMtime.length / 2);
    const median = filesWithMtime[medianIdx];
    const medianPath = join(absDir, median.name);
    // Skip if same as newest
    if (median.name !== filesWithMtime[0]?.name) {
      try {
        result.push({
          path: relative(pkgPath, medianPath),
          content: truncateFile(readFileSync(medianPath, "utf-8")),
        });
      } catch { /* read error */ }
    }
  }

  return result;
}

function listDirectory(absDir: string): string[] {
  try {
    return readdirSync(absDir)
      .filter(f => SOURCE_EXTENSIONS.test(f))
      .sort();
  } catch {
    return [];
  }
}

function truncateFile(content: string): string {
  const lines = content.split("\n");
  if (lines.length <= MAX_SIBLING_LINES) return content;
  return lines.slice(0, MAX_SIBLING_LINES).join("\n") + "\n// ... truncated";
}

// ─── Command Task Generation ─────────────────────────────────────────────────

const COMMAND_TASK_PROMPTS = [
  {
    id: "ci-workflow",
    prompt: (pkg: string) =>
      `Write a GitHub Actions CI workflow (YAML) for the ${pkg} project that runs the standard build, test, and lint commands. Use the correct package manager and exact script names from this project.`,
  },
  {
    id: "pre-commit",
    prompt: (pkg: string) =>
      `Write a shell script that acts as a pre-commit hook for the ${pkg} project. It should run the project's lint and type-check commands before allowing a commit.`,
  },
];

function generateCommandTasks(
  pkg: import("../types.js").PackageAnalysis,
  pkgPath: string,
  conventions: Convention[],
  antiPatterns: AntiPattern[],
): BenchmarkTask[] {
  const commands = pkg.commands;
  if (!commands) return [];

  // Need at least build + test
  const availableCommands: string[] = [];
  if (commands.build) availableCommands.push(commands.build.run);
  if (commands.test) availableCommands.push(commands.test.run);
  if (commands.lint) availableCommands.push(commands.lint.run);
  if (commands.start) availableCommands.push(commands.start.run);

  if (availableCommands.length < 2) return [];

  const allNames: string[] = [];
  if (commands.build) allNames.push("build");
  if (commands.test) allNames.push("test");
  if (commands.lint) allNames.push("lint");
  if (commands.start) allNames.push("start");
  for (const cmd of commands.other) {
    allNames.push(cmd.run.split(" ").pop() ?? cmd.run);
  }

  const tier: TaskTier = availableCommands.length >= 4 ? "A" : availableCommands.length >= 3 ? "B" : "C";

  // Read package.json scripts for condition B context
  let packageJsonScripts = "";
  try {
    const pkgJson = JSON.parse(readFileSync(join(pkgPath, "package.json"), "utf-8"));
    if (pkgJson.scripts) {
      packageJsonScripts = JSON.stringify(pkgJson.scripts, null, 2);
    }
  } catch { /* no package.json */ }

  const dirListing = listDirectory(join(pkgPath, "src")) ?? listDirectory(pkgPath);

  const taskDef = COMMAND_TASK_PROMPTS[0]; // CI workflow task
  return [{
    id: `command-${taskDef.id}`,
    repoPath: pkgPath,
    packageName: pkg.name,
    tier,
    taskType: "command" as const,
    prompt: taskDef.prompt(pkg.name),
    conventions,
    antiPatterns,
    expectedDirectory: "",
    expectedFilePattern: "",
    maxScoringPoints: 8,
    context: {
      siblingFiles: packageJsonScripts ? [{ path: "package.json (scripts)", content: packageJsonScripts }] : [],
      directoryListing: dirListing,
    },
    commandData: {
      expectedCommands: availableCommands,
      packageManager: commands.packageManager,
      allCommandNames: allNames,
    },
  }];
}

// ─── Architecture Task Generation ────────────────────────────────────────────

const ARCHITECTURE_FEATURE_MAP: Record<string, { feature: string; keywords: string[] }> = {
  "hooks": { feature: "a new React hook for clipboard management", keywords: ["hooks", "hook", "use"] },
  "components": { feature: "a new UI component for notifications", keywords: ["components", "component", "ui"] },
  "utils": { feature: "a new utility function for string formatting", keywords: ["utils", "utilities", "helpers"] },
  "middleware": { feature: "new authentication middleware", keywords: ["middleware", "interceptor"] },
  "api": { feature: "a new REST API endpoint for user preferences", keywords: ["api", "routes", "endpoints", "handlers"] },
  "services": { feature: "a new service for email notifications", keywords: ["services", "service"] },
  "detectors": { feature: "a new convention detector for import patterns", keywords: ["detectors", "detector", "plugins"] },
  "lib": { feature: "a new shared library module", keywords: ["lib", "core", "shared"] },
  "types": { feature: "new TypeScript type definitions for configuration", keywords: ["types", "interfaces", "models"] },
  "test": { feature: "new integration test helpers", keywords: ["test", "tests", "testing", "spec"] },
};

function generateArchitectureTasks(
  pkg: import("../types.js").PackageAnalysis,
  pkgPath: string,
  conventions: Convention[],
  antiPatterns: AntiPattern[],
): BenchmarkTask[] {
  const arch = pkg.architecture;
  if (!arch || arch.directories.length < 3) return [];

  const tasks: BenchmarkTask[] = [];
  const dirListing = listDirectory(join(pkgPath, "src")) ?? listDirectory(pkgPath);
  const allDirNames = arch.directories.map(d => d.path);

  // Find directories that match our feature map
  for (const dir of arch.directories) {
    const dirName = dir.path.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";

    // Find a matching feature for this directory
    let featureMatch: { feature: string; keywords: string[] } | undefined;
    for (const [key, value] of Object.entries(ARCHITECTURE_FEATURE_MAP)) {
      if (value.keywords.some(k => dirName.includes(k))) {
        featureMatch = value;
        break;
      }
    }

    if (!featureMatch) continue;

    // Find alternative acceptable directories
    const alternatives = arch.directories
      .filter(d => d.path !== dir.path && d.purpose?.toLowerCase().includes(dirName))
      .map(d => d.path);

    const tier: TaskTier = arch.directories.length >= 5 ? "A" : "B";

    tasks.push({
      id: `architecture-${dirName}`,
      repoPath: pkgPath,
      packageName: pkg.name,
      tier,
      taskType: "architecture" as const,
      prompt: `You need to add ${featureMatch.feature} to the ${pkg.name} project. `
        + `Which directory should this code go in? Respond with the directory path and a brief justification for your choice.`,
      conventions,
      antiPatterns,
      expectedDirectory: dir.path,
      expectedFilePattern: "",
      maxScoringPoints: 8,
      context: {
        siblingFiles: [],
        directoryListing: dirListing,
      },
      architectureData: {
        expectedDirectory: dir.path,
        directoryPurpose: dir.purpose,
        alternatives,
        allDirectories: allDirNames,
      },
    });

    if (tasks.length >= 2) break; // Max 2 architecture tasks per package
  }

  return tasks;
}
