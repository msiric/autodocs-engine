// src/command-extractor.ts — Module 6: Command Extractor
// Errata applied: E-29 (auto-detect monorepo root)

import { existsSync, readFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import type { CommandSet, Command, Warning } from "./types.js";

const CATEGORY_PATTERNS: Record<string, string[]> = {
  build: ["build", "compile", "transpile"],
  test: ["test:unit", "test", "jest", "vitest"],
  lint: ["lint", "eslint"],
  start: ["start", "dev", "serve"],
};

const OTHER_PATTERNS: Record<string, string[]> = {
  typecheck: ["typecheck", "type-check", "tsc"],
  format: ["format", "prettier"],
};

/**
 * Extract build/test/lint/start commands from package.json scripts.
 */
export function extractCommands(
  packageDir: string,
  rootDir?: string,
  warnings: Warning[] = [],
): CommandSet {
  const absPackageDir = resolve(packageDir);

  // E-29: Auto-detect monorepo root if not provided
  const resolvedRoot = rootDir ? resolve(rootDir) : autoDetectRoot(absPackageDir);

  const pm = detectPackageManager(resolvedRoot ?? absPackageDir);
  const pkgScripts = readScripts(absPackageDir);
  const rootScripts = resolvedRoot && resolvedRoot !== absPackageDir
    ? readScripts(resolvedRoot)
    : {};

  const commands: CommandSet = {
    packageManager: pm,
    other: [],
  };

  // Map primary categories
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    const cmd = resolveCommand(
      category,
      patterns,
      pkgScripts,
      rootScripts,
      pm,
      absPackageDir,
    );
    if (cmd) {
      (commands as any)[category] = cmd;
    }
  }

  // Map "other" categories
  for (const [category, patterns] of Object.entries(OTHER_PATTERNS)) {
    const cmd = resolveCommand(
      category,
      patterns,
      pkgScripts,
      rootScripts,
      pm,
      absPackageDir,
    );
    if (cmd) {
      commands.other.push(cmd);
    }
  }

  return commands;
}

function resolveCommand(
  category: string,
  patterns: string[],
  pkgScripts: Record<string, string>,
  rootScripts: Record<string, string>,
  pm: CommandSet["packageManager"],
  packageDir: string,
): Command | undefined {
  const pkgMatch = findScript(pkgScripts, patterns);
  const rootMatch = findScript(rootScripts, patterns);

  if (rootMatch && pkgMatch && pkgScripts[pkgMatch]?.includes("../")) {
    // Package delegates to root → root is primary
    const cmd: Command = {
      run: formatRun(pm, rootMatch),
      source: `root package.json scripts.${rootMatch}`,
    };
    cmd.variants = [{ name: "package-level", run: formatRun(pm, pkgMatch) }];
    addVariants(cmd, rootMatch, rootScripts, pm);
    return cmd;
  } else if (pkgMatch) {
    const cmd: Command = {
      run: formatRun(pm, pkgMatch),
      source: `package.json scripts.${pkgMatch}`,
    };
    addVariants(cmd, pkgMatch, pkgScripts, pm);
    return cmd;
  } else if (rootMatch) {
    const cmd: Command = {
      run: formatRun(pm, rootMatch),
      source: `root package.json scripts.${rootMatch}`,
    };
    addVariants(cmd, rootMatch, rootScripts, pm);
    return cmd;
  }

  return undefined;
}

function detectPackageManager(dir: string): CommandSet["packageManager"] {
  if (existsSync(join(dir, "bun.lockb"))) return "bun";
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  if (existsSync(join(dir, "package-lock.json"))) return "npm";

  // Check packageManager field
  try {
    const pkgJson = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf-8"),
    );
    if (typeof pkgJson.packageManager === "string") {
      if (pkgJson.packageManager.startsWith("yarn")) return "yarn";
      if (pkgJson.packageManager.startsWith("pnpm")) return "pnpm";
      if (pkgJson.packageManager.startsWith("bun")) return "bun";
    }
  } catch {
    // No package.json
  }

  return "npm";
}

function readScripts(dir: string): Record<string, string> {
  try {
    const pkgJson = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf-8"),
    );
    return pkgJson.scripts ?? {};
  } catch {
    return {};
  }
}

function findScript(
  scripts: Record<string, string>,
  patterns: string[],
): string | undefined {
  for (const pattern of patterns) {
    if (pattern in scripts) return pattern;
  }
  return undefined;
}

function formatRun(pm: CommandSet["packageManager"], script: string): string {
  switch (pm) {
    case "yarn":
      return `yarn ${script}`;
    case "pnpm":
      return `pnpm ${script}`;
    case "bun":
      return `bun run ${script}`;
    case "npm":
    default:
      return `npm run ${script}`;
  }
}

function addVariants(
  cmd: Command,
  primary: string,
  scripts: Record<string, string>,
  pm: CommandSet["packageManager"],
): void {
  const prefix = primary + ":";
  const variants: Command["variants"] = cmd.variants ?? [];
  for (const key of Object.keys(scripts)) {
    if (key.startsWith(prefix) && key !== primary) {
      const suffix = key.slice(prefix.length);
      variants.push({ name: suffix, run: formatRun(pm, key) });
    }
  }
  if (variants.length > 0) cmd.variants = variants;
}

/**
 * E-29: Walk up from packageDir looking for monorepo root.
 */
function autoDetectRoot(packageDir: string): string | undefined {
  let dir = dirname(packageDir);
  const root = resolve("/");
  while (dir !== root) {
    try {
      const pkgJsonPath = join(dir, "package.json");
      if (existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
        if (pkgJson.workspaces) return dir;
      }
      if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    } catch {
      // Skip
    }
    dir = dirname(dir);
  }
  return undefined;
}
