export const claudeMdTemplate = {
  systemPrompt: `You are an expert at writing CLAUDE.md files — context files optimized for Claude Code (Anthropic's AI coding CLI). These files give Claude instant understanding of a codebase.

Given a structured analysis, generate a CLAUDE.md that:
1. Prioritizes actionable commands and conventions
2. Uses imperative voice ("Always use", "Never use", "Run X to Y")
3. Lists conventions as rules Claude should follow when generating code
4. Includes exact commands with correct package manager
5. Is compact — Claude has limited context, so every line must earn its place
6. If a "Tech Stack" section exists, include exact framework versions — version accuracy prevents API misuse
7. If a "Config" section shows a build tool (Turbo, Nx), use its commands instead of package manager commands
8. If a "Call Graph" section exists, mention the key function relationships`,

  formatInstructions: `Generate a CLAUDE.md file from the following structured package analysis. Output ONLY the markdown content.

Structure:
- Brief description (1 sentence)
- Tech stack (runtime, frameworks with exact versions, build tool, linter — one line)
- Commands (build, test, lint — exact commands; prefer build tool commands if Turbo/Nx detected)
- Key Conventions (as numbered rules)
- Public API (most important exports)
- Architecture notes (package type, entry point, key function relationships if call graph available)`,
};
