import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function rootLlmsTxt(): Plugin {
  const path = fileURLToPath(new URL("../../llms.txt", import.meta.url));

  return {
    name: "root-llms-txt",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/llms.txt") return next();
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(readFileSync(path, "utf8"));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "llms.txt",
        source: readFileSync(path, "utf8"),
      });
    },
  };
}

export default defineConfig({
  base: process.env.SITE_BASE ?? "/",
  plugins: [react(), rootLlmsTxt()],
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
  server: {
    host: "127.0.0.1",
    port: 5183,
    strictPort: true,
    watch: { usePolling: true, interval: 300 },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react";
          if (id.includes("node_modules/@tanstack")) return "router";
          if (id.includes("/packages/zod-crud/src/")) return "zod-crud";
          if (id.includes("/apps/outliner/src/")) return "playground-outliner";
          if (id.includes("/apps/mobile-cms/src/")) return "playground-mobile-cms";
          if (id.includes("/apps/api-collection/src/")) return "playground-api-collection";
          if (id.includes("/apps/site/src/routes/source-registry.ts")) return "package-sources";
        },
      },
    },
  },
});
