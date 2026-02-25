// src/llm-adapter.ts — Backward-compatible re-export barrel (W5-B1)
// The actual implementation is split into src/llm/*.ts modules.

export { formatDeterministic, formatWithLLM } from "./llm/adapter.js";
export { formatHierarchical, formatHierarchicalDeterministic, type HierarchicalOutput } from "./llm/hierarchical.js";
