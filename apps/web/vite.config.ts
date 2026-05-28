import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { printLanUrls } from "./vite-plugins/print-lan-urls.js";

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://api:3000";

const hostHostname = process.env.HOST_HOSTNAME?.trim();
const hostLanIp = process.env.HOST_LAN_IP?.trim();

const lanAllowedHosts = [
  hostHostname ? `${hostHostname}.local` : undefined,
  hostHostname,
  hostLanIp,
].filter((h): h is string => Boolean(h));

export default defineConfig({
  plugins: [react(), printLanUrls()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ["localhost", "127.0.0.1", ...lanAllowedHosts],
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
