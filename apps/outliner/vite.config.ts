import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
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
  server: { host: "127.0.0.1", port: 5184, strictPort: true },
});
