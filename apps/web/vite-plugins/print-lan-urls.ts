import type { Plugin, ViteDevServer } from "vite";
import type { AddressInfo } from "node:net";

const HOST_HOSTNAME = process.env.HOST_HOSTNAME?.trim() ?? "";
const HOST_LAN_IP = process.env.HOST_LAN_IP?.trim() ?? "";

function resolvePort(server: ViteDevServer): number {
  const cfgPort = server.config.server.port;
  if (typeof cfgPort === "number") return cfgPort;
  const addr = server.httpServer?.address();
  if (addr && typeof addr === "object") {
    return (addr as AddressInfo).port;
  }
  return 5173;
}

export function printLanUrls(): Plugin {
  return {
    name: "hovimestari:print-lan-urls",
    apply: "serve",
    configureServer(server) {
      if (!HOST_HOSTNAME && !HOST_LAN_IP) return;
      const httpServer = server.httpServer;
      if (!httpServer) return;
      httpServer.once("listening", () => {
        const port = resolvePort(server);
        const lines: string[] = [];
        if (HOST_HOSTNAME) {
          lines.push(`  Network: http://${HOST_HOSTNAME}.local:${port}/`);
        }
        if (HOST_LAN_IP) {
          lines.push(`  Network: http://${HOST_LAN_IP}:${port}/`);
        }
        for (const line of lines) {
          // eslint-disable-next-line no-console
          console.log(line);
        }
      });
    },
  };
}
