import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import siteRoutes from "./src/site-routes.json";

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

function productionSiteAssets(): Plugin {
  const siteUrl = (process.env.SITE_URL ?? "https://developer-1px.github.io/zod-crud").replace(/\/$/, "");
  const routePages = siteRoutes;

  return {
    name: "production-site-assets",
    writeBundle(options) {
      if (options.dir) {
        const indexPath = join(options.dir, "index.html");
        const indexHtml = readFileSync(indexPath, "utf8");
        copyFileSync(indexPath, join(options.dir, "404.html"));

        for (const route of routePages) {
          if (route.path === "/") continue;
          const routeDir = join(options.dir, route.path.slice(1));
          mkdirSync(routeDir, { recursive: true });
          writeFileSync(join(routeDir, "index.html"), routeHtml(indexHtml, route));
        }
      }
    },
    generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (index?.type === "asset" && typeof index.source === "string") {
        this.emitFile({
          type: "asset",
          fileName: "404.html",
          source: index.source,
        });
      }

      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: [
          "User-agent: *",
          "Allow: /",
          "",
          `Sitemap: ${siteUrl}/sitemap.xml`,
          "",
        ].join("\n"),
      });

      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...routePages.map((route) => {
            const loc = route.path === "/" ? `${siteUrl}/` : `${siteUrl}${route.path}`;
            return `  <url><loc>${loc}</loc></url>`;
          }),
          "</urlset>",
          "",
        ].join("\n"),
      });
    },
  };

  function routeHtml(indexHtml: string, route: { path: string; title: string }): string {
    const url = `${siteUrl}${route.path}`;
    return indexHtml
      .replace(/<title>.*?<\/title>/, `<title>${route.title}</title>`)
      .replace(/(<meta property="og:title" content=")[^"]*(" \/>)/, `$1${route.title}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(" \/>)/, `$1${url}$2`)
      .replace(/(<link rel="canonical" href=")[^"]*(" \/>)/, `$1${url}$2`);
  }
}

export default defineConfig({
  base: process.env.SITE_BASE ?? "/",
  plugins: [react(), rootLlmsTxt(), productionSiteAssets()],
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
          if (id.includes("/packages/zod-crud/src/")) return "zod-crud";
          if (id.includes("/apps/outliner/src/")) return "playground-outliner";
          if (id.includes("/apps/mobile-cms/src/")) return "playground-mobile-cms";
          if (id.includes("/apps/api-collection/src/")) return "playground-api-collection";
        },
      },
    },
  },
});
