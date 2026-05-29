import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { labExtensionSourceAlias, zodCrudSourceAliases } from "../../config/zod-crud-source-aliases.ts";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: zodCrudSourceAliases({
      extra: [labExtensionSourceAlias("comments")],
    }),
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
  },
});
