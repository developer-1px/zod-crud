import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "zod-crud": new URL("../zod-crud/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
