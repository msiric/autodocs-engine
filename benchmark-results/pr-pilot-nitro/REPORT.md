# PR-Based Benchmark Report: nitro-bench
Generated: 2026-02-23T20:41:16.578Z | Model: claude-sonnet-4-20250514 | Mode: quick

> **Ground truth:** Real developer commits. Scoring: file placement accuracy.
> Tasks derived from git history, not engine-generated patterns.

## Headline

**AGENTS.md Delta (A - B):** -8.3%
**95% CI:** [-33.3%, 0%]
**Effect size:** -0.41 (small)
**p (Wilcoxon):** 1
**A wins:** 0% of tasks | **n =** 6

## Per-Condition Summary

| Condition | Mean Placement | Mean Naming | Mean Barrel | Mean Tokens |
|-----------|:---:|:---:|:---:|:---:|
| A: AGENTS.md + source | 91.7% | 100% | 100% | 4353 |
| B: Source only | 100% | 100% | 100% | 3332 |
| C: Dir listing only | 91.7% | 100% | 100% | 760 |

## Per-Task Results

| # | Task | GT Path | A Placement | B Placement | C Placement | A-B |
|---|------|---------|:---:|:---:|:---:|:---:|
| 1 | feat: `nitro deploy` command (#4042) | src/cli/commands/deploy.ts | 100% | 100% | 100% | 0% |
| 2 | feat: `nitro preview` (#4024) | src/cli/commands/preview.ts | 100% | 100% | 100% | 0% |
| 3 | feat: `nitro preview` (#4024) | src/preview.ts | 50% | 100% | 50% | -50% |
| 4 | presets(vercel): integrate with schedule | src/presets/vercel/runtime/cron-handler.ts | 100% | 100% | 100% | 0% |
| 5 | feat(cloudflare): support `exports.cloud | src/presets/cloudflare/entry-exports.ts | 100% | 100% | 100% | 0% |
| 6 | refactor: improve output chunk names (#3 | src/build/chunks.ts | 100% | 100% | 100% | 0% |

## Methodology

- Tasks: 6 real "add file" commits from git history
- Commits scanned: 29
- After quality filter: 6
- Ground truth: actual files committed by developers (read at commit SHA)
- Context: sibling files and directory listings from parent commit
- Scoring: file placement accuracy (continuous path distance)
- Statistics: Wilcoxon signed-rank, bootstrap 95% CI, Cohen's d_z

### Filter Funnel

- too-many-files-changed: 468
- skip-pattern: 14
- too-small: 7
- too-few-siblings: 3
