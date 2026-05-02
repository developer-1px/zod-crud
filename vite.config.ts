import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "demo",
  plugins: [react()],
  build: {
    outDir: "../dist-demo",
    emptyOutDir: true,
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
});
