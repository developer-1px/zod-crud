import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "zod-crud/react": new URL("./src/react.ts", import.meta.url).pathname,
      "zod-crud": new URL("./src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
