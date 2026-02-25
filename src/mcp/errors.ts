// src/mcp/errors.ts — Typed error handling for MCP tools

export class ToolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly hints: string[] = [],
  ) {
    super(message);
    this.name = "ToolError";
  }
}

/**
 * Wraps a tool handler with error catching.
 * Async-safe: awaits the promise to catch async rejections.
 */
export async function safeToolHandler(
  fn: () => Promise<{ content: { type: "text"; text: string }[] }>,
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  try {
    return await fn();
  } catch (err) {
    const msg =
      err instanceof ToolError
        ? `${err.code}: ${err.message}\n\nHints:\n${err.hints.map((h) => `- ${h}`).join("\n")}`
        : `Internal error: ${err instanceof Error ? err.message : String(err)}`;
    return { content: [{ type: "text", text: msg }], isError: true };
  }
}
