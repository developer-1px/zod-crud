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
        replacement: new URL("../../packages/zod-crud/src/react.ts", import.meta.url).pathname,
      },
      {
        find: "zod-crud",
        replacement: new URL("../../packages/zod-crud/src/index.ts", import.meta.url).pathname,
      },
    ],
  },
});
