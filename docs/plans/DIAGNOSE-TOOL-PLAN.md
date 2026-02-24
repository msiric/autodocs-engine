# Implementation Plan: `diagnose` MCP Tool

## Context

When a test fails or an error occurs, AI coding tools (Claude Code, Cursor, Copilot) have no structural understanding of WHY. They read the error message, open the failing file, and guess at a fix. This creates "death spirals" where the AI fixes one thing, breaks another, and loops.

Our engine has data that no AI tool currently uses for diagnosis: import graphs, call graphs, git co-change history with timestamps, and workflow rules. The `diagnose` tool combines these into a ranked "suspect list" that tells the AI WHERE to look, not just WHAT broke.

**Research validation:**
- PRAXIS paper (arxiv 2512.22113): Graph traversal for RCA improves accuracy 3.8x over naive approaches
- Cursor's Debug Mode: Separating diagnosis from fix generation is the key design insight
- No existing MCP server provides static-analysis-based debugging context

## What It Does

**Input:** Error text (test failure output, stack trace, error message) + optional file path
**Output:** Ranked list of suspect files with reasoning, recent changes, co-change context, and test commands

Three modes, auto-detected from input:
1. **Test failure:** Parse test output → trace test's imports → find recently-changed dependencies
2. **Stack trace error:** Parse stack frames → trace call chain backward → find root cause
3. **File-level error:** Given a file with errors → find its dependencies and recent changes

## Data Available (85% exists, 15% needs small additions)

| Data | Source | Available? |
|------|--------|-----------|
| Import graph (who imports what) | `pkg.importChain` | ✅ Yes |
| Co-change history + timestamps | `pkg.gitHistory.coChangeEdges` | ✅ Yes |
| Call graph (function → function) | `pkg.callGraph` | ✅ Yes |
| Workflow rules (expected cascading changes) | `crossPackage.workflowRules` | ✅ Yes |
| Test file resolution + commands | `resolveTestFile()` | ✅ Yes |
| Recent commits per file | `git log -n 5 -- <file>` | ⚠️ Needs live git query |
| Stack trace parsing | Regex extraction | ⚠️ Needs ~20 lines |

## Tool Input Schema

```typescript
{
  errorText?: string;    // Raw test output or error message (parse stack traces from this)
  filePath?: string;     // Specific file with the error (if known)
  testFile?: string;     // Failing test file (if known)
  packagePath?: string;
}
```

At least one of `errorText`, `filePath`, or `testFile` must be provided.

## Tool Output Structure

```markdown
## Diagnosis

**Error site:** `src/pipeline.ts:142` (function: `processStage`)
**Likely root cause:** Recent change to `src/types.ts` (2 hours ago)

### Suspect Files (ranked by likelihood)
1. `src/types.ts` — changed 2 hours ago, imports 8 symbols used by pipeline.ts
   Co-change score: 40% with pipeline.ts (frequently modified together)
2. `src/import-chain.ts` — changed 5 hours ago, direct dependency of pipeline.ts
3. `src/convention-extractor.ts` — co-changes with types.ts 60% of the time

### Dependency Chain (test → error)
test/pipeline.test.ts → src/pipeline.ts → src/types.ts (recently changed)

### Also At Risk
These tests may also fail: test/import-chain.test.ts, test/analysis-builder.test.ts

### Suggested Actions
1. Check recent changes to `src/types.ts`: `git diff HEAD~3 -- src/types.ts`
2. Run related tests: `npx vitest run test/pipeline.test.ts test/import-chain.test.ts`
```

## Implementation

### New query functions in `src/mcp/queries.ts`

**1. `parseErrorText(errorText): ParsedError`** (~30 lines)

```typescript
interface ParsedError {
  stackFrames: { file: string; line?: number; function?: string }[];
  errorMessage: string;
  testFile?: string;
}
```

Regex-based parsing. No dependencies needed:
- Stack frame: `/at\s+(?:(.+?)\s+\()?(.+):(\d+):(\d+)\)?/`
- Filter to project files (exclude node_modules, vitest internals)
- Extract test file from Vitest `FAIL` header if present

**2. `getRecentCommits(rootDir, filePath, count): RecentCommit[]`** (~25 lines)

```typescript
interface RecentCommit {
  hash: string;
  message: string;
  timestamp: number;
  hoursAgo: number;
}
```

Runs `git log --pretty="%H|%s|%at" -n ${count} -- ${filePath}` via `execFileSync`. Fast (~100ms per file). Returns structured commit data with recency.

**3. `buildSuspectList(analysis, errorFiles, rootDir): Suspect[]`** (~80 lines)

This is the core diagnostic logic. For each file in the error chain:
1. Get importers via `getImportersForFile()`
2. Get co-change partners via `getCoChangesForFile()`
3. Get recent commits via `getRecentCommits()`
4. Score each candidate:

```
score = recencyWeight * (1 / hoursAgo) * 40
      + couplingWeight * jaccard * 30
      + dependencyWeight * (symbolCount / 10) * 20
      + workflowWeight * (matchesWorkflowRule ? 1 : 0) * 10
```

5. Sort by score descending, return top 5

**4. `traceImportChain(analysis, from, to): string[]`** (~30 lines)

BFS on import graph to find the shortest path between two files. Returns the chain: `["test/x.test.ts", "src/x.ts", "src/types.ts"]`. Uses existing `importChain` data.

### New tool handler in `src/mcp/tools.ts`

**`handleDiagnose(analysis, args)`** (~100 lines)

```typescript
export function handleDiagnose(
  analysis: StructuredAnalysis,
  args: { errorText?: string; filePath?: string; testFile?: string; packagePath?: string },
): ToolResult
```

Logic:
1. Parse error text (if provided) → extract stack frames + test file
2. Determine error files: from stack frames, filePath arg, or testFile's imports
3. Build suspect list using `buildSuspectList()`
4. Trace import chain from test to error site (if both known)
5. Find at-risk tests (files that import from suspect files)
6. Generate suggested actions (git diff commands, test commands)
7. Format as markdown

### Server registration in `src/mcp/server.ts`

```typescript
server.tool(
  "diagnose",
  `Diagnose why a test is failing or an error is occurring. Traces backward through
the dependency graph, cross-references with recent git changes and co-change history,
and returns a ranked list of suspect files with reasoning.

WHEN TO CALL:
- When a test fails and you need to understand WHY, not just WHERE
- When an error occurs and the fix isn't obvious from the error message alone
- When you want to know what else might break from the same root cause

DO NOT CALL:
- For syntax errors (the error message is sufficient)
- When you already know exactly which file to fix`,
  {
    errorText: z.string().optional().describe("Raw test output or error message (stack traces will be parsed)"),
    filePath: z.string().optional().describe("File where the error occurs"),
    testFile: z.string().optional().describe("Failing test file path"),
    packagePath: z.string().optional().describe("Package path or name"),
  },
  handler
);
```

## Files to Modify

| File | Changes | Lines |
|------|---------|-------|
| `src/mcp/queries.ts` | `parseErrorText`, `getRecentCommits`, `buildSuspectList`, `traceImportChain` | +165 |
| `src/mcp/tools.ts` | `handleDiagnose` | +100 |
| `src/mcp/server.ts` | Register diagnose tool | +20 |
| `test/diagnose.test.ts` | Tests | +150 |
| `README.md` | Update tool count (12 → 13) and table | +3 |
| `CHANGELOG.md` | Add entry | +5 |

**Total: ~445 lines of new code.**

## Implementation Order

1. `queries.ts` — `parseErrorText()` (stack trace parser)
2. `queries.ts` — `getRecentCommits()` (live git query)
3. `queries.ts` — `traceImportChain()` (BFS path finding)
4. `queries.ts` — `buildSuspectList()` (scoring engine)
5. `tools.ts` — `handleDiagnose()` (format + compose)
6. `server.ts` — Register tool
7. `test/diagnose.test.ts` — Tests
8. README + CHANGELOG — Update docs
9. Build, typecheck, test, publish

## Design Principles

- **Diagnosis, not fix.** The tool tells the AI WHERE to look. The AI decides WHAT to fix.
- **Score, don't guess.** Every suspect file has a numerical score with a clear rationale.
- **Fresh git data.** Recent commits are queried live (not cached) because recency matters.
- **No dependencies.** Stack trace parsing via inline regex. Git queries via execFileSync.
- **Response cap.** Top 5 suspects, top 3 at-risk tests. Short and actionable.

## Verification

1. `npx tsc --noEmit` — zero type errors
2. `npx vitest run` — all tests pass
3. Manual test on our own repo:
   - Feed a real test failure from vitest output into diagnose
   - Verify it traces the dependency chain correctly
   - Verify it identifies recently-changed files
4. Manual test on nitro:
   - Feed a hypothetical error in src/types/config.ts
   - Verify it finds the 5 dependent files and suggests correct tests
