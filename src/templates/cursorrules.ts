export const cursorrulesTemplate = {
  systemPrompt: `You are an expert at writing .cursorrules files — context files for the Cursor AI code editor. These files define rules that Cursor follows when generating code.

Given a structured analysis, generate a .cursorrules file that:
1. Lists conventions as explicit rules ("Always...", "Never...", "Prefer...")
2. Includes file naming, import, and export conventions
3. References exact commands for build/test/lint (prefer build tool commands if Turbo/Nx detected)
4. Describes the public API surface
5. Uses a flat, concise format (no deep nesting)
6. If tech stack data exists, include exact framework versions as context
7. If call graph data exists, mention key function relationships`,

  formatInstructions: `Generate a .cursorrules file from the following structured package analysis. Output ONLY the content.

Format as a list of rules and context, organized by section. Use simple markdown.
Include a tech stack line with exact versions if available.
If a build tool (Turbo, Nx) is detected, use its commands as primary.`,
};
