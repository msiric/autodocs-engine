# Deterministic Template Implementation Plan

**Date:** 2026-02-18
**Problem:** LLM formatting hallucinates technologies not in the structured analysis. 13 of 15 AGENTS.md sections contain only data that can be formatted deterministically in code.
**Solution:** Generate data-grounded sections in code. Use LLM only for the 2-3 sections that genuinely need synthesis.
**Expected impact:** Accuracy jumps from 5.8 → 8.0+ because most of the output can't be wrong by construction.

---

## Architecture Change

### Current Flow (100% LLM)
```
StructuredAnalysis → serializeToMarkdown() → all data as LLM input
  → LLM generates entire AGENTS.md → validate → output
```
**Problem:** LLM adds hallucinated technologies, ignores data, invents content.

### New Flow (70% deterministic, 30% LLM)
```
StructuredAnalysis →
  ├─ generateDeterministicSections() → 13 sections formatted in code (no LLM)
  ├─ extractReadmeContext()          → README first paragraph (file read, no LLM)
  ├─ synthesizeArchitecture()        → micro-LLM call with ONLY architecture data
  └─ synthesizeDomainTerms()         → micro-LLM call with ONLY README excerpt

  → assembleFinalOutput()            → combine all sections → AGENTS.md
```

**Key principle:** The LLM receives ONLY the specific data for the section it's synthesizing. It never sees the full analysis. It can't hallucinate React because it never sees import data that might mention React.

---

## Implementation Steps

### Step 1: New Module — `src/deterministic-formatter.ts`

**Purpose:** Generate 13 AGENTS.md sections directly from structured analysis data. No LLM call.

**Functions:**

```typescript
export function generateDeterministicAgentsMd(
  analysis: StructuredAnalysis,
): DeterministicOutput {
  return {
    title: formatTitle(analysis),
    summary: formatSummary(analysis),
    techStack: formatTechStack(analysis),
    commands: formatCommands(analysis),
    packageGuide: formatPackageGuide(analysis),    // multi-package only
    workflowRules: formatWorkflowRules(analysis),
    howToAddCode: formatContributionPatterns(analysis),
    publicAPI: formatPublicAPI(analysis),
    dependencies: formatDependencies(analysis),
    conventions: formatConventions(analysis),
    dependencyGraph: formatDependencyGraph(analysis), // multi-package only
    mermaidDiagram: analysis.crossPackage?.mermaidDiagram ?? "",
    teamKnowledge: TEAM_KNOWLEDGE_PLACEHOLDER,
    // These are left empty — filled by LLM synthesis step
    architecture: "",
    domainTerminology: "",
  };
}
```

**Each formatting function** produces a markdown string for its section. The logic already exists in `src/llm/serializer.ts` — we're essentially refactoring it from "serialize for LLM input" to "format as AGENTS.md output."

**Key differences from current serializer:**
- Output is in AGENTS.md format (headers, tables, bullet lists), not in "here's the raw data" format
- Commands use a table format: `| Command | Description |`
- Public API grouped by kind (hooks, functions, components, types)
- Conventions formatted as DO/DO NOT directives
- Anti-patterns integrated into the conventions section
- No percentage stats, no file counts, no internal metadata

**Formatting details per section:**

```typescript
function formatTitle(analysis: StructuredAnalysis): string {
  const pkg = analysis.packages[0];
  return `# ${pkg.name}`;
}

function formatSummary(analysis: StructuredAnalysis): string {
  const pkg = analysis.packages[0];
  return pkg.role?.summary ?? pkg.description ?? `TypeScript package: ${pkg.name}`;
}

function formatTechStack(analysis: StructuredAnalysis): string {
  // Aggregate from all packages
  const parts: string[] = [];
  const seen = new Set<string>();

  for (const pkg of analysis.packages) {
    // Runtime
    for (const rt of pkg.dependencyInsights?.runtime ?? []) {
      const key = rt.name;
      if (!seen.has(key)) { parts.push(`${rt.name} ${rt.version}`); seen.add(key); }
    }
    // Frameworks (with version)
    for (const fw of pkg.dependencyInsights?.frameworks ?? []) {
      const key = fw.name;
      if (!seen.has(key)) { parts.push(`${fw.name} ${fw.version}`); seen.add(key); }
    }
    // Config tools
    if (pkg.configAnalysis?.linter?.name && pkg.configAnalysis.linter.name !== "none") {
      const key = `linter:${pkg.configAnalysis.linter.name}`;
      if (!seen.has(key)) { parts.push(`${pkg.configAnalysis.linter.name} (lint)`); seen.add(key); }
    }
    // ... formatter, build tool
  }

  if (parts.length === 0) return "";

  const lines = [`## Tech Stack`, parts.join(" | ")];
  // Add version guidance sub-bullets
  for (const pkg of analysis.packages) {
    for (const fw of pkg.dependencyInsights?.frameworks ?? []) {
      if (fw.guidance) lines.push(`- ${fw.guidance}`);
    }
  }
  return lines.join("\n");
}

function formatCommands(analysis: StructuredAnalysis): string {
  const lines = ["## Commands", "", "| Command | Description |", "|---------|-------------|"];

  // Root commands first (if multi-package)
  const rootCmds = analysis.crossPackage?.rootCommands;
  if (rootCmds) {
    if (rootCmds.build) lines.push(`| \`${rootCmds.build.run}\` | Build |`);
    if (rootCmds.test) lines.push(`| \`${rootCmds.test.run}\` | Test |`);
    if (rootCmds.lint) lines.push(`| \`${rootCmds.lint.run}\` | Lint |`);
    if (rootCmds.start) lines.push(`| \`${rootCmds.start.run}\` | Start dev |`);
    for (const cmd of rootCmds.other) {
      lines.push(`| \`${cmd.run}\` | ${cmd.source} |`);
    }
  } else {
    // Single package commands
    const pkg = analysis.packages[0];
    if (pkg.commands.build) lines.push(`| \`${pkg.commands.build.run}\` | Build |`);
    if (pkg.commands.test) {
      lines.push(`| \`${pkg.commands.test.run}\` | Test |`);
      for (const v of pkg.commands.test.variants ?? []) {
        lines.push(`| \`${v.run}\` | Test (${v.name}) |`);
      }
    }
    if (pkg.commands.lint) lines.push(`| \`${pkg.commands.lint.run}\` | Lint |`);
    if (pkg.commands.start) lines.push(`| \`${pkg.commands.start.run}\` | Start |`);
    for (const cmd of pkg.commands.other) {
      lines.push(`| \`${cmd.run}\` | ${cmd.source} |`);
    }
  }

  // Workspace commands
  if (analysis.crossPackage?.workspaceCommands?.length) {
    for (const cmd of analysis.crossPackage.workspaceCommands) {
      lines.push(`| \`${cmd.run}\` | ${cmd.category} (${cmd.packagePath}) |`);
    }
  }

  return lines.join("\n");
}

// ... similar for all other sections
```

**Estimated effort:** ~300 lines. Most logic is adapting existing serializer patterns.

---

### Step 2: README Context Extraction

**Extend `src/existing-docs.ts`:**

```typescript
/**
 * Read the first paragraph of the README.md for domain context.
 * Returns the first non-empty paragraph (up to 500 chars) after the title.
 */
export function extractReadmeContext(
  packageDir: string,
  rootDir?: string,
): string | undefined {
  const dirs = rootDir ? [packageDir, rootDir] : [packageDir];

  for (const dir of dirs) {
    for (const name of ["README.md", "readme.md", "Readme.md"]) {
      const path = join(dir, name);
      if (existsSync(path)) {
        try {
          const content = readFileSync(path, "utf-8");
          return extractFirstParagraph(content);
        } catch { continue; }
      }
    }
  }
  return undefined;
}

function extractFirstParagraph(markdown: string): string | undefined {
  const lines = markdown.split("\n");
  let inParagraph = false;
  const paragraphLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip title, badges, empty lines before first paragraph
    if (trimmed.startsWith("#") || trimmed.startsWith("[!") || trimmed.startsWith("[![")) continue;
    if (trimmed === "" && !inParagraph) continue;
    if (trimmed === "" && inParagraph) break; // end of first paragraph

    inParagraph = true;
    paragraphLines.push(trimmed);
  }

  const result = paragraphLines.join(" ").slice(0, 500);
  return result || undefined;
}
```

**Estimated effort:** ~40 lines.

---

### Step 3: Micro-LLM Calls for Synthesis Sections

**New function in `src/llm/adapter.ts`:**

```typescript
/**
 * Generate ONLY the architecture section via a constrained micro-LLM call.
 * Input is limited to directory names, export names, and call graph edges.
 * The LLM cannot hallucinate technologies because it doesn't see them.
 */
export async function synthesizeArchitecture(
  pkg: PackageAnalysis,
  llmConfig: ResolvedConfig["llm"],
): Promise<string> {
  // Build constrained input — ONLY architecture data
  const input: string[] = [];
  input.push(`Package: ${pkg.name}`);
  input.push(`Type: ${pkg.architecture.packageType}`);
  input.push(`Entry: ${pkg.architecture.entryPoint}`);
  input.push("");
  input.push("Directories and their exports:");
  for (const dir of pkg.architecture.directories) {
    if (dir.exports?.length) {
      input.push(`  ${dir.purpose}: ${dir.exports.join(", ")}`);
    }
  }
  if (pkg.callGraph?.length) {
    input.push("");
    input.push("Key call relationships:");
    for (const edge of pkg.callGraph.slice(0, 10)) {
      input.push(`  ${edge.from} → ${edge.to}`);
    }
  }

  const systemPrompt = `You are writing 4-6 bullet points describing a TypeScript package's architecture.
Use ONLY the directory names, export names, and call relationships provided below.
Describe CAPABILITIES (what the code does), not file locations.
Do NOT mention any technology, framework, or library by name — only describe what the exports DO.
Output ONLY the bullet points, no headers or explanations.`;

  const userPrompt = input.join("\n");

  if (!llmConfig.apiKey) return ""; // Graceful fallback — skip architecture synthesis

  try {
    const result = await callLLMWithRetry(systemPrompt, userPrompt, {
      ...llmConfig,
      maxOutputTokens: 500, // Very constrained
    });
    return `## Architecture\n${result}`;
  } catch {
    // Fallback: deterministic architecture from directories
    return formatArchitectureFallback(pkg);
  }
}

/**
 * Generate domain terminology from README context.
 */
export async function synthesizeDomainTerms(
  readmeContext: string | undefined,
  llmConfig: ResolvedConfig["llm"],
): Promise<string> {
  if (!readmeContext || !llmConfig.apiKey) return "";

  const systemPrompt = `Extract 3-5 domain-specific terms from the project description below.
For each term, provide a one-line definition.
These are terms that an AI coding tool wouldn't know from reading source code alone.
Output as a markdown list. If no domain-specific terms are found, output nothing.`;

  try {
    const result = await callLLMWithRetry(systemPrompt, readmeContext, {
      ...llmConfig,
      maxOutputTokens: 300,
    });
    return result.trim() ? `## Domain Terminology\n${result}` : "";
  } catch {
    return "";
  }
}
```

**Key constraints on the micro-LLM calls:**
- Architecture call: receives ONLY directory names, export names, call graph edges. No framework names, no import data, no technology mentions.
- Domain call: receives ONLY the README first paragraph. Can't hallucinate technology stack.
- Both have `maxOutputTokens` capped at 300-500 (tiny output).
- Both have fallbacks if LLM fails (deterministic formatting or empty section).

**Estimated effort:** ~100 lines in adapter.ts.

---

### Step 4: Assembly Function

**New function in `src/deterministic-formatter.ts`:**

```typescript
export function assembleFinalOutput(
  deterministic: DeterministicOutput,
  architectureSection: string,
  domainSection: string,
): string {
  const sections: string[] = [];

  sections.push(deterministic.title);
  sections.push("");
  sections.push(deterministic.summary);
  sections.push("");

  if (deterministic.techStack) sections.push(deterministic.techStack, "");
  sections.push(deterministic.commands, "");

  if (deterministic.packageGuide) sections.push(deterministic.packageGuide, "");

  if (architectureSection) sections.push(architectureSection, "");

  if (deterministic.workflowRules) sections.push(deterministic.workflowRules, "");
  if (domainSection) sections.push(domainSection, "");
  if (deterministic.howToAddCode) sections.push(deterministic.howToAddCode, "");

  sections.push(deterministic.publicAPI, "");
  sections.push(deterministic.dependencies, "");

  if (deterministic.dependencyGraph) sections.push(deterministic.dependencyGraph, "");
  if (deterministic.mermaidDiagram) sections.push(deterministic.mermaidDiagram, "");

  if (deterministic.conventions) sections.push(deterministic.conventions, "");

  sections.push(deterministic.teamKnowledge);

  return sections.filter(s => s !== "").join("\n");
}
```

**Estimated effort:** ~30 lines.

---

### Step 5: Integration Into Pipeline

**Modified `src/llm/adapter.ts`:**

Add a new function `formatDeterministic()` that uses the deterministic formatter + micro-LLM calls:

```typescript
export async function formatDeterministic(
  analysis: StructuredAnalysis,
  config: Pick<ResolvedConfig, "output" | "llm">,
): Promise<string> {
  // Step 1: Deterministic sections (no LLM)
  const deterministic = generateDeterministicAgentsMd(analysis);

  // Step 2: README context
  const readmeContext = extractReadmeContext(
    analysis.packages[0]?.relativePath ?? ".",
    config.output.rootDir,
  );

  // Step 3: Micro-LLM calls for synthesis (small, constrained)
  const architectureSection = config.llm.apiKey
    ? await synthesizeArchitecture(analysis.packages[0], config.llm)
    : formatArchitectureFallback(analysis.packages[0]);

  const domainSection = config.llm.apiKey
    ? await synthesizeDomainTerms(readmeContext, config.llm)
    : "";

  // Step 4: Assemble
  return assembleFinalOutput(deterministic, architectureSection, domainSection);
}
```

**Make this the DEFAULT for `--format agents.md`.** Keep the current full-LLM path as `--llm-synthesis full` (per the other agent's suggestion).

---

### Step 6: CLI Flag

**Modified `src/bin/autodocs-engine.ts` and `src/config.ts`:**

Add `--llm-synthesis` flag:
- `deterministic` (default): new deterministic approach with micro-LLM for synthesis sections
- `full`: current full-LLM approach (backward compatible)

```bash
# New default — deterministic + micro-LLM
npx autodocs-engine analyze . --format agents.md

# Old behavior — full LLM (for users who prefer it)
npx autodocs-engine analyze . --format agents.md --llm-synthesis full
```

**Estimated effort:** ~20 lines.

---

### Step 7: Hierarchical Deterministic Output

Extend `src/llm/hierarchical.ts` to use the deterministic formatter for root + per-package files. The root file uses multi-package formatting (package guide, dependency graph, aggregated commands). Per-package files use single-package formatting.

**Estimated effort:** ~50 lines.

---

### Step 8: Tests

**New file: `test/deterministic-formatter.test.ts`**

Test cases:
- Commands table formatted correctly from CommandSet data
- Tech stack aggregated from multiple packages
- Public API grouped by kind and sorted by import count
- Conventions formatted as DO/DO NOT without percentages
- Package guide table generated from role.whenToUse
- README extraction returns first paragraph
- Assembly produces valid markdown with all sections
- No LLM key → graceful fallback (architecture section omitted or deterministic)
- `--llm-synthesis full` falls back to current behavior

**Estimated effort:** ~150 lines.

---

## Summary

| Step | What | Files | Est. Lines |
|------|------|-------|-----------|
| 1 | Deterministic formatter | new: `src/deterministic-formatter.ts` | ~300 |
| 2 | README extraction | `src/existing-docs.ts` | ~40 |
| 3 | Micro-LLM synthesis | `src/llm/adapter.ts` | ~100 |
| 4 | Assembly function | `src/deterministic-formatter.ts` | ~30 |
| 5 | Pipeline integration | `src/llm/adapter.ts` | ~30 |
| 6 | CLI flag | `src/bin/autodocs-engine.ts`, `src/config.ts` | ~20 |
| 7 | Hierarchical support | `src/llm/hierarchical.ts` | ~50 |
| 8 | Tests | `test/deterministic-formatter.test.ts` | ~150 |
| **Total** | | | **~720** |

---

## Validation

After implementation, re-run on the 4 worst benchmark repos:

```bash
# Knip — should have NO React (deterministic tech stack from analysis data)
npx tsx src/bin/autodocs-engine.ts analyze /tmp/final-benchmark/knip/packages/knip \
  --root /tmp/final-benchmark/knip --format agents.md --output /tmp/deterministic-test/knip
grep -i "react" /tmp/deterministic-test/knip/AGENTS.md && echo "FAIL" || echo "PASS"

# MCP SDK — should gracefully handle empty src/ (no fabricated content)
npx tsx src/bin/autodocs-engine.ts analyze /tmp/final-benchmark/mcp-sdk/src \
  --root /tmp/final-benchmark/mcp-sdk --format agents.md --output /tmp/deterministic-test/mcp-sdk

# Sanity — should have NO jest.mock (deterministic conventions from analysis)
npx tsx src/bin/autodocs-engine.ts analyze /tmp/final-benchmark/sanity/packages/sanity \
  --root /tmp/final-benchmark/sanity --format agents.md --output /tmp/deterministic-test/sanity
grep -i "jest.mock" /tmp/deterministic-test/sanity/AGENTS.md && echo "FAIL" || echo "PASS"
```

**Success criteria:**
1. Zero hallucinated technologies in deterministic sections (Commands, Tech Stack, API, Conventions)
2. Architecture section (micro-LLM) mentions only capabilities, no technology names
3. Domain section extracted from README (if available)
4. All 249 existing tests pass
5. `--llm-synthesis full` produces identical output to current behavior
6. Output ≥80 lines for all repos with meaningful content
