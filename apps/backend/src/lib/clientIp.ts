import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import { env } from "./env.js";

let warnedMissingClientIp = false;

/**
 * The client's address as the rate limiters key it. A call the web server
 * relayed, with a valid relay secret, names the browser's address in
 * X-Client-Ip (middleware/requireBff.ts), and that is the address. Any other
 * call is keyed as it arrives: Fly sets Fly-Client-IP to the real client
 * address, and anywhere else that header is caller-controlled, so it is
 * trusted in production only. X-Client-Ip without the secret, and
 * X-Forwarded-For always, are ignored (the app sets no `trust proxy`). If
 * production ever sits behind a proxy that does not set Fly-Client-IP, every
 * client would share the proxy's address and one budget, so it says so once.
 * IPv6 addresses are grouped by their /56 network (`ipKeyGenerator`).
 */
export function clientIp(req: Request): string {
  const relayed = req.relay?.clientIp;
  if (relayed) return ipKeyGenerator(relayed);
  const fly = env.NODE_ENV === "production" ? req.get("Fly-Client-IP") : undefined;
  if (env.NODE_ENV === "production" && fly === undefined && !warnedMissingClientIp) {
    warnedMissingClientIp = true;
    console.warn("rate limits: no Fly-Client-IP header in production; the limiters key on the socket address");
  }
  return ipKeyGenerator(fly ?? req.ip ?? "unknown");
}
