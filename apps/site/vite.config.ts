import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "zod-crud": fileURLToPath(new URL("../../packages/zod-crud/src/index.ts", import.meta.url)),
    },
  },
  server: { host: "127.0.0.1", port: 5183, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
