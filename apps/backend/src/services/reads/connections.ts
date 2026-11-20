import type { Connection, ConnectionList, PastConnection } from "@hovimestari/types";
import { and, count, desc, eq, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import { assistantChanges, assistantConnections } from "../../db/schema/index.js";
import { env } from "../../lib/env.js";
import type { ReadContext } from "./context.js";

// The user's connections, as Settings lists them. A revoked connection is not
// listed among them. An expired one is, as expired, until the user removes it.
// Expiry is read on the database clock, the clock the key lookup reads it on.
// Each carries how many changes its assistant made. A revoked connection that
// made changes is listed apart, as a past connection, so its record stays
// readable.

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

/** The ids of the user's connections, revoked ones included, as a subquery. */
const ownConnectionIds = (ctx: ReadContext, revoked?: "revoked") =>
  ctx.db
    .select({ id: assistantConnections.id })
    .from(assistantConnections)
    .where(
      and(eq(assistantConnections.userId, ctx.userId), revoked ? isNotNull(assistantConnections.revokedAt) : undefined),
    );

/**
 * How many changes each of `connectionIds` made, in one grouped query. A
 * connection with none is not in the map, and neither is another user's.
 * The scope goes through the user's connections rather than
 * `assistant_changes.user_id`, so the count is an index-only scan of
 * `assistant_changes_connection_idx` and reads no row of the table.
 */
export async function changeCount(ctx: ReadContext, connectionIds: string[]): Promise<Map<string, number>> {
  if (connectionIds.length === 0) return new Map();
  const rows = await ctx.db
    .select({ connectionId: assistantChanges.connectionId, n: count() })
    .from(assistantChanges)
    .where(
      and(
        inArray(assistantChanges.connectionId, connectionIds),
        inArray(assistantChanges.connectionId, ownConnectionIds(ctx)),
      ),
    )
    .groupBy(assistantChanges.connectionId);
  return new Map(rows.map((row) => [row.connectionId, row.n]));
}

/**
 * The user's revoked connections that made changes, newest change first. One
 * query: the count and the newest change come from an index-only scan of
 * `assistant_changes_connection_idx` per revoked connection.
 */
export async function listPastConnections(ctx: ReadContext): Promise<PastConnection[]> {
  const c = assistantConnections;
  const changes = ctx.db
    .select({
      connectionId: assistantChanges.connectionId,
      n: count().as("n"),
      // Drizzle's `max` of a column decodes through that column, so this reads back as a Date.
      lastChangeAt: max(assistantChanges.createdAt).as("last_change_at"),
    })
    .from(assistantChanges)
    .where(inArray(assistantChanges.connectionId, ownConnectionIds(ctx, "revoked")))
    .groupBy(assistantChanges.connectionId)
    .as("changes");
  const rows = await ctx.db
    .select({ id: c.id, name: c.name, n: changes.n, lastChangeAt: changes.lastChangeAt })
    .from(c)
    .innerJoin(changes, eq(changes.connectionId, c.id))
    .orderBy(desc(changes.lastChangeAt), desc(c.id));
  // Every group holds at least one change, so its newest is never null. The type cannot know that.
  return rows.flatMap((row) =>
    row.lastChangeAt === null
      ? []
      : [{ id: row.id, name: row.name, changeCount: row.n, lastChangeAt: row.lastChangeAt.toISOString() }],
  );
}

/**
 * The user's connections not revoked, newest first, each with its count of
 * changes, the past connections, and what the server offers now.
 */
export async function listConnections(ctx: ReadContext): Promise<ConnectionList> {
  const rows = await ctx.db
    .select(connectionColumns)
    .from(assistantConnections)
    .where(and(eq(assistantConnections.userId, ctx.userId), isNull(assistantConnections.revokedAt)))
    .orderBy(desc(assistantConnections.createdAt), desc(assistantConnections.id));
  const counts = await changeCount(
    ctx,
    rows.map((row) => row.id),
  );
  return {
    connections: rows.map((row) => ({ ...connectionOf(row), changeCount: counts.get(row.id) ?? 0 })),
    past: await listPastConnections(ctx),
    availability: connectionAvailability(),
  };
}
