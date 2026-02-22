import { describe, it, expect } from "vitest";
import { scoreGeneratedOutput } from "../../src/benchmark/scorer.js";
import type { BenchmarkTask, GeneratedFile } from "../../src/benchmark/types.js";

function makeCommandTask(overrides: Partial<BenchmarkTask> = {}): BenchmarkTask {
  return {
    id: "command-ci",
    repoPath: "/tmp/test",
    packageName: "test-pkg",
    tier: "A",
    taskType: "command",
    prompt: "Write a CI workflow",
    conventions: [],
    antiPatterns: [],
    expectedDirectory: "",
    expectedFilePattern: "",
    maxScoringPoints: 8,
    context: { siblingFiles: [], directoryListing: [] },
    commandData: {
      expectedCommands: ["pnpm run build", "pnpm run test", "pnpm run lint"],
      packageManager: "pnpm",
      allCommandNames: ["build", "test", "lint"],
    },
    ...overrides,
  };
}

function makeArchTask(overrides: Partial<BenchmarkTask> = {}): BenchmarkTask {
  return {
    id: "arch-hooks",
    repoPath: "/tmp/test",
    packageName: "test-pkg",
    tier: "A",
    taskType: "architecture",
    prompt: "Where to add a hook?",
    conventions: [],
    antiPatterns: [],
    expectedDirectory: "src/hooks/",
    expectedFilePattern: "",
    maxScoringPoints: 8,
    context: { siblingFiles: [], directoryListing: [] },
    architectureData: {
      expectedDirectory: "src/hooks/",
      directoryPurpose: "Custom React hooks",
      alternatives: ["src/lib/hooks/"],
      allDirectories: ["src/hooks/", "src/components/", "src/utils/", "src/api/"],
    },
    ...overrides,
  };
}

// ─── Command Task Scoring ────────────────────────────────────────────────────

describe("command task scoring", () => {
  it("scores perfect command response", () => {
    const files: GeneratedFile[] = [{
      path: ".github/workflows/ci.yml",
      content: `name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm run build
      - run: pnpm run test
      - run: pnpm run lint`,
    }];

    const result = scoreGeneratedOutput(files, makeCommandTask(), 100, 100);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.passed).toBe(true);
  });

  it("penalizes wrong package manager", () => {
    const files: GeneratedFile[] = [{
      path: "ci.yml",
      content: "npm run build\nnpm run test\nnpm run lint",
    }];

    const result = scoreGeneratedOutput(files, makeCommandTask(), 100, 100);
    // Commands found but wrong PM
    const pmCheck = result.checks.find(c => c.name === "pm-consistency");
    expect(pmCheck?.score).toBeLessThan(pmCheck?.weight ?? 2);
  });

  it("detects missing commands", () => {
    const files: GeneratedFile[] = [{
      path: "ci.yml",
      content: "pnpm run build",
    }];

    const result = scoreGeneratedOutput(files, makeCommandTask(), 100, 100);
    const accuracyCheck = result.checks.find(c => c.name === "command-accuracy");
    expect(accuracyCheck?.score).toBeLessThan(4); // missing test + lint
  });

  it("handles empty response", () => {
    const result = scoreGeneratedOutput([], makeCommandTask(), 100, 100, "API error");
    expect(result.score).toBe(0);
    expect(result.error).toBeTruthy();
  });
});

// ─── Architecture Task Scoring ───────────────────────────────────────────────

describe("architecture task scoring", () => {
  it("scores correct directory identification", () => {
    const files: GeneratedFile[] = [{
      path: "response.txt",
      content: "The new hook should go in src/hooks/ because that's where all custom React hooks are organized in this project, following the existing convention.",
    }];

    const result = scoreGeneratedOutput(files, makeArchTask(), 100, 100);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.passed).toBe(true);
  });

  it("gives partial credit for acceptable alternative", () => {
    const files: GeneratedFile[] = [{
      path: "response.txt",
      content: "I would place the hook in src/shared/custom-hooks/ since that follows the project's library organization pattern.",
    }];

    // Use a task where alternatives don't match the expected dir name
    const task = makeArchTask({
      architectureData: {
        expectedDirectory: "src/hooks/",
        directoryPurpose: "Custom React hooks",
        alternatives: ["src/shared/custom-hooks/"],
        allDirectories: ["src/hooks/", "src/components/", "src/utils/"],
      },
    });

    const result = scoreGeneratedOutput(files, task, 100, 100);
    const dirCheck = result.checks.find(c => c.name === "correct-directory");
    expect(dirCheck?.score).toBeGreaterThan(0);
    expect(dirCheck?.score).toBeLessThan(4); // partial, not full
  });

  it("fails for wrong directory", () => {
    const files: GeneratedFile[] = [{
      path: "response.txt",
      content: "Put it in src/features/new-hook.ts",
    }];

    const result = scoreGeneratedOutput(files, makeArchTask(), 100, 100);
    const dirCheck = result.checks.find(c => c.name === "correct-directory");
    expect(dirCheck?.score).toBe(0);
  });

  it("rewards referencing project directory names", () => {
    const files: GeneratedFile[] = [{
      path: "response.txt",
      content: "The hook belongs in src/hooks/ alongside the existing hooks. The src/components/ directory is for UI, and src/utils/ for generic utilities.",
    }];

    const result = scoreGeneratedOutput(files, makeArchTask(), 100, 100);
    const dirsCheck = result.checks.find(c => c.name === "uses-project-dirs");
    expect(dirsCheck?.score).toBe(2); // mentions 3+ project dirs
  });

  it("rewards architectural reasoning", () => {
    const files: GeneratedFile[] = [{
      path: "response.txt",
      content: "I recommend src/hooks/ because this follows the existing separation of concerns pattern where hooks are isolated from components for reusability.",
    }];

    const result = scoreGeneratedOutput(files, makeArchTask(), 100, 100);
    const justCheck = result.checks.find(c => c.name === "justification-quality");
    expect(justCheck?.score).toBe(2);
  });

  it("handles empty response", () => {
    const files: GeneratedFile[] = [{ path: "response.txt", content: "" }];
    const result = scoreGeneratedOutput(files, makeArchTask(), 100, 100);
    expect(result.score).toBe(0);
  });
});
