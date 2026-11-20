import type { AssistantChange, AssistantChangePage } from "@hovimestari/types";
import { and, desc, eq, sql } from "drizzle-orm";
import { assistantChanges, assistantConnections } from "../../db/schema/index.js";
import { appError } from "../../lib/errors.js";
import { isUuid } from "../../lib/isUuid.js";
import type { ReadContext } from "./context.js";

// One connection's record of changes, as its owner reads it in Settings,
// newest first, a page at a time. A revoked connection's record stays
// readable. Another person's connection answers as a missing one does.
//
// The cursor is the id of the last change on the page before, as base64url
// of its 16 bytes: opaque to the client and holding nothing secret. A page
// after it holds the changes older than that change by (created_at, id), the
// order of assistant_changes_connection_idx. A change made after the first
// page was read is newer than every cursor, so no later page holds it, and
// no change is answered twice or skipped. The cursor's change is read back
// from this connection's own record, so a cursor that names no change of
// this connection is refused, never guessed at. created_at is compared in
// the database, at its full microsecond precision.

/** The page's cursor for the change `id`. */
export const cursorOf = (id: string): string => Buffer.from(id.replaceAll("-", ""), "hex").toString("base64url");

const CURSOR = /^[A-Za-z0-9_-]{22}$/;

/** The change id `cursor` names, or null for text that no cursor encodes. */
export function changeIdOf(cursor: string): string | null {
  if (!CURSOR.test(cursor)) return null;
  const bytes = Buffer.from(cursor, "base64url");
  // 22 characters carry 132 bits. Only the form `cursorOf` writes, with the
  // last 4 bits zero, is one the route issued.
  if (bytes.length !== 16 || bytes.toString("base64url") !== cursor) return null;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Refuses an id that is not one of this user's connections, revoked ones included. */
async function assertOwnConnection(ctx: ReadContext, connectionId: string): Promise<void> {
  if (!isUuid(connectionId)) throw appError("connection_not_found", 404);
  const [own] = await ctx.db
    .select({ id: assistantConnections.id })
    .from(assistantConnections)
    .where(and(eq(assistantConnections.id, connectionId), eq(assistantConnections.userId, ctx.userId)));
  if (!own) throw appError("connection_not_found", 404);
}

/** The change the cursor names, checked to be in this connection's record. */
async function cursorChange(ctx: ReadContext, connectionId: string, cursor: string): Promise<string> {
  const id = changeIdOf(cursor);
  if (!id) throw appError("invalid_request", 400);
  const [row] = await ctx.db
    .select({ id: assistantChanges.id })
    .from(assistantChanges)
    .where(and(eq(assistantChanges.id, id), eq(assistantChanges.connectionId, connectionId)));
  if (!row) throw appError("invalid_request", 400);
  return row.id;
}

/**
 * A page of the connection's record, newest first: `limit` changes and the
 * cursor of the page after them, null when there are no more. Each change is
 * its action, time, connection name and summary. The ids it touched, its
 * request key and its request hash never leave the backend.
 */
export async function listChanges(
  ctx: ReadContext,
  connectionId: string,
  page: { cursor?: string; limit: number },
): Promise<AssistantChangePage> {
  await assertOwnConnection(ctx, connectionId);
  const after = page.cursor === undefined ? null : await cursorChange(ctx, connectionId, page.cursor);
  const t = assistantChanges;
  const rows = await ctx.db
    .select({
      id: t.id,
      action: t.action,
      createdAt: t.createdAt,
      connectionName: t.connectionName,
      summary: t.summary,
    })
    .from(t)
    .where(
      and(
        eq(t.connectionId, connectionId),
        after === null
          ? undefined
          : sql`(${t.createdAt}, ${t.id}) < (SELECT c.created_at, c.id FROM assistant_changes c WHERE c.id = ${after})`,
      ),
    )
    .orderBy(desc(t.createdAt), desc(t.id))
    .limit(page.limit + 1);
  const shown = rows.slice(0, page.limit);
  const changes = shown.map((row): AssistantChange => ({
    id: row.id,
    action: row.action,
    at: row.createdAt.toISOString(),
    connectionName: row.connectionName,
    summary: row.summary,
    // Deletion requests are not built. Every recorded action today has no status.
    deletionStatus: null,
  }));
  const last = shown.at(-1);
  return { changes, nextCursor: rows.length > page.limit && last ? cursorOf(last.id) : null };
}
