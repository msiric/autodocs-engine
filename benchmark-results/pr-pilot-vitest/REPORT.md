# PR-Based Benchmark Report: vitest-bench
Generated: 2026-02-23T20:50:57.583Z | Model: claude-sonnet-4-20250514 | Mode: quick

> **Ground truth:** Real developer commits. Scoring: file placement accuracy.
> Tasks derived from git history, not engine-generated patterns.

## Headline

**AGENTS.md Delta (A - B):** 0%
**A wins:** 20% of tasks | **n =** 5

## Per-Condition Summary

| Condition | Mean Placement | Mean Naming | Mean Barrel | Mean Tokens |
|-----------|:---:|:---:|:---:|:---:|
| A: AGENTS.md + source | 80% | 80% | 80% | 6872 |
| B: Source only | 80% | 80% | 80% | 5337 |
| C: Dir listing only | 80% | 80% | 80% | 2427 |

## Per-Task Results

| # | Task | GT Path | A Placement | B Placement | C Placement | A-B |
|---|------|---------|:---:|:---:|:---:|:---:|
| 1 | feat(cli): add @bomb.sh/tab completions  | packages/vitest/src/node/cli/completions.ts | 0% | 100% | 100% | -100% |
| 2 | feat(browser): add `filterNode` option t | packages/pretty-format/src/plugins/DOMElementFilter.ts | 100% | 100% | 100% | 0% |
| 3 | feat: added chai style assertions (#8842 | packages/expect/src/chai-style-assertions.ts | 100% | 0% | 0% | +100% |
| 4 | feat(experimental): add `onModuleRunner` | packages/vitest/src/runtime/listeners.ts | 100% | 100% | 100% | 0% |
| 5 | fix: keep built-in id as is in bun and d | packages/vitest/src/utils/modules.ts | 100% | 100% | 100% | 0% |

## Methodology

- Tasks: 5 real "add file" commits from git history
- Commits scanned: 53
- After quality filter: 5
- Ground truth: actual files committed by developers (read at commit SHA)
- Context: sibling files and directory listings from parent commit
- Scoring: file placement accuracy (continuous path distance)
- Statistics: Wilcoxon signed-rank, bootstrap 95% CI, Cohen's d_z

### Filter Funnel

- too-many-files-changed: 1860
- skip-pattern: 65
- too-small: 7
- skip-filename: 1
