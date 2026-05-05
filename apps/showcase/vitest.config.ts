import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "zod-crud": fileURLToPath(new URL("../../packages/zod-crud/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
