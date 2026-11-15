import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import { env } from "./env.js";

let warnedMissingClientIp = false;

/**
 * The client's address as the rate limiters key it. Fly sets Fly-Client-IP to
 * the real client address. Anywhere else the header is caller-controlled, so
 * it is trusted in production only, and X-Forwarded-For never (the app sets no
 * `trust proxy`). If production ever sits behind a proxy that does not set it,
 * every client would share the proxy's address and one budget, so it says so
 * once. IPv6 addresses are grouped by their /56 network (`ipKeyGenerator`).
 */
export function clientIp(req: Request): string {
  const fly = env.NODE_ENV === "production" ? req.get("Fly-Client-IP") : undefined;
  if (env.NODE_ENV === "production" && fly === undefined && !warnedMissingClientIp) {
    warnedMissingClientIp = true;
    console.warn("rate limits: no Fly-Client-IP header in production; the limiters key on the socket address");
  }
  return ipKeyGenerator(fly ?? req.ip ?? "unknown");
}
