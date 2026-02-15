// src/anti-pattern-detector.ts — Enhancement 3: Anti-Pattern Derivation
// Derives "DO NOT" rules by inverting strong conventions.

import type { Convention, AntiPattern } from "./types.js";

// Inversion rules: convention name pattern → anti-pattern rule
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
    match: /named exports/i,
    rule: () => "Do NOT use default exports",
    reason: (c) => `${c.confidence.description} use named exports — the codebase exclusively uses named exports`,
  },
  {
    match: /barrel import/i,
    rule: () => "Do NOT use deep imports from external packages (e.g., @pkg/lib/internal/foo)",
    reason: (c) => `${c.confidence.description} import from barrel exports`,
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
  {
    match: /type.only import/i,
    rule: () => "Use `import type` for type-only imports",
    reason: (c) => `${c.confidence.description} use type-only imports for types`,
  },
  {
    match: /relative import/i,
    rule: () => "Do NOT use path aliases for internal imports — use relative paths",
    reason: (c) => `${c.confidence.description} use relative imports`,
  },
  {
    match: /displayName/i,
    rule: () => "Set displayName on all React components",
    reason: (c) => `${c.confidence.description} set displayName`,
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
