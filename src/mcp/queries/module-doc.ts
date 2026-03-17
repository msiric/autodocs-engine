// src/mcp/queries/module-doc.ts — Auto-generated module docs

import type { StructuredAnalysis } from "../../types.js";
import { resolvePackage } from "./core.js";

// ─── Module Documentation ────────────────────────────────────────────────────

export interface ModuleDoc {
  directory: string;
  purpose: string;
  fileCount: number;
  files: { path: string; exports: string[] }[];
  dependencies: { file: string; symbolCount: number }[];
  dependents: { file: string; symbolCount: number }[];
  internalCalls: { from: string; to: string }[];
  flows: { label: string; position: string }[];
  coChangePartners: { internal: string; external: string; jaccard: number }[];
  clusters: string[][];
  contribution?: { filePattern: string; exportSuffix?: string; registrationFile?: string; steps: string[] };
}

/** Helper: get the directory of a file path (everything before the last /). */
export function fileDir(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx >= 0 ? filePath.slice(0, idx) : ".";
}

/**
 * Generate structured module documentation for a directory.
 * Aggregates data from importChain, callGraph, executionFlows, gitHistory,
 * coChangeClusters, contributionPatterns, and architecture.directories.
 */
export function getModuleDoc(analysis: StructuredAnalysis, directory: string, packagePath?: string): ModuleDoc {
  const pkg = resolvePackage(analysis, packagePath);
  const dir = directory.replace(/\/$/, ""); // Normalize trailing slash

  // Purpose from architecture detector (if available)
  const archDir = pkg.architecture.directories.find((d) => d.path === dir);
  const purpose = archDir?.purpose ?? "";

  // Files directly in this directory (not nested subdirectories)
  const moduleFiles = new Set<string>();
  for (const edge of pkg.importChain ?? []) {
    for (const f of [edge.importer, edge.source]) {
      if (fileDir(f) === dir) moduleFiles.add(f);
    }
  }
  // Also check publicAPI and callGraph for files not in importChain
  for (const e of pkg.publicAPI) {
    if (fileDir(e.sourceFile) === dir) moduleFiles.add(e.sourceFile);
  }
  for (const e of pkg.callGraph ?? []) {
    if (fileDir(e.fromFile) === dir) moduleFiles.add(e.fromFile);
    if (fileDir(e.toFile) === dir) moduleFiles.add(e.toFile);
  }

  // Files with their exports
  const files = [...moduleFiles].sort().map((f) => ({
    path: f,
    exports: pkg.publicAPI.filter((e) => e.sourceFile === f && !e.isTypeOnly).map((e) => e.name),
  }));

  // Dependencies: files outside this module that we import from
  const depMap = new Map<string, number>();
  for (const edge of pkg.importChain ?? []) {
    if (moduleFiles.has(edge.importer) && !moduleFiles.has(edge.source)) {
      depMap.set(edge.source, (depMap.get(edge.source) ?? 0) + edge.symbolCount);
    }
  }
  const dependencies = [...depMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([file, symbolCount]) => ({ file, symbolCount }));

  // Dependents: files outside this module that import from us
  const deptMap = new Map<string, number>();
  for (const edge of pkg.importChain ?? []) {
    if (moduleFiles.has(edge.source) && !moduleFiles.has(edge.importer)) {
      deptMap.set(edge.importer, (deptMap.get(edge.importer) ?? 0) + edge.symbolCount);
    }
  }
  const dependents = [...deptMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([file, symbolCount]) => ({ file, symbolCount }));

  // Internal call graph (both caller and callee in this module)
  const internalCalls = (pkg.callGraph ?? [])
    .filter((e) => moduleFiles.has(e.fromFile) && moduleFiles.has(e.toFile))
    .map((e) => ({ from: e.from, to: e.to }));

  // Execution flows passing through this module
  const flows = (pkg.executionFlows ?? [])
    .filter((f) => f.files.some((file) => moduleFiles.has(file)))
    .map((f) => {
      const positions = f.files
        .map((file, i) => (moduleFiles.has(file) ? `step ${i + 1}/${f.length}` : null))
        .filter(Boolean);
      return { label: f.label, position: positions.join(", ") };
    });

  // Co-change partners (files outside module that co-change with files inside)
  const coChangePartners: ModuleDoc["coChangePartners"] = [];
  for (const edge of pkg.gitHistory?.coChangeEdges ?? []) {
    const f1In = moduleFiles.has(edge.file1);
    const f2In = moduleFiles.has(edge.file2);
    if (f1In && !f2In) {
      coChangePartners.push({ internal: edge.file1, external: edge.file2, jaccard: edge.jaccard });
    } else if (f2In && !f1In) {
      coChangePartners.push({ internal: edge.file2, external: edge.file1, jaccard: edge.jaccard });
    }
  }
  coChangePartners.sort((a, b) => b.jaccard - a.jaccard);

  // Cluster membership
  const clusters = (pkg.coChangeClusters ?? []).filter((c) => c.some((f) => moduleFiles.has(f)));

  // Contribution pattern
  const cp = (pkg.contributionPatterns ?? []).find((p) => p.directory === `${dir}/` || p.directory === dir);
  const contribution = cp
    ? {
        filePattern: cp.filePattern,
        exportSuffix: cp.exportSuffix,
        registrationFile: cp.registrationFile,
        steps: cp.steps,
      }
    : undefined;

  return {
    directory: dir,
    purpose,
    fileCount: moduleFiles.size,
    files,
    dependencies,
    dependents,
    internalCalls,
    flows,
    coChangePartners,
    clusters,
    contribution,
  };
}
