import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { zodCrudSourceAliases } from "../../config/zod-crud-source-aliases.ts";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: zodCrudSourceAliases(),
  },
  server: {
    host: "127.0.0.1",
    port: 5184,
    strictPort: true,
  },
});
