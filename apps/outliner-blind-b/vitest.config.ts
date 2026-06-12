import { defineConfig } from "vitest/config";
import { jsonDocumentSourceAliases } from "../../config/json-document-source-aliases.ts";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: jsonDocumentSourceAliases(),
  },
});
