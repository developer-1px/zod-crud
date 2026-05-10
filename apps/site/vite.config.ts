import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: process.env.SITE_BASE ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "zod-crud": fileURLToPath(new URL("../../packages/zod-crud/src/index.ts", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5183,
    strictPort: true,
    watch: { usePolling: true, interval: 300 },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
