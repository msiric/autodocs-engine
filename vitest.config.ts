import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/fixtures/**"],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/benchmark/**", "src/bin/**"],
    },
  },
});
