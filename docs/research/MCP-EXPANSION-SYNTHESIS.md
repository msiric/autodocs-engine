# MCP Expansion Synthesis: 5-Model Adversarial Review

**Models:** Gemini, Opus, Grok, GPT-4, MiniMax/GLM
**Date:** 2026-02-24

## Unanimous Agreement (All 5 Models)

### 1. CUT `get_file_context`
Every model independently said to cut or merge this. It duplicates `analyze_impact` + individual tools, violates "less is more," and creates routing confusion between three overlapping tools. If needed, add a `detail` flag to `analyze_impact` instead.

### 2. Simplify `plan_change` — files-only input, no NLP
Every model flagged keyword extraction from natural language as brittle and unnecessary. The AI already identifies which files to edit — let it do what it's good at. The tool should take concrete files and return what the AI *can't figure out*: co-change partners, registration files, barrel updates, test files, blast radius.

### 3. Improve existing tools FIRST, new tools SECOND
All 5 models prioritized the 4 small improvements (~95 lines total) over any new tool. Quick wins, immediate ROI, zero routing risk.

### 4. `plan_change` is the hero product
Every model identified this as the unique capability and the "wow" moment. Git co-change + registration patterns is data the AI literally cannot get any other way. This is the tool that would make a developer write a blog post.

### 5. Stay at 9-10 tools, not 12
Unanimous: adding tools increases routing confusion. Consolidate and merge rather than expand.

## Strong Consensus (4-5 Models)

### 6. Keep `get_test_command`, rename to `get_test_info`
The value is the test file MAPPING, not just the command. "Which test file corresponds to this source file?" is the hard part.

### 7. Merge `get_examples` into `get_exports`
Rather than a standalone tool, add a `topExample` field and `parameterShape` to get_exports responses. Same data, one fewer tool to route to.

### 8. Every response needs freshness metadata
`analyzedAt`, `snapshotCommit`, `isFresh` on every tool response.

### 9. Every response should start with a one-line summary
Before detailed data, a natural language summary: "Medium blast radius — 8 direct importers, 3 co-change partners."

## The "Wow" Moment (All Models Converged)

> "I made a change to our auth system. The tool told me I needed to update 5 files I'd completely forgotten about: the barrel export, the registration file, the test, and two co-dependent files that always change together. It caught a bug before I even ran tests."

This is `plan_change`. The hook: **catching mistakes the developer didn't know they were making** — implicit coupling that only exists in git history and project conventions.

## Notable New Ideas From Reviews

| Idea | Source | Value | Effort |
|------|--------|-------|--------|
| `check_registration(filePath)` — is this file registered where it needs to be? | GLM | High — catches #1 "doesn't work" bug | Small (~40 lines) |
| `get_dependency_path(fileA, fileB)` — BFS traversal showing how two files are connected | Opus | High for debugging — "why did this break?" | Small (~60 lines) |
| `get_recent_changes(directory?, days?)` — what changed recently that could affect this? | Opus, Grok | Medium for debugging | Small (~70 lines) |
| `interpret_test_failure(stdout, stderr)` — map failing test to implicated source files | GPT | High for debugging workflow | Medium (~120 lines) |
| Session memory — learn project-specific workflow patterns over time | Grok, MiniMax | High differentiation, viral potential | Large |
| `resolve_symbol(name, file)` — get type definition without reading whole file | Gemini | Medium — block-level precision | Medium |
| Proactive hints in responses — "while you're here, you might want to know..." | MiniMax | Low-cost value add | Small |
| `validate_conventions(files[])` — pre-commit convention check | Gemini | Medium — linter for agents | Medium |

## Revised Roadmap

### Phase 1: Quick Wins (1-2 days) → v0.5.1

Four improvements to existing tools (~95 lines total):

| Change | Lines | Impact |
|--------|-------|--------|
| `analyze_impact` + blast radius summary + one-line summary | ~25 | Immediate UX win |
| `get_conventions` + confidence percentages | ~15 | AI can weight rule importance |
| `get_contribution_guide` + inline example code (15 lines of exampleFile) | ~30 | Show don't tell |
| `get_exports` + topExample + parameterShape (merges `get_examples` data) | ~30 | Eliminates hallucinated arguments |

Plus: Add `analyzedAt` + `isFresh` freshness metadata to all tool responses.

### Phase 2: Core New Tools (3-5 days) → v0.6.0

| Tool | Input | Returns | Lines | Unique Value |
|------|-------|---------|-------|-------------|
| `plan_change(files)` | File paths (required) | Dependents, co-change partners, registration/barrel files, test files, blast radius, checklist | ~150 | **The differentiator. No alternative.** |
| `get_test_info(filePath)` | File path | Test file path, exact command, framework, co-located or separate | ~60 | Test file mapping is the hard part |

**Tool count after Phase 2: 10** (8 existing + 2 new, `get_examples` merged into `get_exports`)

### Phase 3: High-Value Additions (1-2 weeks, driven by usage data) → v0.7.0

| Tool | Trigger to Build |
|------|-----------------|
| `check_registration(filePath)` | If `plan_change` usage shows registration misses are common |
| `get_dependency_path(fileA, fileB)` | If users report "why did this break?" as a pain point |
| `get_recent_changes(dir?, days?)` | If debugging workflows are a common use case |

### Phase 4: Future (based on user feedback)

| Direction | Signal to Invest |
|-----------|-----------------|
| Session memory / workflow learning | If users have repo-specific patterns `plan_change` misses |
| `interpret_test_failure` | If test debugging is a top user request |
| NLP task routing for `plan_change` | If file-path-only input feels limiting after real usage |
| Cross-repo intelligence | If enterprise users request multi-repo support |

## Key Design Decisions

### Response Format (All Tools)

```typescript
{
  summary: string;           // One-line natural language summary (always first)
  // ... tool-specific data ...
  _meta: {
    analyzedAt: string;      // ISO timestamp
    analyzedCommit: string;  // Git SHA
    isFresh: boolean;        // True if no files changed since analysis
  }
}
```

### Response Sizing: The "3-5-15" Rule (Opus)

- ≤ 3 top-level sections per response
- ≤ 5 items per list (with `truncated: true` if more exist)
- ≤ 15 lines per code snippet

### `plan_change` MVP Schema

```typescript
plan_change({
  files: string[];           // Required — files being edited
  packagePath?: string;
})
→ {
  summary: "Medium blast radius: 8 direct importers, 3 co-change partners, 2 registration points.",
  blastRadius: "small" | "medium" | "large",
  affected: [
    { path: string, reason: "importer" | "co-change" | "registration" | "test",
      source: "import-graph" | "git-history" | "contribution-pattern",
      confidence: "high" | "medium",
      detail: string }       // e.g., "Jaccard 0.45 — changed together in 8/12 commits"
  ],
  checklist: string[],       // Ordered steps: "1. Update barrel src/index.ts"
  testCommands: [{ file: string, command: string }],
  _meta: { analyzedAt, analyzedCommit, isFresh }
}
```

### What to NOT Build (YAGNI)

- NLP task parsing for `plan_change` (the AI handles this better)
- `get_file_context` composite tool (merge into `analyze_impact` if needed)
- `get_examples` as standalone tool (merge into `get_exports`)
- Proactive context injection (MCP is pull-based; add hints to existing responses instead)
- Cross-repo intelligence (wait for enterprise user signal)

## The Competitive Moat (In Priority Order)

1. **Git co-change analysis** — No other MCP server has this. Files that historically change together but don't import each other. This is invisible to code analysis.
2. **Contribution patterns** — "How to add new code" recipes with registration requirements. Hardest to replicate, most valuable for AI agents.
3. **Convention detection with confidence** — Not just "what are the rules" but "how confident are we, and should the AI follow strictly or loosely?"

Everything else (call graphs, import chains, directory analysis) is table stakes that competitors also provide. Double down on the top 3.
