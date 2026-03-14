// src/detectors/api-patterns.ts — API pattern detector
// Framework-aware detection: uses DependencyInsights to determine which framework
// is active, then looks for framework-specific patterns in exports/imports.
// Does NOT rely on directory name heuristics (routes/, api/, controllers/).

import { buildConfidence, sourceParsedFiles } from "../convention-extractor.js";
import type { Convention, ConventionDetector } from "../types.js";

// Framework-specific detection strategies
const FRAMEWORK_PATTERNS: Record<string, { packages: string[]; label: string; description: string }> = {
  express: {
    packages: ["express"],
    label: "Express",
    description: "Express.js HTTP framework",
  },
  fastify: {
    packages: ["fastify"],
    label: "Fastify",
    description: "Fastify HTTP framework",
  },
  hono: {
    packages: ["hono"],
    label: "Hono",
    description: "Hono edge-first HTTP framework",
  },
  koa: {
    packages: ["koa", "@koa/router"],
    label: "Koa",
    description: "Koa HTTP framework",
  },
  nestjs: {
    packages: ["@nestjs/core", "@nestjs/common"],
    label: "NestJS",
    description: "NestJS framework with decorators",
  },
  trpc: {
    packages: ["@trpc/server"],
    label: "tRPC",
    description: "tRPC type-safe API framework",
  },
  graphql: {
    packages: ["@apollo/server", "graphql-yoga", "type-graphql", "mercurius"],
    label: "GraphQL server",
    description: "GraphQL API server",
  },
};

export const apiPatternsDetector: ConventionDetector = (files, tiers, _warnings, context) => {
  const conventions: Convention[] = [];
  const sourceFiles = sourceParsedFiles(files, tiers);
  if (sourceFiles.length === 0) return conventions;

  // Strategy 1: Dependency-based detection (highest confidence)
  const detectedFromDeps = new Set<string>();
  if (context?.dependencies?.frameworks) {
    for (const fw of context.dependencies.frameworks) {
      for (const [key, pattern] of Object.entries(FRAMEWORK_PATTERNS)) {
        if (pattern.packages.some((pkg) => fw.name === pkg || fw.name.startsWith(`${pkg}/`))) {
          detectedFromDeps.add(key);
        }
      }
    }
  }

  // Strategy 2: Import-based detection (fallback + validation)
  const importCounts = new Map<string, number>(); // framework key → file count
  for (const file of sourceFiles) {
    const fileFrameworks = new Set<string>();
    for (const imp of file.imports) {
      if (imp.isTypeOnly) continue;
      for (const [key, pattern] of Object.entries(FRAMEWORK_PATTERNS)) {
        if (pattern.packages.some((pkg) => imp.moduleSpecifier === pkg || imp.moduleSpecifier.startsWith(`${pkg}/`))) {
          fileFrameworks.add(key);
        }
      }
    }
    for (const key of fileFrameworks) {
      importCounts.set(key, (importCounts.get(key) ?? 0) + 1);
    }
  }

  // Merge: deps detection + import validation
  const detected = new Set([...detectedFromDeps, ...importCounts.keys()]);
  if (detected.size === 0) return conventions;

  // Emit one convention per detected API framework
  for (const key of detected) {
    const pattern = FRAMEWORK_PATTERNS[key];
    if (!pattern) continue;
    const fileCount = importCounts.get(key) ?? 0;

    // Skip if detected only from deps but no actual imports (monorepo root dep noise)
    if (fileCount === 0 && !detectedFromDeps.has(key)) continue;

    conventions.push({
      category: "api-patterns",
      source: "apiPatterns",
      name: `${pattern.label} API`,
      description: `${pattern.description}${fileCount > 0 ? ` (${fileCount} files import from it)` : ""}`,
      confidence: buildConfidence(Math.max(fileCount, 1), sourceFiles.length),
      examples: fileCount > 0 ? [`${fileCount} files import from ${pattern.packages[0]}`] : [],
    });
  }

  return conventions;
};
