# Changelog

## 0.2.0 (2026-02-16)

### New Features
- **Config file analysis**: Detects turbo.json, biome.json, justfile, tsconfig settings, eslint/prettier configs, .env.example variables
- **Dependency versioning**: Extracts exact framework versions from package.json with version-specific guidance (e.g., "React 19 — use() hook available")
- **Lightweight call graph**: Tracks which exported functions call which other exported functions, enabling "change impact" descriptions
- **Existing docs awareness**: Detects README.md, AGENTS.md, CLAUDE.md presence. New `--merge` flag preserves human-written sections across regenerations
- **Wave 1 template updates**: Tech stack section with exact versions, call graph in architecture descriptions, build tool awareness in workflow rules

### Improvements
- Commands now correctly detect Turbo (`turbo run build` instead of `bun run build`)
- Biome detected as linter/formatter (not confused with ESLint/Prettier)
- Bun runtime version extracted from packageManager field
- TypeScript strict mode, target, and module settings extracted from tsconfig.json

### Bug Fixes
- Fixed TS 5.9 compatibility issue with ts.getModifiers() (canHaveModifiers guard)
- Generalized JSDoc example from @msteams reference to @scope/my-package-name

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
