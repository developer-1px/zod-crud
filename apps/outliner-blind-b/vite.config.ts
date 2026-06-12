import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { jsonDocumentSourceAliases } from "../../config/json-document-source-aliases.ts";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: jsonDocumentSourceAliases(),
  },
  server: {
    host: "127.0.0.1",
    port: 5187,
    strictPort: true,
  },
});
