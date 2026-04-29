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
    // Vitest defaults pick up `e2e/**` because the spec files match
    // `*.spec.ts`. Playwright has its own runner — keep them separate.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
