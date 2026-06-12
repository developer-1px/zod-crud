import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { labExtensionSourceAlias, jsonDocumentSourceAliases } from "../../config/json-document-source-aliases.ts";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: jsonDocumentSourceAliases({
      extra: [labExtensionSourceAlias("grouping")],
    }),
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
  },
});
