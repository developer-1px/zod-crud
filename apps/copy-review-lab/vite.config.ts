import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@zod-crud/search-replace",
        replacement: fileURLToPath(new URL("../../labs/extensions/search-replace/src/index.ts", import.meta.url)),
      },
      {
        find: "zod-crud/react",
        replacement: fileURLToPath(new URL("../../packages/zod-crud/src/react.ts", import.meta.url)),
      },
      {
        find: "zod-crud",
        replacement: fileURLToPath(new URL("../../packages/zod-crud/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
  },
});
