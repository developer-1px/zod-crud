import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { jsonDocumentSourceAliases } from "../../config/json-document-source-aliases.ts";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: jsonDocumentSourceAliases({ officialExtensions: true }),
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
