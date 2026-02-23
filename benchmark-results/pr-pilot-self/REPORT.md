# PR-Based Benchmark Report: autodocs-engine
Generated: 2026-02-23T20:33:49.370Z | Model: claude-sonnet-4-20250514 | Mode: quick

> **Ground truth:** Real developer commits. Scoring: file placement accuracy.
> Tasks derived from git history, not engine-generated patterns.

## Headline

**AGENTS.md Delta (A - B):** 0%
**A wins:** 0% of tasks | **n =** 2

## Per-Condition Summary

| Condition | Mean Placement | Mean Naming | Mean Barrel | Mean Tokens |
|-----------|:---:|:---:|:---:|:---:|
| A: AGENTS.md + source | 100% | 100% | 50% | 10381 |
| B: Source only | 100% | 100% | 0% | 8673 |
| C: Dir listing only | 0% | 0% | 0% | 4615 |

## Per-Task Results

| # | Task | GT Path | A Placement | B Placement | C Placement | A-B |
|---|------|---------|:---:|:---:|:---:|:---:|
| 1 | feat: inferability score + directory anc | src/inferability.ts | 100% | 100% | 0% | 0% |
| 2 | feat: git history co-change analysis | src/git-history.ts | 100% | 100% | 0% | 0% |

## Methodology

- Tasks: 2 real "add file" commits from git history
- Commits scanned: 19
- After quality filter: 4
- Ground truth: actual files committed by developers (read at commit SHA)
- Context: sibling files and directory listings from parent commit
- Scoring: file placement accuracy (continuous path distance)
- Statistics: Wilcoxon signed-rank, bootstrap 95% CI, Cohen's d_z

### Filter Funnel

- too-many-files-changed: 124
- skip-pattern: 7
- too-few-siblings: 2
