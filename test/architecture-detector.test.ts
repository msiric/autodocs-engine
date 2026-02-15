import { describe, it, expect } from "vitest";
import { detectFilePattern } from "../src/architecture-detector.js";

describe("detectFilePattern", () => {
  it("detects use-{...} pattern from hook filenames", () => {
    const filenames = [
      "use-create-channel-page-tab.ts",
      "use-update-channel-page-tab.ts",
      "use-delete-channel-page-tab.ts",
      "use-channel-page-tab-data.ts",
    ];
    const pattern = detectFilePattern(filenames);
    expect(pattern).toBeTruthy();
    expect(pattern).toContain("use-");
    expect(pattern).toContain("{...}");
  });

  it("returns undefined for fewer than 3 non-index files", () => {
    const filenames = ["index.ts", "use-create.ts"];
    const pattern = detectFilePattern(filenames);
    expect(pattern).toBeUndefined();
  });

  it("handles mixed extensions and picks most common", () => {
    const filenames = [
      "use-a.tsx",
      "use-b.tsx",
      "use-c.tsx",
      "use-d.ts",
    ];
    const pattern = detectFilePattern(filenames);
    expect(pattern).toBeTruthy();
    expect(pattern).toContain("use-");
    expect(pattern).toContain(".tsx");
  });

  it("returns undefined when no common prefix/suffix is detected", () => {
    const filenames = [
      "alpha.ts",
      "bravo.ts",
      "charlie.ts",
    ];
    const pattern = detectFilePattern(filenames);
    // No common prefix of >=2 chars
    expect(pattern).toBeUndefined();
  });

  it("detects suffix pattern", () => {
    const filenames = [
      "create-tab-command.ts",
      "delete-tab-command.ts",
      "update-tab-command.ts",
    ];
    const pattern = detectFilePattern(filenames);
    expect(pattern).toBeTruthy();
    expect(pattern).toContain("-command");
  });

  it("skips index files in pattern detection", () => {
    const filenames = [
      "index.ts",
      "index.test.ts",
      "use-a.ts",
      "use-b.ts",
      "use-c.ts",
    ];
    const pattern = detectFilePattern(filenames);
    expect(pattern).toBeTruthy();
    expect(pattern).toContain("use-");
  });
});
