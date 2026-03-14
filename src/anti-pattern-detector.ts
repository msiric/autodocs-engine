// src/anti-pattern-detector.ts — Enhancement 3: Anti-Pattern Derivation
// Derives "DO NOT" rules by inverting strong conventions.

import type { AntiPattern, Convention } from "./types.js";

// W5-A: Removed inversion rules for deleted detectors (named exports, barrel imports,
// type-only imports, relative imports, displayName). Kept: file naming, testing, hooks.
const INVERSION_RULES: {
  match: RegExp;
  rule: (conv: Convention) => string;
  reason: (conv: Convention) => string;
}[] = [
  {
    match: /kebab.?case/i,
    rule: () => "Do NOT use camelCase or PascalCase for filenames",
    reason: (c) => `${c.confidence.description} use kebab-case — the codebase exclusively uses kebab-case filenames`,
  },
  {
    match: /camel.?case/i,
    rule: () => "Do NOT use kebab-case or PascalCase for filenames",
    reason: (c) => `${c.confidence.description} use camelCase — the codebase exclusively uses camelCase filenames`,
  },
  {
    match: /co.?located tests/i,
    rule: () => "Do NOT put tests in a separate __tests__ directory — co-locate tests with source",
    reason: (c) => `${c.confidence.description} co-locate tests next to source files`,
  },
  {
    match: /hooks return objects/i,
    rule: () => "Do NOT return arrays from hooks (use { value, setter } not [value, setter])",
    reason: (c) => `${c.confidence.description} return objects from hooks`,
  },
  // Phase 1A: Error handling inversions (project-relative, not prescriptive)
  {
    match: /typed error class hierarchy/i,
    rule: (c) =>
      `Do NOT use inline new Error() for domain errors — use typed error subclasses (${c.examples?.[0] ?? "see existing error classes"})`,
    reason: (c) => `${c.confidence.description} define typed error class hierarchies`,
  },
  {
    match: /Result\/Either pattern|Custom Result type/i,
    rule: () => "Do NOT throw exceptions for expected failures — use Result types",
    reason: (c) => `${c.confidence.description} use Result/Either types for error handling`,
  },
  // Phase 1B: Async pattern inversions
  {
    match: /Promise\.all concurrent/i,
    rule: () => "Do NOT await independent async operations sequentially — use Promise.all/allSettled",
    reason: (c) => `${c.confidence.description} use Promise.all for concurrent operations`,
  },
  {
    match: /Sequential await in loops/i,
    rule: () => "Do NOT use await inside loops for independent operations — batch with Promise.all",
    reason: (c) => `${c.confidence.description} contain sequential await in loops`,
  },
];

/**
 * Derive anti-patterns from conventions.
 */
export function deriveAntiPatterns(conventions: Convention[]): AntiPattern[] {
  const antiPatterns: AntiPattern[] = [];

  for (const conv of conventions) {
    const pct = conv.confidence.percentage;
    if (pct < 80) continue; // Only derive from strong conventions

    const confidence: "high" | "medium" = pct >= 95 ? "high" : "medium";

    // Try each inversion rule
    for (const rule of INVERSION_RULES) {
      if (rule.match.test(conv.name)) {
        antiPatterns.push({
          rule: rule.rule(conv),
          reason: rule.reason(conv),
          confidence,
          derivedFrom: conv.name,
        });
        break; // Only one inversion per convention
      }
    }
  }

  return antiPatterns;
}

/**
 * Derive shared anti-patterns from cross-package shared conventions.
 */
export function deriveSharedAntiPatterns(sharedConventions: Convention[]): AntiPattern[] {
  return deriveAntiPatterns(sharedConventions);
}
