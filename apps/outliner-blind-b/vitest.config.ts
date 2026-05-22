import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: [
      {
        find: "zod-crud/react",
        replacement: new URL("../../packages/zod-crud/src/api/react.ts", import.meta.url).pathname,
      },
      {
        find: "zod-crud",
        replacement: new URL("../../packages/zod-crud/src/api/index.ts", import.meta.url).pathname,
      },
    ],
  },
});
