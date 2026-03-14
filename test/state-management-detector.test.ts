import { describe, expect, it } from "vitest";
import { stateManagementDetector } from "../src/detectors/state-management.js";
import { createImport, createParsedFile, createTiers } from "./helpers/fixtures.js";

describe("state-management detector", () => {
  // ─── Single library detection ──────────────────────────────────────────────

  it("detects Zustand from imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/stores/user.ts",
        imports: [createImport({ moduleSpecifier: "zustand", importedNames: ["create"] })],
      }),
      createParsedFile({
        relativePath: "src/stores/cart.ts",
        imports: [createImport({ moduleSpecifier: "zustand", importedNames: ["create"] })],
      }),
      createParsedFile({ relativePath: "src/utils.ts" }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toContain("Zustand");
    expect(result[0].category).toBe("state-management");
    expect(result[0].confidence.matched).toBe(2);
  });

  it("detects Redux Toolkit", () => {
    const files = [
      createParsedFile({
        relativePath: "src/store/index.ts",
        imports: [createImport({ moduleSpecifier: "@reduxjs/toolkit", importedNames: ["configureStore"] })],
      }),
      createParsedFile({
        relativePath: "src/features/user.ts",
        imports: [createImport({ moduleSpecifier: "react-redux", importedNames: ["useSelector", "useDispatch"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toContain("Redux");
  });

  it("detects Jotai", () => {
    const files = [
      createParsedFile({
        relativePath: "src/atoms.ts",
        imports: [createImport({ moduleSpecifier: "jotai", importedNames: ["atom"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toContain("Jotai");
  });

  it("detects MobX", () => {
    const files = [
      createParsedFile({
        relativePath: "src/store.ts",
        imports: [createImport({ moduleSpecifier: "mobx", importedNames: ["makeAutoObservable"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toContain("MobX");
  });

  it("detects XState", () => {
    const files = [
      createParsedFile({
        relativePath: "src/machines/auth.ts",
        imports: [createImport({ moduleSpecifier: "xstate", importedNames: ["createMachine"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toContain("XState");
  });

  it("detects Preact Signals", () => {
    const files = [
      createParsedFile({
        relativePath: "src/state.ts",
        imports: [createImport({ moduleSpecifier: "@preact/signals", importedNames: ["signal"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toContain("Signals");
  });

  it("detects Valtio", () => {
    const files = [
      createParsedFile({
        relativePath: "src/proxy.ts",
        imports: [createImport({ moduleSpecifier: "valtio", importedNames: ["proxy"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toContain("Valtio");
  });

  // ─── Context API detection ─────────────────────────────────────────────────

  it("detects React Context API via createContext import", () => {
    const files = [
      createParsedFile({
        relativePath: "src/context/theme.ts",
        imports: [createImport({ moduleSpecifier: "react", importedNames: ["createContext", "useContext"] })],
      }),
      createParsedFile({
        relativePath: "src/context/auth.ts",
        imports: [createImport({ moduleSpecifier: "react", importedNames: ["createContext"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toContain("Context API");
    expect(result[0].confidence.matched).toBe(2);
  });

  it("does not detect Context API from useContext alone (without createContext)", () => {
    const files = [
      createParsedFile({
        relativePath: "src/component.ts",
        imports: [createImport({ moduleSpecifier: "react", importedNames: ["useContext"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(0);
  });

  // ─── Multiple libraries (dominant + supplementary) ─────────────────────────

  it("reports all detected libraries with dominant + supplementary", () => {
    const files = [
      // Zustand: 1 file
      createParsedFile({
        relativePath: "src/store.ts",
        imports: [createImport({ moduleSpecifier: "zustand", importedNames: ["create"] })],
      }),
      // Context: 3 files (dominant)
      createParsedFile({
        relativePath: "src/ctx/theme.ts",
        imports: [createImport({ moduleSpecifier: "react", importedNames: ["createContext"] })],
      }),
      createParsedFile({
        relativePath: "src/ctx/auth.ts",
        imports: [createImport({ moduleSpecifier: "react", importedNames: ["createContext"] })],
      }),
      createParsedFile({
        relativePath: "src/ctx/locale.ts",
        imports: [createImport({ moduleSpecifier: "react", importedNames: ["createContext"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(1);
    // Context is dominant (3 files vs 1)
    expect(result[0].name).toContain("Context API");
    expect(result[0].name).toContain("1 more");
    // Description lists both
    expect(result[0].description).toContain("React Context API");
    expect(result[0].description).toContain("Zustand");
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────

  it("returns empty for no state management imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/utils.ts",
        imports: [createImport({ moduleSpecifier: "lodash", importedNames: ["map"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(0);
  });

  it("returns empty for empty files", () => {
    const result = stateManagementDetector([], new Map(), []);
    expect(result).toHaveLength(0);
  });

  it("ignores type-only imports", () => {
    const files = [
      createParsedFile({
        relativePath: "src/types.ts",
        imports: [createImport({ moduleSpecifier: "zustand", importedNames: ["StoreApi"], isTypeOnly: true })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(0);
  });

  it("skips T3 test files", () => {
    const files = [
      createParsedFile({
        relativePath: "test/store.test.ts",
        imports: [createImport({ moduleSpecifier: "zustand", importedNames: ["create"] })],
        isTestFile: true,
      }),
    ];
    const tiers = createTiers(files, 3);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(0);
  });

  it("counts each file once even with multiple imports from same library", () => {
    const files = [
      createParsedFile({
        relativePath: "src/store.ts",
        imports: [
          createImport({ moduleSpecifier: "zustand", importedNames: ["create"] }),
          createImport({ moduleSpecifier: "zustand/middleware", importedNames: ["persist"] }),
        ],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(1);
    // File counted once, not twice
    expect(result[0].confidence.matched).toBe(1);
  });

  it("detects subpath imports (e.g., zustand/middleware)", () => {
    const files = [
      createParsedFile({
        relativePath: "src/store.ts",
        imports: [createImport({ moduleSpecifier: "zustand/middleware", importedNames: ["persist"] })],
      }),
    ];
    const tiers = createTiers(files);
    const result = stateManagementDetector(files, tiers, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toContain("Zustand");
  });
});
