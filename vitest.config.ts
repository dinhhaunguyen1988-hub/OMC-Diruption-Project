import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Scope coverage to the pure-logic packages we ship to the engine.
      // App routes / React components are covered by Playwright E2E and
      // visual review; including them here would just add noisy zeros.
      include: [
        "src/lib/engine/**",
        "src/lib/parsers/**",
        "src/lib/decoders/**",
        "src/lib/env.ts",
      ],
      exclude: [
        "**/__tests__/**",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
      // Baseline thresholds — ratchet up in follow-up sprints once
      // candidate-finder + notam.ts decoder gain negative-path tests.
      // Current actuals (Sprint 9): lines 80%, stmts 77%, funcs 85%, branches 58%.
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 55,
      },
    },
  },
});
