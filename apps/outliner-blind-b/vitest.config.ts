import { defineConfig } from "vitest/config";
import { zodCrudSourceAliases } from "../../config/zod-crud-source-aliases.ts";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: zodCrudSourceAliases(),
  },
});
