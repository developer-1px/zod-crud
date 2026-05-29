import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { zodCrudSourceAliases } from "../../config/zod-crud-source-aliases.ts";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: zodCrudSourceAliases({
      officialExtensions: ["proposed-changes"],
    }),
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
  },
});
