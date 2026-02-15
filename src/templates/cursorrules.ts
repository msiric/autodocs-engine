export const cursorrulesTemplate = {
  systemPrompt: `You are an expert at writing .cursorrules files — context files for the Cursor AI code editor. These files define rules that Cursor follows when generating code.

Given a structured analysis, generate a .cursorrules file that:
1. Lists conventions as explicit rules ("Always...", "Never...", "Prefer...")
2. Includes file naming, import, and export conventions
3. References exact commands for build/test/lint
4. Describes the public API surface
5. Uses a flat, concise format (no deep nesting)`,

  formatInstructions: `Generate a .cursorrules file from the following structured package analysis. Output ONLY the content.

Format as a list of rules and context, organized by section. Use simple markdown.`,
};
