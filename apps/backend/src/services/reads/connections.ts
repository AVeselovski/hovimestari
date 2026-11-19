import type { Connection, ConnectionList } from "@hovimestari/types";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { assistantConnections } from "../../db/schema/index.js";
import { env } from "../../lib/env.js";
import type { ReadContext } from "./context.js";

// The user's connections, as Settings lists them. A revoked connection is not
// listed. An expired one is, as expired, until the user removes it. Expiry is
// read on the database clock, the clock the key lookup reads it on.

/** The columns a connection is answered from. Never the key's hash. */
export const connectionColumns = {
  id: assistantConnections.id,
  name: assistantConnections.name,
  access: assistantConnections.access,
  expired: sql<boolean>`${assistantConnections.expiresAt} <= now()`,
  createdAt: assistantConnections.createdAt,
  expiresAt: assistantConnections.expiresAt,
  lastUsedAt: assistantConnections.lastUsedAt,
};

type ConnectionRow = {
  id: string;
  name: string;
  access: Connection["access"];
  expired: boolean;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
};

/** A stored connection as the API shows it. */
export const connectionOf = (row: ConnectionRow): Connection => ({
  id: row.id,
  name: row.name,
  access: row.access,
  status: row.expired ? "expired" : "active",
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
  lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
});

/**
 * What the server offers now, read from its switches on every call:
 * `connect` is MCP_ENABLED, `write` also needs MCP_WRITES_ENABLED.
 */
export function connectionAvailability(): ConnectionList["availability"] {
  return { connect: env.MCP_ENABLED, write: env.MCP_ENABLED && env.MCP_WRITES_ENABLED };
}

/** The user's connections not revoked, newest first, and what the server offers now. */
export async function listConnections(ctx: ReadContext): Promise<ConnectionList> {
  const rows = await ctx.db
    .select(connectionColumns)
    .from(assistantConnections)
    .where(and(eq(assistantConnections.userId, ctx.userId), isNull(assistantConnections.revokedAt)))
    .orderBy(desc(assistantConnections.createdAt), desc(assistantConnections.id));
  return { connections: rows.map(connectionOf), availability: connectionAvailability() };
}
