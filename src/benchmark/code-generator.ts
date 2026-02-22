// src/benchmark/code-generator.ts — Generate code via LLM for benchmark conditions
// Builds fair prompts for treatment (A), realistic control (B),
// impoverished control (C), and negative control (N).

import type { ResolvedConfig } from "../types.js";
import { callLLMWithRetry } from "../llm/client.js";
import type { BenchmarkTask, BenchmarkCondition, GeneratedFile } from "./types.js";

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CodeGenResult {
  files: GeneratedFile[];
  tokensUsed: number;
  latencyMs: number;
  error?: string;
}

/**
 * Generate code for a benchmark task under a specific condition.
 */
export async function generateCode(
  task: BenchmarkTask,
  condition: BenchmarkCondition,
  agentsMd: string | null,
  shuffledAgentsMd: string | null,
  llmConfig: ResolvedConfig["llm"],
): Promise<CodeGenResult> {
  const systemPrompt = buildSystemPrompt(task.packageName, task.taskType);
  const userPrompt = buildUserPrompt(task, condition, agentsMd, shuffledAgentsMd);

  const start = performance.now();
  try {
    const response = await callLLMWithRetry(systemPrompt, userPrompt, llmConfig);
    const latencyMs = Math.round(performance.now() - start);
    let files = parseCodeBlocks(response);
    // Rough token estimate: 1 token ≈ 4 chars
    const tokensUsed = Math.round((systemPrompt.length + userPrompt.length + response.length) / 4);

    // For Q&A tasks (command, architecture), the raw response IS the answer.
    // If no code blocks were parsed, wrap the full response as a virtual file.
    if (files.length === 0 && response.trim().length > 0) {
      files = [{ path: "__response__", content: response }];
    }

    return { files, tokensUsed, latencyMs };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      files: [],
      tokensUsed: 0,
      latencyMs: Math.round(performance.now() - start),
      error: `LLM call failed: ${msg}`,
    };
  }
}

// ─── Prompt Construction ─────────────────────────────────────────────────────

function buildSystemPrompt(packageName: string, taskType?: import("./types.js").TaskType): string {
  if (taskType === "command") {
    return [
      `You are an expert TypeScript developer working on the ${packageName} project.`,
      `Your task is to write a build/CI configuration using this project's exact commands.`,
      `Output the configuration file in a code block with filepath:`,
      "",
      "```filepath",
      "// file content here",
      "```",
      "",
      `Use the EXACT commands and package manager from this project. Do not guess or use defaults.`,
    ].join("\n");
  }

  if (taskType === "architecture") {
    return [
      `You are an expert TypeScript developer working on the ${packageName} project.`,
      `Your task is to determine where new code should be placed in this project's structure.`,
      `Respond with:`,
      `1. The directory path where the code should go`,
      `2. A brief justification (2-3 sentences) explaining why`,
      ``,
      `Be specific — use actual directory names from this project, not generic suggestions.`,
    ].join("\n");
  }

  return [
    `You are an expert TypeScript developer working on the ${packageName} project.`,
    `Your task is to add new code to this codebase.`,
    `For each file you create or modify, output it in this format:`,
    "",
    "```filepath",
    "// file content here",
    "```",
    "",
    `If you modify an existing file, output the COMPLETE modified file (all existing code plus your changes).`,
    `Include ALL files needed: implementation, tests, and any existing files that need updates.`,
    `Do not add explanations outside the code blocks.`,
  ].join("\n");
}

function buildUserPrompt(
  task: BenchmarkTask,
  condition: BenchmarkCondition,
  agentsMd: string | null,
  shuffledAgentsMd: string | null,
): string {
  const parts: string[] = [];

  // Shared context: registration and barrel files (ALL conditions get these)
  if (task.context.registrationFile) {
    parts.push(`<file path="${task.context.registrationFile.path}">`);
    parts.push(task.context.registrationFile.content);
    parts.push(`</file>`);
    parts.push("");
  }

  if (task.context.barrelFile) {
    parts.push(`<file path="${task.context.barrelFile.path}">`);
    parts.push(task.context.barrelFile.content);
    parts.push(`</file>`);
    parts.push("");
  }

  // Condition-specific context
  switch (condition) {
    case "treatment":
      // A: AGENTS.md + sibling files + dir listing
      if (agentsMd) {
        parts.push("<agents-md>");
        parts.push(agentsMd);
        parts.push("</agents-md>");
        parts.push("");
      }
      for (const sibling of task.context.siblingFiles) {
        parts.push(`<file path="${sibling.path}">`);
        parts.push(sibling.content);
        parts.push(`</file>`);
        parts.push("");
      }
      break;

    case "realistic-control":
      // B: sibling files + dir listing (no AGENTS.md)
      for (const sibling of task.context.siblingFiles) {
        parts.push(`<file path="${sibling.path}">`);
        parts.push(sibling.content);
        parts.push(`</file>`);
        parts.push("");
      }
      break;

    case "impoverished-control":
      // C: dir listing only (no siblings, no AGENTS.md)
      break;

    case "negative-control":
      // N: shuffled AGENTS.md + dir listing (no siblings)
      if (shuffledAgentsMd) {
        parts.push("<agents-md>");
        parts.push(shuffledAgentsMd);
        parts.push("</agents-md>");
        parts.push("");
      }
      break;
  }

  // Directory listing (all conditions)
  if (task.context.directoryListing.length > 0) {
    parts.push(`Directory listing of ${task.expectedDirectory}:`);
    for (const file of task.context.directoryListing.slice(0, 30)) {
      parts.push(`  ${file}`);
    }
    parts.push("");
  }

  // Task prompt
  parts.push(`Task: ${task.prompt}`);

  return parts.join("\n");
}

// ─── Code Block Parsing ──────────────────────────────────────────────────────

/**
 * Parse LLM response to extract generated files from code blocks.
 * Handles multiple format variants:
 * - ```filepath\ncontent```
 * - ```ts\n// filepath: path/to/file.ts\ncontent```
 * - ```typescript path/to/file.ts\ncontent```
 */
export function parseCodeBlocks(response: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  // Match fenced code blocks: ```[lang] [path]\n...\n```
  const blockRegex = /```([^\n]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(response)) !== null) {
    const header = match[1].trim();
    const body = match[2];

    let filepath = extractFilePath(header, body);
    if (!filepath) continue;

    // Normalize path
    filepath = filepath.replace(/\\/g, "/").replace(/^\.\//, "");

    files.push({ path: filepath, content: body.trimEnd() });
  }

  return files;
}

/**
 * Extract file path from code block header or first line of body.
 */
function extractFilePath(header: string, body: string): string | null {
  // Case 1: Header IS the filepath (e.g., ```src/foo.ts)
  if (header && looksLikeFilePath(header)) {
    return header;
  }

  // Case 2: Header is "lang filepath" (e.g., ```typescript src/foo.ts)
  if (header) {
    const parts = header.split(/\s+/);
    if (parts.length >= 2) {
      const maybePath = parts.slice(1).join(" ");
      if (looksLikeFilePath(maybePath)) return maybePath;
    }
  }

  // Case 3: First line of body is a filepath comment (e.g., // filepath: src/foo.ts)
  const firstLine = body.split("\n")[0]?.trim() ?? "";
  const commentMatch = firstLine.match(/^\/\/\s*(?:filepath:\s*)?(.+\.[a-z]{1,4})\s*$/i);
  if (commentMatch && looksLikeFilePath(commentMatch[1])) {
    return commentMatch[1];
  }

  // Case 4: First line IS a filepath (e.g., src/foo.ts)
  if (looksLikeFilePath(firstLine)) {
    return firstLine;
  }

  return null;
}

function looksLikeFilePath(s: string): boolean {
  // Must contain a dot, no spaces (spaces suggest "lang path" format), not a language name
  if (!s || !s.includes(".") || s.includes(" ")) return false;
  // Language names to reject
  const langs = new Set(["typescript", "ts", "tsx", "javascript", "js", "jsx", "json", "md", "yaml", "yml", "bash", "sh"]);
  if (langs.has(s.toLowerCase())) return false;
  // Must end with a file extension
  return /\.[a-z]{1,5}$/i.test(s);
}
