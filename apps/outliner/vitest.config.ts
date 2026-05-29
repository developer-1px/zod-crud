import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { zodCrudSourceAliases } from "../../config/zod-crud-source-aliases.ts";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: zodCrudSourceAliases({ officialExtensions: true }),
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
    },
  },
});
