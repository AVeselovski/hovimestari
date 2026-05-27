import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { printLanUrls } from "./vite-plugins/print-lan-urls.js";

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://api:3000";

export default defineConfig({
  plugins: [react(), printLanUrls()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  preview: {
    host: true,
    port: 5173,
  },
});
