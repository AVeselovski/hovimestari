import { CONNECTION_KEY_PREFIX, type ConnectionAccess } from "@hovimestari/types";
import { randomBytes } from "crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { assistantConnections, users } from "../db/schema/index.js";
import { failureOf } from "./failureOf.js";
import { hashToken } from "./jwt.js";

// Connection keys, lifted from finanssiappisV2's lib/accessTokens.ts.
//
// A key is `hovi_mcp_` + base64url(32 random bytes): 52 characters, 256 bits
// of entropy. Only its SHA-256 hex is stored, the same scheme as refresh
// tokens. A fast unsalted hash is right for a 256-bit random secret: there is
// no dictionary to attack, and bcrypt would cost a round per MCP call.
//
// Lookup is `WHERE key_hash = sha256(presented)`. Any timing difference in
// that index lookup is over the hash, which gives an attacker no way to build
// a matching plaintext, so no constant-time compare is needed.
//
// This file holds the key path's two queries, the way lib/users.ts holds
// findUser for the JWT path. Making, listing and revoking keys are services
// (services/reads/connections.ts, services/writes/connections.ts).

export interface GeneratedConnectionKey {
  /** The plaintext. Shown to the user once and never stored. */
  key: string;
  /** sha256(key) hex, the only form stored. */
  hash: string;
}

export function hashConnectionKey(key: string): string {
  return hashToken(key);
}

export function generateConnectionKey(): GeneratedConnectionKey {
  const key = CONNECTION_KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, hash: hashConnectionKey(key) };
}

/** A live key: whose it is, what it may do, and what a service context needs. */
export interface ResolvedConnection {
  id: string;
  userId: string;
  /** The key's name as the user gave it. */
  name: string;
  access: ConnectionAccess;
  expiresAt: Date;
  /** The user's stored time zone, for `contextForUser`. */
  timeZone: string;
  /**
   * Whether this use is due to be recorded: the key was never used, or last
   * used more than five minutes ago, on the database clock. The endpoint
   * calls `touchLastUsed` only when it is, so a busy key costs no write and
   * no second query on most requests.
   */
  touchDue: boolean;
}

/** Last use is recorded at most once per this window. */
const lastUseDue = or(
  isNull(assistantConnections.lastUsedAt),
  lt(assistantConnections.lastUsedAt, sql`now() - interval '5 minutes'`),
);

/**
 * What a presented key is: a live key, a key this server issued that has
 * since been revoked or has expired, or something it never issued. Only a
 * live key carries anything more. A key that is both revoked and expired is
 * revoked, the deliberate act. A deleted account's keys went with it by
 * cascade, so they are unknown.
 */
export type ConnectionLookup =
  { state: "active"; connection: ResolvedConnection } | { state: "revoked" | "expired" } | { state: "unknown" };

/**
 * Looks a presented key up by its hash, in one query joined to `users` for
 * the time zone, then tells a live key from a dead one by revoked_at and by
 * expiry on the database clock. The key is never logged or put in an error.
 */
export async function lookupConnectionKey(key: string): Promise<ConnectionLookup> {
  if (!key.startsWith(CONNECTION_KEY_PREFIX)) return { state: "unknown" };

  const rows = await db
    .select({
      id: assistantConnections.id,
      userId: assistantConnections.userId,
      name: assistantConnections.name,
      access: assistantConnections.access,
      expiresAt: assistantConnections.expiresAt,
      revokedAt: assistantConnections.revokedAt,
      expired: sql<boolean>`${assistantConnections.expiresAt} <= now()`,
      touchDue: sql<boolean>`${lastUseDue}`,
      timeZone: users.timeZone,
    })
    .from(assistantConnections)
    .innerJoin(users, eq(users.id, assistantConnections.userId))
    .where(eq(assistantConnections.keyHash, hashConnectionKey(key)))
    .limit(1);

  const row = rows[0];
  if (!row) return { state: "unknown" };
  if (row.revokedAt !== null) return { state: "revoked" };
  if (row.expired) return { state: "expired" };
  return {
    state: "active",
    connection: {
      id: row.id,
      userId: row.userId,
      name: row.name,
      access: row.access,
      expiresAt: row.expiresAt,
      timeZone: row.timeZone,
      touchDue: row.touchDue,
    },
  };
}

/**
 * Records a use of the key at 5-minute resolution. Call it when the lookup
 * said `touchDue`. The update repeats that condition, so two requests that
 * both saw a use due write once, and it matches no revoked key, so a revoke
 * landing between the lookup and this write records no use on it. A failure
 * is logged and swallowed: it must never fail the call that used the key.
 */
export async function touchLastUsed(connectionId: string): Promise<void> {
  try {
    await db
      .update(assistantConnections)
      .set({ lastUsedAt: sql`now()` })
      .where(and(eq(assistantConnections.id, connectionId), isNull(assistantConnections.revokedAt), lastUseDue));
  } catch (err) {
    console.error(`[connectionKeys] last_used_at update failed for connection ${connectionId}:`, failureOf(err));
  }
}
