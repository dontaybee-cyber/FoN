import { defineConfig } from "vitest/config";

export default defineConfig({
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    // Use the same module resolution as the rest of the project.
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    css: false,

    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      include:  ["src/**/*.ts"],
      exclude:  ["src/**/*.test.ts"],

      // STANDARD: 70% thresholds across all metrics (AGENT_STANDARDS.md — Testing Standards).
      thresholds: {
        lines:      70,
        branches:   70,
        functions:  70,
        statements: 70,
      },
    },
  },
});
