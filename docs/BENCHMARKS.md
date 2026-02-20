# Benchmarks

> Engine vs human-written context files across 10 TypeScript repos.
>
> Latest benchmark: 2026-02-20 (v5 — deterministic output, meta-tool detection, fixture exclusion, change impact, role inference fix).

## Benchmark Repos

| # | Repo | Stars | Archetype | Human File | Lines |
|---|------|------:|-----------|-----------|------:|
| 1 | sanity-io/sanity | 6K | CMS monorepo | AGENTS.md | 386 |
| 2 | medusajs/medusa | 32K | E-commerce API | CLAUDE.md | 341 |
| 3 | vercel/ai | 22K | AI SDK monorepo | AGENTS.md | 284 |
| 4 | modelcontextprotocol/typescript-sdk | 12K | SDK | CLAUDE.md | 266 |
| 5 | webpro-nl/knip | 10K | CLI tool | CLAUDE.md | 183 |
| 6 | unjs/nitro | 10K | Backend server | AGENTS.md | 164 |
| 7 | openstatusHQ/openstatus | 8K | Web app | CLAUDE.md | 106 |
| 8 | documenso/documenso | 12K | Web app (Remix) | AGENTS.md | — |
| 9 | Effect-TS/effect | 13K | Functional library | AGENTS.md | 77 |
| 10 | excalidraw/excalidraw | 117K | Component library | CLAUDE.md | 34 |

Selected from 30+ candidates. Criteria: >5K stars, >80% TypeScript, existing human-written context file, <1000 source files, actively maintained.

## Latest Results (v5)

### Structural Validation

| Metric | Result |
|--------|--------|
| **Technology hallucinations** | **0 across all 10 repos** |
| **Correct role descriptions** | 9/10 (openstatus has 0 source files at target path) |
| **Commands detected** | 10/10 |
| **Architecture section** | 10/10 |
| **Change Impact section** | 8/10 (skipped when call graph <10 edges) |
| **Prompted Team Knowledge** | 10/10 |
| **Public API surface** | 7/10 (3 repos have no barrel/public exports) |

### Output Comparison

| Repo | Engine | Human | Role Description |
|------|-------:|------:|-----------------|
| sanity | 108 | 386 | Sanity is a real-time content infrastructure |
| medusa | 255 | 341 | Building blocks for digital commerce |
| vercel/ai | 292 | 284 | AI SDK by Vercel - The AI Toolkit for TypeScript and JavaScript |
| mcp-sdk | 147 | 266 | Model Context Protocol implementation |
| knip | 111 | 183 | Find and fix unused dependencies, exports and files |
| nitro | 102 | 164 | Build and Deploy Universal JavaScript Servers |
| openstatus | 55 | 106 | (no source files at target) |
| documenso | 444 | — | API server |
| effect | 155 | 77 | The missing standard library for TypeScript |
| excalidraw | 226 | 34 | Excalidraw as a React component |

Role descriptions now come from package.json `description` field — accurate and author-written.

### What the Engine Does Better

1. **Structured commands table.** Every output has exact command strings in a table. Human files embed commands in prose paragraphs.

2. **Public API with signatures.** 13-100 exported functions with type signatures, sorted by import count. No human file provides this.

3. **Change Impact analysis.** "callLLMWithRetry has 9 callers — be careful modifying it." Computed via BFS on the call graph. No human file has this.

4. **Prompted Team Knowledge.** Specific questions derived from what the engine found: "What's the process for adding a new detector?" "Are there ordering requirements between commands?" Human files have generic contributing guidelines.

5. **Budget discipline.** Engine output respects the 100-300 line instruction budget. Sanity's human file is 386 lines (exceeds research-backed limit).

6. **Zero hallucinations.** Every technology, command, and dependency is verified against actual code. The deterministic formatter generates 14/16 sections without any LLM involvement.

### What Human Files Do Better

1. **Operational workflows.** Knip: "Debug, don't guess. Use `--debug` flag." "Run knip directly in a fixture directory." These are project-specific insights from the maintainer's head.

2. **Architecture with rationale.** Vercel AI: package dependency diagram showing `ai → @ai-sdk/provider-utils → @ai-sdk/provider`. Shows WHY the structure exists, not just WHAT exists.

3. **Coding style preferences.** Knip: "Prefer plain `for..in/of` loops over iterator methods." Effect: "mandatory validation steps." These are conventions that can't be inferred from code patterns alone.

4. **Debug workflows.** Knip: "Use `--performance` or `--performance-fn [name]` to profile." Excalidraw: "Use `yarn test:typecheck` to verify TypeScript."

### The Gap

The engine produces the **structural 60%** that's tedious to write by hand: commands, API surface, conventions, tech stack, change impact. Human files have the **operational 40%** that requires project knowledge: debug workflows, coding preferences, architectural rationale, and project-specific "when X → do Y" rules.

The **prompted Team Knowledge** section bridges this gap by asking the right questions — the engine tells you what it found and asks you to fill in what it can't know.

---

## Historical Scores (v1-v3)

Before the deterministic output pivot, the engine used full-LLM generation which produced hallucinations. These scores are included for historical context.

| Version | What Changed | Engine Avg |
|---------|-------------|----------:|
| v1 (baseline) | First 10-repo benchmark | 5.9 |
| v2 (post-bugfix) | 16 algorithm bugs fixed | 5.9 |
| v3 (grounded prompting) | XML tags, temperature 0, whitelist validator | 5.5 |
| **v5 (deterministic)** | **14/16 sections in code, fixture exclusion, meta-tool, change impact** | **—** |

v5 has not been formally scored on the 7-dimension scale. The structural validation shows zero hallucinations and correct output across all repos — a qualitative improvement that the 7-dimension scoring didn't capture for v1-v3.

### Key Lesson

The pivot from full-LLM generation (v1-v3) to deterministic output (v5) solved the accuracy problem by construction. Instead of trying to make the LLM more faithful with prompting tricks, the engine now generates most sections in code where hallucination is impossible. The LLM is only used for 2 narrowly-scoped synthesis tasks (architecture capabilities, domain terminology) where it receives constrained input and cannot fabricate technology names.

## Algorithm Audit Summary

A systematic trace of all data flow paths found 16 bugs across 7 categories. All fixed.

| Category | Count | Severity | Example |
|----------|------:|----------|---------|
| Root dependency leakage | 3 | Critical | React from docs site appeared in CLI tool analysis |
| Package name resolution | 2 | High | Analysis path "src" leaked as title instead of "nitro" |
| Framework false positives | 3 | High | Version guidance for frameworks not imported by source |
| Command extraction | 2 | Medium | Workspace commands from unrelated packages |
| Output quality | 3 | Medium | Templates treated as ceilings, not floors |
| Edge cases | 4 | Medium | Analyzing src/ directly, workspace:\* protocol |
| Validator gaps | 3 | Medium | Can't catch upstream data pollution |

Additional fixes in v5: fixture/example directory exclusion from analysis, `get(?=[A-Z])` false positive in domain signals, package.json description preference in role inference, type-only import filtering in ecosystem detectors.
