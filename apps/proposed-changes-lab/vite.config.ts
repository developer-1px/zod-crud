import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { jsonDocumentSourceAliases } from "../../config/json-document-source-aliases.ts";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: jsonDocumentSourceAliases({
      officialExtensions: ["proposed-changes"],
    }),
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
  },
});
