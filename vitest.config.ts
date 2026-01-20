import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    environmentMatchGlobs: [["server/**", "node"]],
    include: ["**/__tests__/**/*.test.ts?(x)", "**/*.test.ts?(x)"],
    exclude: ["node_modules", ".cache", "dist"],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
      "@": path.resolve(__dirname, "./client/src"),
    },
  },
});
