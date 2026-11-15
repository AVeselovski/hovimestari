import type { RequestHandler } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { env } from "../lib/env.js";
import { appError } from "../lib/errors.js";

/** The header the web server's route handlers present the relay secret in. */
export const BFF_SECRET_HEADER = "X-Bff-Secret";
/** The header that names the browser's address on a relayed call. */
export const CLIENT_IP_HEADER = "X-Client-Ip";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/**
 * Whether `presented` is the relay secret, or the previous one during a
 * rotation. Both sides are hashed first, so the compare always runs on equal
 * lengths and a wrong value of any length is refused without throwing.
 */
export function isRelaySecret(presented: string | undefined): boolean {
  if (!presented) return false;
  const given = digest(presented);
  return [env.BFF_SECRET, env.BFF_SECRET_PREVIOUS].some(
    (secret) => secret !== undefined && timingSafeEqual(given, digest(secret)),
  );
}

/**
 * Admits only the web app's route handlers: the routes that hand out a
 * refresh token answer nobody else, so no browser JavaScript ever holds one.
 * The secret also authenticates the client address the handler forwards,
 * which the rate limiters then key on (lib/clientIp.ts). A relayed call
 * without an address is refused in production, and one whose address is not
 * an IP address is refused everywhere, so relayed sign-ins never collapse onto
 * the web server's own address.
 */
export const requireBff: RequestHandler = (req, _res, next) => {
  if (!isRelaySecret(req.get(BFF_SECRET_HEADER))) throw appError("request_refused", 401);
  const address = req.get(CLIENT_IP_HEADER);
  if (address === undefined || address === "") {
    if (env.NODE_ENV === "production") throw appError("client_address_missing", 400);
    req.relay = {};
  } else {
    if (isIP(address) === 0) throw appError("client_address_invalid", 400);
    req.relay = { clientIp: address };
  }
  next();
};
