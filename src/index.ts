// src/index.ts — Library API
// Two entry points: analyze() and format()

import { resolve } from "node:path";
import {
  formatDeterministic as formatDeterministicImpl,
  formatHierarchical,
  formatHierarchicalDeterministic as formatHierarchicalDeterministicImpl,
  formatWithLLM,
} from "./llm-adapter.js";
import { runPipeline } from "./pipeline.js";
import type { ResolvedConfig, StructuredAnalysis } from "./types.js";
import { discoverWorkspacePackages, readWorkspaceGlobs } from "./workspace-resolver.js";

export type { BudgetReport } from "./budget-validator.js";
export { formatBudgetReport, validateBudget } from "./budget-validator.js";
export { generateMinimalAgentsMd } from "./deterministic-formatter.js";
export { diffAnalyses } from "./diff-analyzer.js";

export { mergeWithExisting, readExistingAgentsMd, wrapWithDelimiters } from "./existing-docs.js";
export type { HierarchicalOutput } from "./llm-adapter.js";
export { validateOutput } from "./output-validator.js";
export { fingerprintTopExports } from "./pattern-fingerprinter.js";
// Re-export all public types
export type {
  AnalysisDiff,
  AntiPattern,
  CallGraphEdge,
  CallReference,
  Command,
  CommandSet,
  ConfigAnalysis,
  ContributionPattern,
  Convention,
  ConventionCategory,
  ConventionConfidence,
  CrossPackageAnalysis,
  DependencyInsights,
  DependencySummary,
  DetectorContext,
  DirectoryInfo,
  ExistingDocs,
  FileInventory,
  OutputFormat,
  PackageAnalysis,
  PackageArchitecture,
  PackageDependency,
  PackageRole,
  PatternFingerprint,
  PublicAPIEntry,
  PublicConfig,
  ResolvedConfig,
  RuleImpact,
  StructuredAnalysis,
  SymbolKind,
  ValidationIssue,
  ValidationResult,
  Warning,
} from "./types.js";

export { ENGINE_VERSION } from "./types.js";

const DEFAULTS: Omit<ResolvedConfig, "packages"> = {
  exclude: [],
  output: { format: "json", dir: "." },
  llm: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    maxOutputTokens: 4096,
  },
  conventions: { disable: [] },
  maxPublicAPIEntries: 100,
  verbose: false,
  metaToolThreshold: 5,
  noMetaTool: false,
  typeChecking: false,
};

/**
 * Analyze one or more packages and produce a StructuredAnalysis.
 * This is the core intelligence engine — pure computation + file reads.
 */
export async function analyze(options: Partial<ResolvedConfig> & { packages: string[] }): Promise<StructuredAnalysis> {
  let packages = options.packages.map((p) => resolve(p));
  let rootDir = options.rootDir ? resolve(options.rootDir) : undefined;

  // Auto-detect workspace packages: if a single directory has workspace globs,
  // expand to the individual workspace packages (monorepo root → workspace packages).
  // This makes MCP and CLI automatically analyze real source packages, not empty roots.
  if (packages.length === 1 && !rootDir) {
    const root = packages[0];
    const globs = readWorkspaceGlobs(root);
    if (globs.length > 0) {
      const workspacePkgs = discoverWorkspacePackages(root, globs);
      if (workspacePkgs.length > 0) {
        packages = workspacePkgs;
        rootDir = root;
      }
    }
  }

  const config: ResolvedConfig = {
    ...DEFAULTS,
    ...options,
    packages,
    rootDir,
    output: { ...DEFAULTS.output, ...options.output },
    llm: { ...DEFAULTS.llm, ...options.llm },
    conventions: { ...DEFAULTS.conventions, ...options.conventions },
  };
  return runPipeline(config);
}

/**
 * Format a StructuredAnalysis into a context file string.
 * For "json" format, no LLM call is made.
 * For other formats, requires an API key.
 */
export async function format(
  analysis: StructuredAnalysis,
  config: Pick<ResolvedConfig, "output" | "llm">,
): Promise<string> {
  return formatWithLLM(analysis, config);
}

/**
 * Format using deterministic code for 13 sections + micro-LLM for synthesis.
 * Default mode for agents.md output — eliminates hallucinations.
 */
export async function formatDeterministic(
  analysis: StructuredAnalysis,
  config: Pick<ResolvedConfig, "output" | "llm">,
  rootDir?: string,
): Promise<string> {
  return formatDeterministicImpl(analysis, config, rootDir);
}

/**
 * Format a StructuredAnalysis into hierarchical output: root AGENTS.md + per-package detail files.
 * Only applicable for multi-package analysis with agents.md format.
 * For single-package, falls back to flat format.
 */
export async function formatAsHierarchy(
  analysis: StructuredAnalysis,
  config: Pick<ResolvedConfig, "output" | "llm">,
): Promise<import("./llm-adapter.js").HierarchicalOutput> {
  return formatHierarchical(analysis, config);
}

/**
 * Format hierarchical output using deterministic code + micro-LLM for synthesis.
 * Eliminates hallucinations in root + per-package detail files.
 */
export async function formatHierarchicalDeterministic(
  analysis: StructuredAnalysis,
  config: Pick<ResolvedConfig, "output" | "llm">,
): Promise<import("./llm-adapter.js").HierarchicalOutput> {
  return formatHierarchicalDeterministicImpl(analysis, config);
}
