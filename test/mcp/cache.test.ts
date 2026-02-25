import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisCache } from "../../src/mcp/cache.js";

// Mock analyze() to avoid running the real pipeline
vi.mock("../../src/index.js", () => ({
  analyze: vi.fn().mockResolvedValue({
    meta: { engineVersion: "0.5.0", analyzedAt: "", rootDir: "/tmp", config: {}, timingMs: 100 },
    packages: [{ name: "test", files: { total: 10 }, commands: { packageManager: "npm", other: [] } }],
    warnings: [],
  }),
}));

// Mock execFileSync for git commands
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn().mockImplementation((_cmd: string, args: string[]) => {
    if (args[0] === "rev-parse" && args[1] === "HEAD") return "abc123\n";
    if (args[0] === "status" && args[1] === "--porcelain") return "\n";
    return "";
  }),
}));

import { execFileSync } from "node:child_process";
import { analyze } from "../../src/index.js";

const mockExec = vi.mocked(execFileSync);
const mockAnalyze = vi.mocked(analyze);

describe("AnalysisCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExec.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse") return "abc123\n";
      if (args[0] === "status") return "\n";
      return "";
    });
  });

  it("runs analysis on first call", async () => {
    const cache = new AnalysisCache("/tmp/test");
    const result = await cache.get();
    expect(result.packages).toHaveLength(1);
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
  });

  it("returns cached on second call with same git state", async () => {
    const cache = new AnalysisCache("/tmp/test");
    await cache.get();
    await cache.get();
    // Should only analyze once (cache hit)
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
  });

  it("invalidates when HEAD changes", async () => {
    const cache = new AnalysisCache("/tmp/test");
    await cache.get();

    // Change HEAD
    mockExec.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse") return "def456\n";
      if (args[0] === "status") return "\n";
      return "";
    });

    // Force TTL expiry
    await new Promise((r) => setTimeout(r, 350));
    await cache.get();
    expect(mockAnalyze).toHaveBeenCalledTimes(2);
  });

  it("invalidates when working tree becomes dirty", async () => {
    const cache = new AnalysisCache("/tmp/test");
    await cache.get();

    // Make dirty
    mockExec.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse") return "abc123\n";
      if (args[0] === "status") return "M src/types.ts\n";
      return "";
    });

    await new Promise((r) => setTimeout(r, 350));
    await cache.get();
    expect(mockAnalyze).toHaveBeenCalledTimes(2);
  });

  it("invalidates when different files are dirty", async () => {
    const cache = new AnalysisCache("/tmp/test");

    // First: types.ts dirty
    mockExec.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse") return "abc123\n";
      if (args[0] === "status") return "M src/types.ts\n";
      return "";
    });
    await cache.get();

    // Second: utils.ts also dirty (different status output → different hash)
    mockExec.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse") return "abc123\n";
      if (args[0] === "status") return "M src/types.ts\nM src/utils.ts\n";
      return "";
    });

    await new Promise((r) => setTimeout(r, 350));
    await cache.get();
    expect(mockAnalyze).toHaveBeenCalledTimes(2);
  });

  it("detects untracked files (no -uno flag)", async () => {
    const cache = new AnalysisCache("/tmp/test");
    await cache.get();

    // New untracked file
    mockExec.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse") return "abc123\n";
      if (args[0] === "status") return "?? src/newFile.ts\n";
      return "";
    });

    await new Promise((r) => setTimeout(r, 350));
    await cache.get();
    expect(mockAnalyze).toHaveBeenCalledTimes(2);
  });

  it("handles non-git repos with TTL fallback", async () => {
    // Git fails
    mockExec.mockImplementation(() => {
      throw new Error("not a git repo");
    });

    const cache = new AnalysisCache("/tmp/test");
    await cache.get();
    expect(mockAnalyze).toHaveBeenCalledTimes(1);

    // Second call within TTL → cache hit
    await cache.get();
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
  });

  it("prevents concurrent duplicate analyses (singleton promise)", async () => {
    const cache = new AnalysisCache("/tmp/test");

    // Fire 3 concurrent calls
    const [r1, r2, r3] = await Promise.all([cache.get(), cache.get(), cache.get()]);

    // All return same result, but analyze only called once
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
  });
});
