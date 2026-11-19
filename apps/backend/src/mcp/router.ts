import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import express, { Router, type ErrorRequestHandler, type Router as IRouter, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { clientIp } from "../lib/clientIp.js";
import { touchLastUsed } from "../lib/connectionKeys.js";
import { failureOf } from "../lib/failureOf.js";
import { connectionAuthOf, refusedDeadKey, requireConnectionKey, touchDue } from "./auth.js";
import { buildServer } from "./server.js";

// ---------------------------------------------------------------------------
// /mcp (design d.2), lifted from finanssiappisV2's mcp/router.ts with its
// numbers. Mounted outside /api/v1, before the app's CORS and JSON
// middleware, so the REST stack never sees it and it never sends CORS headers.
//
// Order: refuse browsers, brake on refused keys per address, cap dead keys
// per address and key prefix, parse JSON (and answer a bad body), brake on
// refused keys per address and key prefix, bearer key, request limit per
// user, record use, the MCP handler.
// ---------------------------------------------------------------------------

/** Requests a user may make in a minute, shared by every key the user holds. */
export const REQUEST_LIMIT_PER_MINUTE = 120;
/** Budget of refused keys (401s, a known but dead key excepted) per address and key prefix in 15 minutes. */
export const AUTH_FAILURE_LIMIT = 30;
/** Budget of refused keys per address in 15 minutes, whatever key they carried. */
export const ADDRESS_FAILURE_LIMIT = 300;
/** Budget of a known key that has expired or been revoked, per address and key prefix in 15 minutes. */
export const DEAD_KEY_LIMIT = 300;
/**
 * How much of a presented key the brakes key on: `hovi_mcp_` (9) and 4
 * random characters, 24 bits, no secret. It lives only in limiter memory.
 */
export const KEY_DISPLAY_LENGTH = 13;

/**
 * The spec says a server MUST answer 403 to an Origin it does not accept. No
 * browser client is supported, so no Origin is accepted. This also closes DNS
 * rebinding: a rebound page's request carries Origin.
 */
const rejectBrowserOrigin: RequestHandler = (req, res, next) => {
  if (req.headers.origin !== undefined) {
    res.status(403).json({ error: "forbidden", error_description: "Browser requests are not accepted." });
    return;
  }
  next();
};

/**
 * The presented key's display prefix, or "none" without a bearer key. It
 * splits the brake's books per key, so an old key a client keeps retrying
 * cannot lock out a new one from the same computer.
 */
function presentedKeyPrefix(req: express.Request): string {
  const [type, key] = (req.headers.authorization ?? "").split(" ");
  return type?.toLowerCase() === "bearer" && key ? key.slice(0, KEY_DISPLAY_LENGTH) : "none";
}

// Only a refused key counts. A legacy client's normal connect answers 202 and
// 405 along the way, and a request limit 429 is that user's own business, so
// counting every 4xx would lock out every key behind one address. A known
// key that has expired or been revoked does not count either: the brake stops
// guessing, and a stale client retrying its old key on every launch is not
// guessing. A missing or unknown key still counts.
const refusalsOnly = {
  windowMs: 15 * 60 * 1000,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req: express.Request, res: express.Response) => res.statusCode !== 401 || refusedDeadKey(res),
  legacyHeaders: false,
  // The address is the Fly header or the socket address, never X-Forwarded-For.
  validate: { xForwardedForHeader: false },
  message: { error: "rate_limited", error_description: "Too many failed requests. Try again later." },
} as const;

// Module-level: one in-memory store per process for each limiter.

/**
 * The coarse ceiling: a client that rotates made-up keys gets a fresh prefix
 * every time, so the address as a whole has a budget too. It sends no
 * RateLimit headers, so the ones on a 401 are the per-key brake's.
 */
const addressFailureLimiter = rateLimit({
  ...refusalsOnly,
  limit: ADDRESS_FAILURE_LIMIT,
  standardHeaders: false,
  keyGenerator: clientIp,
});

/** The per-key brake's key: the address and the presented key's prefix. */
export const refusedKeyOf = (req: express.Request): string => `${clientIp(req)}|${presentedKeyPrefix(req)}`;

/**
 * The dead-key cap. A known key that has expired or been revoked is kept off
 * the refused-key books, since a stale client is not guessing, so it is
 * counted here instead with a budget no client retrying on launch comes near.
 * Without it a dead key could send unlimited requests, each costing a parse
 * and a lookup. Keyed like the per-key brake, so a capped old key never holds
 * up a new key on the same computer.
 */
const deadKeyLimiter = rateLimit({
  ...refusalsOnly,
  limit: DEAD_KEY_LIMIT,
  standardHeaders: false,
  keyGenerator: refusedKeyOf,
  requestWasSuccessful: (_req: express.Request, res: express.Response) =>
    !(res.statusCode === 401 && refusedDeadKey(res)),
  message: { error: "rate_limited", error_description: "This key no longer works. Create a new one in Settings." },
});

export const authFailureLimiter = rateLimit({
  ...refusalsOnly,
  limit: AUTH_FAILURE_LIMIT,
  standardHeaders: "draft-6",
  keyGenerator: refusedKeyOf,
});

/**
 * The request limit, keyed by the key's user, so every key one user holds
 * shares the 120. It runs after the bearer gate, which has found the user.
 */
const requestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: REQUEST_LIMIT_PER_MINUTE,
  standardHeaders: "draft-6",
  legacyHeaders: false,
  keyGenerator: (req) => `user:${connectionAuthOf(req.auth).userId}`,
  validate: { xForwardedForHeader: false },
  message: { error: "rate_limited", error_description: "Too many requests. Try again in a minute." },
});

/**
 * Body-parser failures, answered here rather than by the app's error handler,
 * which would answer 500 and log the raw body. Nothing from the body is logged.
 */
const bodyErrors: ErrorRequestHandler = (err: { type?: string }, _req, res, next) => {
  if (err.type === "entity.too.large") {
    res.status(413).json({ error: "payload_too_large", error_description: "The request body is over 100 kB." });
    return;
  }
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  next(err);
};

/**
 * Records the key's use when the lookup said it is due. `touchLastUsed` logs
 * and swallows its own failure; the catch here keeps that promise for any
 * failure it lets through, so recording a use never fails the call.
 */
const recordUse: RequestHandler = async (req, res, next) => {
  if (req.auth && touchDue(res)) {
    const { connectionId } = connectionAuthOf(req.auth);
    await touchLastUsed(connectionId).catch((err: unknown) => {
      console.error(`[mcp] last use not recorded for connection ${connectionId}:`, failureOf(err));
    });
  }
  next();
};

// Built once at module load: the SDK warns once at construction that json
// mode drops mid-call notifications. No tool emits any.
const handler = toNodeHandler(createMcpHandler(buildServer, { responseMode: "json" }));

export const mcpRouter: IRouter = Router();

mcpRouter.use(rejectBrowserOrigin);
mcpRouter.use(addressFailureLimiter);
mcpRouter.use(deadKeyLimiter);
mcpRouter.use(express.json({ limit: "100kb" }));
mcpRouter.use(bodyErrors);
// After the body: a request that never reaches the bearer gate opens no books
// for the key prefix it carried.
mcpRouter.use(authFailureLimiter);
mcpRouter.use(requireConnectionKey);
mcpRouter.use(requestLimiter);
mcpRouter.use(recordUse);
// `all`, not `post`: a legacy client's GET (standalone SSE) and DELETE reach
// the SDK and get its documented 405 rather than Express's HTML 404.
mcpRouter.all("/", (req, res) => {
  void handler(req, res, req.body);
});
