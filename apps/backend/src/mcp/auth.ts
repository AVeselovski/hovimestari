import { requireBearerAuth } from "@modelcontextprotocol/express";
import { OAuthError, OAuthErrorCode, type AuthInfo } from "@modelcontextprotocol/server";
import type { RequestHandler, Response } from "express";
import { lookupConnectionKey, type ConnectionLookup, type ResolvedConnection } from "../lib/connectionKeys.js";
import { failureOf } from "../lib/failureOf.js";

// ---------------------------------------------------------------------------
// The bearer verifier for /mcp (design d.2), lifted from finanssiappisV2's
// mcp/auth.ts. A vault there is the key's user here.
//
// One query per request (lib/connectionKeys.ts), by hash, joined to the
// key's user for the time zone. Each stateless HTTP request is one MCP call,
// so revocation and expiry are checked on every tool call. The presented key
// never goes into an error or a log line.
//
// A key this server issued that has since expired or been revoked is refused
// with its reason, and the gate marks it on the response: the refused-key
// brakes in router.ts count guesses, and a stale client is not guessing.
//
// A lookup that fails (the database is down or slow) is logged here, as the
// app's error handler logs an unexpected error, and rethrown. The SDK then
// answers 500 server_error, which no brake counts, and the key is not marked.
// ---------------------------------------------------------------------------

/**
 * What the server factory and every tool read from `AuthInfo.extra`. A type
 * alias, not an interface, so it is assignable to that `Record<string, unknown>`.
 */
export type ConnectionAuthExtra = {
  connectionId: string;
  /** The key's name at this call. A write copies it onto the change's record. */
  connectionName: string;
  userId: string;
  access: ResolvedConnection["access"];
  /** ISO 8601 UTC. */
  expiresAt: string;
  /** The user's stored time zone, for `contextForUser`. */
  timeZone: string;
};

export type DeadKeyState = "revoked" | "expired";

/** The `error_description` of each refusal, in the 401 body and its `WWW-Authenticate` challenge. */
const REFUSALS: Record<Exclude<ConnectionLookup["state"], "active">, string> = {
  unknown: "Invalid or expired token.",
  expired: "This key has expired. Create a new one in Settings.",
  revoked: "This key was revoked.",
};

/** Where the gate marks a known but dead key on the response. */
const DEAD_KEY = "mcpDeadKey";
/** Where the gate marks a live key whose use is due to be recorded. */
const TOUCH_DUE = "mcpTouchDue";

export interface VerifyHooks {
  /** A key this server issued that has been revoked or has expired. */
  onDeadKey?: (state: DeadKeyState) => void;
  /** A live key whose last use is due to be recorded (`touchDue`). */
  onTouchDue?: () => void;
}

/**
 * Resolves a presented key to AuthInfo pinned to its user, or throws
 * invalid_token saying why. A known key that is revoked or expired is
 * reported through `onDeadKey` first. `token` holds the connection id, so
 * the plaintext key goes no further than this function.
 */
export async function verifyConnectionKey(key: string, hooks: VerifyHooks = {}): Promise<AuthInfo> {
  const found = await lookupConnectionKey(key).catch((err: unknown) => {
    console.error("[mcp] key lookup failed:", failureOf(err));
    throw err;
  });
  if (found.state !== "active") {
    if (found.state !== "unknown") hooks.onDeadKey?.(found.state);
    throw new OAuthError(OAuthErrorCode.InvalidToken, REFUSALS[found.state]);
  }

  const { connection } = found;
  if (connection.touchDue) hooks.onTouchDue?.();
  const extra: ConnectionAuthExtra = {
    connectionId: connection.id,
    connectionName: connection.name,
    userId: connection.userId,
    access: connection.access,
    expiresAt: connection.expiresAt.toISOString(),
    timeZone: connection.timeZone,
  };
  return {
    token: connection.id,
    clientId: connection.id,
    scopes: connection.access === "read" ? ["data:read"] : ["data:read", "data:write"],
    expiresAt: Math.floor(connection.expiresAt.getTime() / 1000),
    extra,
  };
}

/**
 * The bearer gate for /mcp: the SDK's `requireBearerAuth`, which builds the
 * 401 and its challenge from the verifier's OAuthError. The verifier is bound
 * to the response so a known but dead key, and a use due to be recorded, are
 * marked on it.
 */
export const requireConnectionKey: RequestHandler = (req, res, next) =>
  requireBearerAuth({
    verifier: {
      verifyAccessToken: (key) =>
        verifyConnectionKey(key, {
          onDeadKey: (state) => {
            res.locals[DEAD_KEY] = state;
          },
          onTouchDue: () => {
            res.locals[TOUCH_DUE] = true;
          },
        }),
    },
  })(req, res, next);

/** True when the gate refused a key this server issued that has expired or been revoked. */
export function refusedDeadKey(res: Response): boolean {
  return res.locals[DEAD_KEY] !== undefined;
}

/** True when the gate let a live key through whose last use is due to be recorded. */
export function touchDue(res: Response): boolean {
  return res.locals[TOUCH_DUE] === true;
}

/** The connection a verified request is pinned to. Throws if the verifier did not run. */
export function connectionAuthOf(authInfo: AuthInfo | undefined): ConnectionAuthExtra {
  const extra = authInfo?.extra as ConnectionAuthExtra | undefined;
  if (!extra?.connectionId || !extra.userId)
    throw new Error("MCP request reached the server without a connection key.");
  return extra;
}
