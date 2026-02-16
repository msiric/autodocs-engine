// src/diff-analyzer.ts — W2-4: Diff-Aware Analysis
// Compares current StructuredAnalysis to a previous snapshot.
// Detects new/removed exports, changed conventions, command changes, version bumps.
// Outputs a summary and needsUpdate boolean for CI integration.

import type { StructuredAnalysis, AnalysisDiff } from "./types.js";

/**
 * Compare two StructuredAnalysis snapshots and produce a diff report.
 * Operates on the first package in each analysis (for single-package comparison).
 * For multi-package, compares packages by name.
 */
export function diffAnalyses(
  current: StructuredAnalysis,
  previous: StructuredAnalysis,
): AnalysisDiff {
  const diff: AnalysisDiff = {
    newExports: [],
    removedExports: [],
    changedConventions: [],
    newConventions: [],
    commandsChanged: false,
    dependencyChanges: {
      added: [],
      removed: [],
      majorVersionChanged: [],
    },
    summary: "",
    needsUpdate: false,
  };

  // Build maps of packages by name for comparison
  const currentPkgs = new Map(current.packages.map((p) => [p.name, p]));
  const previousPkgs = new Map(previous.packages.map((p) => [p.name, p]));

  // Compare matching packages
  for (const [name, curPkg] of currentPkgs) {
    const prevPkg = previousPkgs.get(name);
    if (!prevPkg) continue;

    // Export diff
    const curExports = new Set(curPkg.publicAPI.map((e) => e.name));
    const prevExports = new Set(prevPkg.publicAPI.map((e) => e.name));

    for (const exp of curExports) {
      if (!prevExports.has(exp)) diff.newExports.push(`${name}:${exp}`);
    }
    for (const exp of prevExports) {
      if (!curExports.has(exp)) diff.removedExports.push(`${name}:${exp}`);
    }

    // Convention diff
    const curConventions = new Map(curPkg.conventions.map((c) => [c.name, c]));
    const prevConventions = new Map(prevPkg.conventions.map((c) => [c.name, c]));

    for (const [convName, curConv] of curConventions) {
      const prevConv = prevConventions.get(convName);
      if (!prevConv) {
        diff.newConventions.push(`${name}:${convName}`);
      } else {
        // Check confidence shift >10%
        const confShift = Math.abs(curConv.confidence.percentage - prevConv.confidence.percentage);
        if (confShift > 10) {
          diff.changedConventions.push(
            `${name}:${convName} (${prevConv.confidence.percentage}% → ${curConv.confidence.percentage}%)`,
          );
        }
      }
    }

    // Command diff
    const cmdFields = ["build", "test", "lint", "start"] as const;
    for (const field of cmdFields) {
      const curCmd = curPkg.commands[field]?.run;
      const prevCmd = prevPkg.commands[field]?.run;
      if (curCmd !== prevCmd) {
        diff.commandsChanged = true;
      }
    }

    // Dependency diff
    if (curPkg.dependencyInsights && prevPkg.dependencyInsights) {
      const curFwMap = new Map(curPkg.dependencyInsights.frameworks.map((f) => [f.name, f.version]));
      const prevFwMap = new Map(prevPkg.dependencyInsights.frameworks.map((f) => [f.name, f.version]));

      for (const [fwName, curVersion] of curFwMap) {
        const prevVersion = prevFwMap.get(fwName);
        if (!prevVersion) {
          diff.dependencyChanges.added.push(`${fwName}@${curVersion}`);
        } else {
          const curMajor = parseInt(curVersion.split(".")[0], 10);
          const prevMajor = parseInt(prevVersion.split(".")[0], 10);
          if (!isNaN(curMajor) && !isNaN(prevMajor) && curMajor !== prevMajor) {
            diff.dependencyChanges.majorVersionChanged.push(
              `${fwName} ${prevVersion} → ${curVersion}`,
            );
          }
        }
      }
      for (const [fwName] of prevFwMap) {
        if (!curFwMap.has(fwName)) {
          diff.dependencyChanges.removed.push(fwName);
        }
      }
    }
  }

  // Determine needsUpdate
  diff.needsUpdate =
    diff.newExports.length > 0 ||
    diff.removedExports.length > 0 ||
    diff.commandsChanged ||
    diff.dependencyChanges.majorVersionChanged.length > 0 ||
    diff.changedConventions.length > 2;

  // Compose summary
  const parts: string[] = [];
  if (diff.newExports.length > 0) parts.push(`${diff.newExports.length} new export(s)`);
  if (diff.removedExports.length > 0) parts.push(`${diff.removedExports.length} removed export(s)`);
  if (diff.newConventions.length > 0) parts.push(`${diff.newConventions.length} new convention(s)`);
  if (diff.changedConventions.length > 0) parts.push(`${diff.changedConventions.length} changed convention(s)`);
  if (diff.commandsChanged) parts.push("commands changed");
  if (diff.dependencyChanges.added.length > 0) parts.push(`${diff.dependencyChanges.added.length} dependency added`);
  if (diff.dependencyChanges.removed.length > 0) parts.push(`${diff.dependencyChanges.removed.length} dependency removed`);
  if (diff.dependencyChanges.majorVersionChanged.length > 0) parts.push(`${diff.dependencyChanges.majorVersionChanged.length} major version bump(s)`);

  if (parts.length === 0) {
    diff.summary = "No significant changes detected.";
  } else {
    diff.summary = `Changes: ${parts.join(", ")}. ${diff.needsUpdate ? "AGENTS.md should be regenerated." : "Changes are minor — regeneration optional."}`;
  }

  return diff;
}
