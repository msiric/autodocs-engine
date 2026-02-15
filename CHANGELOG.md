# Changelog

## 0.1.0 (2026-02-15)

Initial release.

### Features
- TypeScript/JavaScript codebase analysis via AST parsing (no type checker needed)
- Convention detection with confidence metrics (18+ conventions across 9 categories)
- Command extraction from package.json (supports npm, yarn, pnpm, bun)
- Package role inference from exports and dependencies
- Tier classification (Public API / Internal / Generated noise)
- Anti-pattern derivation from convention data
- Contribution pattern detection (how to add new code)
- Rule impact classification (high/medium/low)
- Instruction budget validator
- Hierarchical output for monorepos (root + per-package files)
- Output formats: JSON, AGENTS.md, CLAUDE.md, .cursorrules
- Library API: `analyze()` and `format()` / `formatAsHierarchy()`

### Tested Against
- zod (42K ⭐) — 8.5/10
- hono (29K ⭐) — 9.5/10
- react-hook-form (42K ⭐) — 8.5/10
- changesets (9K ⭐) — 7.5/10
- shadcn/ui (85K ⭐) — 7.5/10
