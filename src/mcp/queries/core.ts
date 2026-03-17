// src/mcp/queries/core.ts — Package resolution + simple data accessors

import { computeImpactRadius } from "../../impact-radius.js";
import type {
  AntiPattern,
  CallGraphEdge,
  CoChangeEdge,
  CommandSet,
  ContributionPattern,
  Convention,
  ExecutionFlow,
  FileImportEdge,
  ImplicitCouplingEdge,
  PackageAnalysis,
  PackageArchitecture,
  PublicAPIEntry,
  StructuredAnalysis,
  WorkflowRule,
} from "../../types.js";
import { ToolError } from "../errors.js";

// ─── Package Resolution ──────────────────────────────────────────────────────

export function resolvePackage(analysis: StructuredAnalysis, packagePath?: string): PackageAnalysis {
  if (!packagePath) {
    if (analysis.packages.length === 1) return analysis.packages[0];
    throw new ToolError("AMBIGUOUS_PACKAGE", `Multiple packages found. Specify packagePath.`, [
      "Call list_packages to see all packages",
      `Available: ${analysis.packages.map((p) => p.name).join(", ")}`,
    ]);
  }
  const pkg = analysis.packages.find((p) => p.relativePath === packagePath || p.name === packagePath);
  if (!pkg) {
    // Single-package monorepos: return the only package regardless of the path hint
    if (analysis.packages.length === 1) return analysis.packages[0];
    throw new ToolError("PACKAGE_NOT_FOUND", `Package '${packagePath}' not found.`, [
      `Available: ${analysis.packages.map((p) => p.name).join(", ")}`,
      analysis.packages.length === 1
        ? "This project is analyzed as a single package — omit packagePath"
        : "Call list_packages for full details",
    ]);
  }
  return pkg;
}

// ─── Query Functions ─────────────────────────────────────────────────────────

export function getCommands(analysis: StructuredAnalysis, packagePath?: string): CommandSet {
  return resolvePackage(analysis, packagePath).commands;
}

export function getArchitecture(analysis: StructuredAnalysis, packagePath?: string): PackageArchitecture {
  return resolvePackage(analysis, packagePath).architecture;
}

export function getImportersForFile(
  analysis: StructuredAnalysis,
  filePath: string,
  packagePath?: string,
): FileImportEdge[] {
  const pkg = resolvePackage(analysis, packagePath);
  const chain = pkg.importChain ?? [];
  return chain.filter((e) => e.source === filePath).sort((a, b) => b.symbolCount - a.symbolCount);
}

export function getCallersForFunction(
  analysis: StructuredAnalysis,
  functionName: string,
  packagePath?: string,
): { directCallers: CallGraphEdge[]; transitiveCount: number } {
  const pkg = resolvePackage(analysis, packagePath);
  const callGraph = pkg.callGraph ?? [];

  const directCallers = callGraph.filter((e) => e.to === functionName);

  // Compute transitive caller count via impact radius
  const impact = computeImpactRadius(callGraph);
  const entry =
    impact.highImpact.find((e) => e.functionName === functionName) ??
    impact.complex.find((e) => e.functionName === functionName);

  return {
    directCallers,
    transitiveCount: entry?.transitiveCallers ?? directCallers.length,
  };
}

export function getCoChangesForFile(
  analysis: StructuredAnalysis,
  filePath: string,
  packagePath?: string,
): CoChangeEdge[] {
  const pkg = resolvePackage(analysis, packagePath);
  const edges = pkg.gitHistory?.coChangeEdges ?? [];
  return edges.filter((e) => e.file1 === filePath || e.file2 === filePath).sort((a, b) => b.jaccard - a.jaccard);
}

export function getWorkflowRules(analysis: StructuredAnalysis, filePath?: string): WorkflowRule[] {
  const rules = analysis.crossPackage?.workflowRules ?? [];
  if (!filePath) return rules;
  return rules.filter((r) => r.trigger.includes(filePath) || r.action.includes(filePath));
}

export function getImplicitCouplingForFile(
  analysis: StructuredAnalysis,
  filePath: string,
  packagePath?: string,
): ImplicitCouplingEdge[] {
  const pkg = resolvePackage(analysis, packagePath);
  const edges = pkg.implicitCoupling ?? [];
  return edges.filter((e) => e.file1 === filePath || e.file2 === filePath).sort((a, b) => b.jaccard - a.jaccard);
}

export function getExportedNamesForFile(
  analysis: StructuredAnalysis,
  filePath: string,
  packagePath?: string,
): string[] {
  const pkg = resolvePackage(analysis, packagePath);
  return pkg.publicAPI.filter((e) => e.sourceFile === filePath && !e.isTypeOnly).map((e) => e.name);
}

export function getExecutionFlows(analysis: StructuredAnalysis, packagePath?: string): ExecutionFlow[] {
  return resolvePackage(analysis, packagePath).executionFlows ?? [];
}

export function getFlowsForFiles(analysis: StructuredAnalysis, files: string[], packagePath?: string): ExecutionFlow[] {
  const flows = getExecutionFlows(analysis, packagePath);
  const fileSet = new Set(files);
  return flows.filter((f) => f.files.some((file) => fileSet.has(file)));
}

export function getFlowsForFunction(
  analysis: StructuredAnalysis,
  fnName: string,
  packagePath?: string,
): ExecutionFlow[] {
  const flows = getExecutionFlows(analysis, packagePath);
  return flows.filter((f) => f.steps.includes(fnName));
}

export function getImportersOfSymbol(
  analysis: StructuredAnalysis,
  symbol: string,
  sourceFile: string,
  packagePath?: string,
): FileImportEdge[] {
  const pkg = resolvePackage(analysis, packagePath);
  return (pkg.importChain ?? []).filter((e) => e.source === sourceFile && e.symbols.includes(symbol));
}

export function getContributionPatterns(
  analysis: StructuredAnalysis,
  packagePath?: string,
  directory?: string,
): ContributionPattern[] {
  const pkg = resolvePackage(analysis, packagePath);
  const patterns = pkg.contributionPatterns ?? [];
  if (directory) {
    return patterns.filter((p) => p.directory === directory || p.directory.includes(directory));
  }
  return patterns;
}

export function getPublicAPI(
  analysis: StructuredAnalysis,
  packagePath?: string,
  query?: string,
  limit: number = 20,
): PublicAPIEntry[] {
  const pkg = resolvePackage(analysis, packagePath);
  let exports = pkg.publicAPI ?? [];
  if (query) {
    const q = query.toLowerCase();
    exports = exports.filter((e) => e.name.toLowerCase().includes(q));
  }
  return exports.slice(0, limit);
}

export function getExampleForExport(
  analysis: StructuredAnalysis,
  exportName: string,
  packagePath?: string,
): { snippet: string; testFile: string } | null {
  const pkg = resolvePackage(analysis, packagePath);
  const example = (pkg.examples ?? []).find((e) => e.exportName === exportName);
  if (!example) return null;
  return { snippet: example.snippet, testFile: example.testFile };
}

export function getFingerprintForExport(
  analysis: StructuredAnalysis,
  exportName: string,
  packagePath?: string,
): { parameterShape: string; returnShape: string } | null {
  const pkg = resolvePackage(analysis, packagePath);
  const fp = (pkg.patternFingerprints ?? []).find((f) => f.exportName === exportName);
  if (!fp) return null;
  return { parameterShape: fp.parameterShape, returnShape: fp.returnShape };
}

export function getConventions(
  analysis: StructuredAnalysis,
  packagePath?: string,
  category?: string,
): { conventions: Convention[]; antiPatterns: AntiPattern[] } {
  const pkg = resolvePackage(analysis, packagePath);
  // Filter to non-style conventions (architecture patterns, not naming/formatting)
  let conventions = (pkg.conventions ?? []).filter(
    (c) => c.category !== "file-naming" || c.confidence.percentage >= 95,
  );
  if (category) {
    conventions = conventions.filter((c) => c.category === category);
  }
  return {
    conventions,
    antiPatterns: pkg.antiPatterns ?? [],
  };
}

export function listPackages(analysis: StructuredAnalysis): {
  name: string;
  path: string;
  type: string;
  entryPoint: string;
  fileCount: number;
}[] {
  return analysis.packages.map((p) => ({
    name: p.name,
    path: p.relativePath,
    type: p.architecture.packageType,
    entryPoint: p.architecture.entryPoint,
    fileCount: p.files.total,
  }));
}

export function getTechStackSummary(analysis: StructuredAnalysis, packagePath?: string): string {
  const pkg = resolvePackage(analysis, packagePath);
  const parts: string[] = [];
  const insights = pkg.dependencyInsights;
  if (insights) {
    if (insights.runtime.length > 0) {
      parts.push(insights.runtime.map((r) => `${r.name} ${r.version}`).join(", "));
    }
    if (insights.frameworks.length > 0) {
      parts.push(insights.frameworks.map((f) => `${f.name} ${f.version}`).join(", "));
    }
    if (insights.testFramework) {
      parts.push(`${insights.testFramework.name} ${insights.testFramework.version}`);
    }
  }
  return parts.join(" | ") || "TypeScript";
}
