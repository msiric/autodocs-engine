# autodocs-engine

Generate research-backed AGENTS.md files that AI coding tools actually follow.

[![npm version](https://img.shields.io/npm/v/autodocs-engine)](https://www.npmjs.com/package/autodocs-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/msiric/autodocs-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/msiric/autodocs-engine/actions)
[![Node.js](https://img.shields.io/node/v/autodocs-engine)](https://nodejs.org)

## Why

90% of engineering teams use AI coding tools. 65% say AI misses critical project context.

AGENTS.md files fix this — they tell AI tools your project's commands, conventions, and architecture up front. But today they're all hand-written, incomplete, and drift out of sync with the actual codebase.

autodocs-engine analyzes your TypeScript codebase and generates lean, prioritized context files. Based on [Vercel's research](https://vercel.com/blog/agents-md) showing that a single 8KB index file achieved 100% eval pass rates — outperforming detailed per-skill instructions — fewer, higher-quality rules beat comprehensive documentation.

## Quick Start

```bash
# JSON analysis (no API key needed, <1 second)
npx autodocs-engine analyze .

# Generate AGENTS.md (needs Anthropic API key)
ANTHROPIC_API_KEY=sk-... npx autodocs-engine analyze . --format agents.md
```

That's it. Zero config required.

## What It Produces

**Root AGENTS.md (~70 lines):**
- Exact build/test/lint commands detected from your config files — not guessed
- Architecture described as capabilities, not file paths
- Workflow rules AI tools reliably follow
- Domain terminology AI can't infer from code alone
- Package guide for monorepos (which package to touch for what task)

**Per-package detail files** with public API surface, contribution patterns, and conventions split by impact level — what AI should follow vs. what linters already enforce.

## How It Works

Unlike tools that dump raw code into an LLM prompt, autodocs-engine uses a 6-step pipeline:

1. **Analyze** — Parses your codebase with the TypeScript Compiler API (AST parsing, not type checking — fast even on large repos)
2. **Classify** — Categorizes every file as Public API, Internal, or Generated noise
3. **Detect** — Finds conventions with confidence metrics (e.g., "97% kebab-case filenames", "100% co-located tests")
4. **Extract** — Pulls exact commands from package.json, lockfiles, and config files. Detects turbo.json, biome.json, tsconfig settings, and more
5. **Infer** — Determines package roles from export patterns, dependency graphs, and exact framework versions (e.g., "React 19 — use() hook available")
6. **Graph** — Builds a lightweight call graph tracking which exported functions call which, enabling change-impact descriptions
7. **Generate** — Produces a lean AGENTS.md that respects the ~100-rule instruction budget

The LLM receives a 2–4K token structured summary — not 100K tokens of raw source code. Result: 92% fewer tokens, correct commands, 2x more conventions detected than hand-written files.

## Output Formats

| Format | Flag | Needs API Key? | Use Case |
|--------|------|---------------|----------|
| JSON | `--format json` (default) | No | CI pipelines, custom tooling |
| AGENTS.md | `--format agents.md` | Yes | Claude Code, Agentic tools |
| CLAUDE.md | `--format claude.md` | Yes | Claude Code (legacy format) |
| .cursorrules | `--format cursorrules` | Yes | Cursor IDE |

When `ANTHROPIC_API_KEY` is set and no `--format` is specified, defaults to `agents.md`.

## Multi-Package / Monorepo

```bash
npx autodocs-engine analyze packages/app packages/hooks packages/ui \
  --format agents.md --hierarchical --root .
```

Produces:
- **Root `AGENTS.md`** — Cross-package overview, dependency graph, shared conventions
- **Per-package detail files** — `packages/app/AGENTS.md`, `packages/hooks/AGENTS.md`, etc.

The root file stays lean (~70 lines). Package-specific detail lives in each package directory where AI tools discover it contextually.

## Tested On

| Repo | Stars | Files Analyzed | Score | Time |
|------|-------|---------------|-------|------|
| [zod](https://github.com/colinhacks/zod) | 42K | 278 | 8.5/10 | 276ms |
| [hono](https://github.com/honojs/hono) | 29K | 358 | 9.5/10 | 307ms |
| [react-hook-form](https://github.com/react-hook-form/react-hook-form) | 42K | 401 | 8.5/10 | 261ms |
| [changesets](https://github.com/changesets/changesets) | 9K | 36 | 7.5/10 | 69ms |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | 85K | 250 | 7.5/10 | 194ms |

Scores measure command accuracy, convention coverage, architecture clarity, and actionability (7.7/10 average across open-source benchmarks). Times are for the analysis step only (no LLM call).

## Configuration

Create an optional `autodocs.config.json` in your project root:

```json
{
  "exclude": ["**/vendor/**", "**/generated/**"],
  "maxPublicAPIEntries": 100,
  "conventions": {
    "disable": ["telemetry-patterns"]
  }
}
```

Most options are auto-detected. Zero config is the default and works well for the majority of projects.

## CLI Reference

```
autodocs-engine analyze [paths...] [options]

Options:
  --format, -f         json | agents.md | claude.md | cursorrules
  --output, -o         Output directory (default: .)
  --config, -c         Path to config file
  --root               Monorepo root (for root-level command extraction)
  --hierarchical       Root + per-package output (default for multi-package)
  --flat               Single file even for multi-package
  --verbose, -v        Timing and budget validation details
  --merge              Preserve human-written sections when regenerating
  --dry-run            Print analysis to stdout (no LLM, no file writes)
  --quiet, -q          Suppress warnings
```

## Library API

```typescript
import { analyze, format, formatAsHierarchy } from 'autodocs-engine';

// Step 1: Analyze (pure computation, no API key needed)
const analysis = await analyze({
  packages: ['./packages/my-pkg'],
  verbose: true,
});

// Step 2: Format as JSON (no API key)
const json = await format(analysis, {
  output: { format: 'json', dir: '.' },
  llm: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
});

// Step 2 (alt): Format as AGENTS.md (needs API key)
const agentsMd = await format(analysis, {
  output: { format: 'agents.md', dir: '.' },
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});

// Step 2 (alt): Hierarchical output for monorepos
const hierarchy = await formatAsHierarchy(analysis, {
  output: { format: 'agents.md', dir: './output' },
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});
// hierarchy.root — root AGENTS.md content
// hierarchy.packages — Map<packageName, content>
```

All types are exported:

```typescript
import type {
  StructuredAnalysis,
  PackageAnalysis,
  Convention,
  CommandSet,
  PublicAPIEntry,
  CrossPackageAnalysis,
} from 'autodocs-engine';
```

## Backed by Research

This tool's design is informed by real-world research on AI context files:

- **[Vercel: AGENTS.md](https://vercel.com/blog/agents-md)** — An 8KB index file achieved 100% pass rate in agent evals, outperforming detailed per-skill instructions
- **[HumanLayer: Instruction Budget](https://humanlayer.dev/blog/agents-md)** — LLMs follow ~100-200 rules reliably; beyond that, compliance drops
- **[Builder.io: What AI Actually Follows](https://www.builder.io/blog/cursor-tips)** — Commands and concrete patterns outperform style guidelines

The engine enforces these findings: lean output, prioritized by impact, within the instruction budget.

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/msiric/autodocs-engine.git
cd autodocs-engine
npm install
npm test          # Run all tests
npm run typecheck # Type check
npm run build     # Build
```

## License

[MIT](LICENSE)
