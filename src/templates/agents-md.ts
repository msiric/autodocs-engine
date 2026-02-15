// Templates for AGENTS.md output — research-backed lean format
// Root template targets ~70 lines. Package detail templates carry the specifics.
// Based on user research: AI follows commands/workflows reliably, ignores style rules.

// ─── Single-package template (for analyzing 1 package) ─────────────────────

export const agentsMdSingleTemplate = {
  systemPrompt: `You are writing an AGENTS.md context file for a TypeScript package. Your audience is an AI coding tool (Claude Code, Cursor, Copilot) that will read this file to produce correct code.

CRITICAL RULES:
- Target 60-80 lines. Every line must be something an AI tool reliably follows.
- Be prescriptive: write rules ("Use X") not observations ("The codebase uses X").
- OMIT style rules (kebab-case, named exports, import ordering) — linters enforce those.
- Describe CAPABILITIES, not file paths. "Business logic via custom hooks" not "src/hooks/ — 16 files".
- Include only high and medium impact rules. Low-impact rules waste instruction budget.
- Commands must be exact and directly executable.
- Workflow rules must be conditional: "After X → run Y".
- Include a Team Knowledge placeholder section at the end.`,

  formatInstructions: `Generate a LEAN AGENTS.md from the structured analysis below. Output ONLY markdown, no code fences or explanations.

REQUIRED STRUCTURE:

# {package.name}

{role.summary — one sentence describing what this package does and its tech stack}

## Commands
{Exact commands with variants. Table format preferred. Include test, build, lint, start.}

## Architecture
{Describe what the package DOES, not where files live. 4-6 bullet points describing capabilities.}
{Reference one canonical example file per capability for pattern-following.}

Example:
- **Tab CRUD**: Create, read, update channel page tabs via custom hooks (see \`use-create-channel-page-tab.tsx\`)
- **Permissions**: Runtime permission checks for tab operations

## Workflow Rules
{ONLY "After X → run Y" or "When X → do Y" rules. These are what AI tools actually follow.}
{Include rules from testing, graphql, telemetry conventions.}

## How to Add New Code
{From contribution patterns. For each: where to create, what pattern to follow, which example.}

## Public API
{Top exports grouped by kind. Include signatures for hooks/functions. Max 20 entries — most-imported first.}

## Key Dependencies
{Internal and external, only the important ones (top 5-8).}

## Team Knowledge
_This section is for human-maintained context that cannot be inferred from source code. Add design rationale, known issues, debugging tips, or operational knowledge here._

IMPORTANT:
- Do NOT include style conventions (naming, export style, import ordering) — linters handle those
- Do NOT include directory listings with file counts — they get stale
- Do NOT include full export lists — keep to top 20 most-imported
- Mark any low-impact rules with "(enforce via linter)" if you must include them
- Target: 60-80 lines total`,
};

// ─── Multi-package ROOT template (~70 lines) ───────────────────────────────

export const agentsMdMultiRootTemplate = {
  systemPrompt: `You are writing a ROOT AGENTS.md for a multi-package feature area in a TypeScript monorepo. This file is a LEAN INDEX — it provides commands, architecture overview, and pointers to per-package detail files.

CRITICAL RULES:
- Target 60-80 lines. This is a compressed index, NOT comprehensive documentation.
- Commands shown ONCE (not per-package).
- Architecture described as CAPABILITIES, not file paths.
- Include a package guide table mapping "I need to do X → touch Y package".
- Include workflow rules (After X → run Y).
- Include domain terminology AI wouldn't know from code.
- Point to per-package files for details: "See packages/{name}.md for conventions and API."
- OMIT: export lists, style conventions, directory file counts, full API surface.
- Include only high and medium impact information.
- Include a Team Knowledge placeholder section.`,

  formatInstructions: `Generate a LEAN ROOT AGENTS.md (~70 lines) from the multi-package analysis below. Output ONLY markdown.

REQUIRED STRUCTURE:

# {Feature Name} (derive from package name patterns)

{One sentence: what this feature area does. Include tech stack declaration.}

## Commands
{From rootCommands or most common package commands. Show ONCE. Table format.}
{Include test, build, lint and any workflow commands.}

## Package Guide

| Task | Package |
|------|---------|
{Map common developer tasks to the right package using role.whenToUse. 6-10 rows.}

## Architecture
{Describe the feature's capabilities as 4-6 bullets. Not file paths — capabilities.}
{Show package dependency flow in one line if clear (e.g., "entry → hooks → events").}

## Workflow Rules
{Conditional rules: "After X → run Y". From conventions with high impact.}
{E.g., "After modifying .graphql files → run \`yarn generate:interfaces\`"}

## Domain Terminology
{Terms AI wouldn't know from code alone. 3-5 entries max.}

## Package Details
{For each package, one line pointing to its detail file:}
- **{short-name}**: {role.summary} → See \`packages/{filename}.md\`

## Team Knowledge
_Human-maintained context. Add design rationale, known issues, debugging tips here._

IMPORTANT:
- Do NOT include export lists, public API, or style conventions in this root file
- Do NOT include directory listings with file counts
- Target: 60-80 lines total`,
};

// ─── Per-package DETAIL template (for hierarchical output) ─────────────────

export const agentsMdPackageDetailTemplate = {
  systemPrompt: `You are writing a per-package AGENTS.md detail file for one package in a multi-package feature area. This file provides package-specific conventions, API surface, and contribution patterns.

The ROOT AGENTS.md already covers commands, architecture overview, and workflow rules. Do NOT repeat those here.

CRITICAL RULES:
- Focus on package-specific details: role, public API, how to add code, package-specific rules.
- Include all impact levels but mark low-impact rules with "(enforce via linter)".
- Be prescriptive and example-driven.
- Include signatures for hooks and functions.`,

  formatInstructions: `Generate a package detail file from the analysis below. Output ONLY markdown.

REQUIRED STRUCTURE:

# {package.name}

{role.summary}. {role.purpose}.

**When to touch this package:** {role.whenToUse}

## Public API
{All exports grouped by kind (hooks, components, functions, types, constants).}
{Include signatures for hooks and functions. Include import counts if available.}

## How to Add New Code
{From contribution patterns. For each type: directory, file pattern, example file, steps.}

## Conventions
{Package-specific conventions as DO/DO NOT directives.}
{Mark low-impact rules: "(enforce via linter)"}

### High Impact (AI must follow)
{Testing, GraphQL, telemetry, workflow conventions}

### Style (enforce via linter)
{File naming, export style, import ordering — listed for reference but linter-enforced}

## Dependencies
{Internal and external dependencies with import counts.}

DO NOT include:
- Commands (they're in the root AGENTS.md)
- Architecture overview (in root)
- Workflow rules (in root)`,
};

// ─── Legacy multi-package template (flat mode) ─────────────────────────────

export const agentsMdMultiTemplate = {
  systemPrompt: `You are writing a developer guide for a multi-package feature area in a TypeScript monorepo. Your audience is an AI coding tool that needs to understand this codebase to produce correct code.

You are generating an AGENTS.md for a MULTI-PACKAGE feature area. This covers multiple related packages that together form a feature.

From the structured analysis, synthesize a guide that answers:
1. What does this feature area do? (derive from package roles)
2. Which package do I touch for what? (from role.whenToUse — this is the MOST IMPORTANT section)
3. How do the packages relate? (from dependency graph)
4. How do I add new code in each package? (from contribution patterns)
5. What are the team-wide rules? (from shared conventions + anti-patterns as DO/DO NOT)
6. What is the public API? (by package, grouped by kind)
7. What are the commands? (from root commands, shown ONCE)

Be prescriptive, not descriptive. Write rules, not observations. Every line must be actionable.

Target length: 120-200 lines for 5-8 packages. Include a Team Knowledge placeholder section.`,

  formatInstructions: `Generate a multi-package AGENTS.md from the following structured analysis. Output ONLY the markdown content, no code fences or explanations.

REQUIRED STRUCTURE (follow this exactly):

# {Feature Name} (derive from package name patterns)

{One paragraph: what this feature area does, how many packages, and their high-level roles}

## Package Map

| Package | Role | Public Exports | When to Touch |
|---------|------|---------------|---------------|
{one row per package — use role.summary and role.whenToUse}

## When to Touch Which Package
{For each package, one line: "**{name}**: {role.whenToUse}"}

This section answers: "I need to add X — which package?" Map common tasks to packages.

## Dependency Graph

{List each edge as: pkg-a -> pkg-b}
{If a clear flow exists (e.g., entry -> hooks -> events), describe it in one sentence}

## Commands

{From rootCommands or the most common package-level commands. Show ONCE, not per-package.}
{Include variants like :watch, :coverage if present}

## How to Add New Code
{From contribution patterns. Group by package. For each pattern show: directory, file pattern, example file, steps.}

## Rules

### DO (Team-Wide)
{From shared conventions with >= 80% confidence, as directives with examples}

### DO NOT (Team-Wide)
{From shared anti-patterns, with reasons}

### Package-Specific Rules
{From divergent conventions — where packages differ from the team norm. ALSO any package-specific anti-patterns not in the shared set.}

## Public API by Package

{For each package with publicAPI.length > 0, create a subsection:}

### {package.name}
{List exports grouped by kind (hooks, components, functions, types). Include signatures for hooks and functions.}

## Architecture

{For each package: compact summary with entry point, directories, and what each directory contains}
{Use the directory-export mapping to show organizational intent, not just file counts}

## Team Knowledge
_This section is for human-maintained context that cannot be inferred from source code. Add design rationale, known issues, debugging tips, or operational knowledge here._`,
};

// Default export (single-package)
export const agentsMdTemplate = agentsMdSingleTemplate;
