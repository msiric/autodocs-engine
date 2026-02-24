# Efficiency Measurement Plan

## Context

The 2601.20404 paper found focused AGENTS.md reduces runtime by 29% and tokens by 17%. We've built MCP tools that are even more focused (task-specific queries vs static file). But we haven't measured whether our tools actually reduce token usage or time-to-completion.

If we could show "AI with autodocs MCP uses 30% fewer tokens and completes tasks 25% faster" — that's the killer marketing metric.

## What to Measure

- **Total tokens consumed** (input + output) for a task with MCP vs without
- **Time to completion** (first prompt to final correct code)
- **Number of tool calls / iterations** needed
- **Whether the final code is correct** (convention-adherent, properly registered)

## Approach: Lightweight Telemetry (Not a Benchmark)

The MCP server already logs via `withTelemetry` in server.ts. Extend it to track:

### Per-Tool Call
- Tool name, latency, cache hit/miss (already tracked)
- **New:** Input token estimate (args size), output token estimate (response size)

### Per-Session (New)
- Session start/end timestamps
- Total tool calls per session
- Which tools were called (invocation frequency)
- Total tokens across all tool responses

### Storage
- Write to `.autodocs-telemetry.jsonl` (append-only, one JSON line per event)
- Opt-in only (respect privacy)
- No PII, no code content — just tool names, counts, sizes, timestamps

## Implementation

### Phase 1: Add Token Logging to withTelemetry (~20 lines)

In `server.ts`, the existing `withTelemetry` already tracks tool name, latency, and cache status. Add:

```typescript
const inputTokens = Math.round(JSON.stringify(args).length / 3.5);
const outputTokens = Math.round(result.content.map(c => c.text).join('').length / 3.5);
// Log to stderr (already happening) + optionally to telemetry file
```

### Phase 2: Session Aggregation (~40 lines)

Track cumulative stats per MCP server session:

```typescript
class SessionTelemetry {
  toolCalls: Map<string, number> = new Map();
  totalInputTokens: number = 0;
  totalOutputTokens: number = 0;
  startTime: number = Date.now();
}
```

### Phase 3: Report Generation (~30 lines)

At session end (SIGTERM/SIGINT), write summary to stderr:

```
[autodocs] Session summary: 14 tool calls, 2,340 input tokens, 4,120 output tokens, 42s duration
[autodocs] Most used: plan_change (4x), get_test_info (3x), diagnose (2x)
```

## What This Enables

1. **Internal dogfooding data:** We see which tools get used and which don't
2. **Marketing claim:** "Average session uses X fewer tokens with autodocs MCP"
3. **Optimization signal:** If a tool returns 2,000 tokens but users only need 200, we're wasting context
4. **Usage patterns:** Do users actually call review_changes? diagnose? Or just get_commands?

## Estimated Effort: ~90 lines, 1-2 hours

This is simple instrumentation, not a benchmark. No LLM calls, no ground truth, no scoring. Just counting.

## When to Build

After `diagnose` ships and we have real users. Telemetry without users is just logging to /dev/null.
