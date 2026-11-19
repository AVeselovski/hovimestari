import { MAX_LIVE_CONNECTIONS, type CreateConnectionBodySchema, type CreatedConnection } from "@hovimestari/types";
import { and, count, eq, gt, isNull, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { assistantConnections, users } from "../../db/schema/index.js";
import type { Tx } from "../../db/types.js";
import { generateConnectionKey } from "../../lib/connectionKeys.js";
import { appError } from "../../lib/errors.js";
import { isUuid } from "../../lib/isUuid.js";
import { sessionLives } from "../../lib/sessions.js";
import { connectionAvailability, connectionColumns, connectionOf } from "../reads/connections.js";
import type { WriteContext, WriteOutcome } from "./context.js";

// Making and revoking connections, lifted from finanssiappisV2's
// routes/accessTokens.ts and lib/accessTokens.ts with their SQL moved here.
// A connection row is never deleted: a revoke stamps revoked_at, so the row
// stays for what the connection did. Expiry is set and read on the database
// clock, the clock the key lookup reads it on.

/**
 * When a key made at `from` with a lifetime of `days` expires. A day is 24
 * hours, whatever the database session's time zone: an interval of days
 * would add calendar days there and gain or lose an hour across a
 * daylight-saving change.
 */
export const keyExpiry = (from: SQL, days: number): SQL => sql`${from} + make_interval(hours => 24 * ${days})`;

/**
 * Makes a key for the user. The answer is the only place the key ever
 * appears. Nothing is made the server would refuse to use: any create while
 * connecting is off answers 409 `connect_off`, and a writing key while
 * writing is off 400 `writes_off`.
 *
 * The user's row is locked FOR NO KEY UPDATE before the count, so a second
 * create by the same user waits until this one commits, and its count then
 * sees this key. NO KEY UPDATE conflicts with itself and leaves the key share
 * locks of entry and saved-meal writes alone. A user gone by then answers 404
 * `user_not_found`. At ten live keys it answers 409 `connection_limit`.
 *
 * Only a live session makes a key. `sessionFamily` is the family the access
 * token names. Under the same lock the user must still hold an unexpired
 * refresh row of it, or the create answers 401 `session_expired`, and the
 * web renews the session or signs the person in again. An access token
 * outlives its session by up to its 15 minutes, so without this a token from
 * before a password change could make a key that outlives the change. Every
 * way a session ends takes this lock, so none can land between the check and
 * the insert. A token that names no family is refused the same way.
 */
export async function createConnection(
  ctx: WriteContext,
  body: z.output<typeof CreateConnectionBodySchema>,
  sessionFamily: string | undefined,
): Promise<WriteOutcome<CreatedConnection>> {
  const availability = connectionAvailability();
  if (!availability.connect) throw appError("connect_off", 409);
  if (body.access === "read_write" && !availability.write) throw appError("writes_off", 400);

  const { key, hash } = generateConnectionKey();
  const row = await ctx.db.transaction(async (tx) => {
    const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, ctx.userId)).for("no key update");
    if (!owner) throw appError("user_not_found", 404);
    if (!(await sessionLives(tx, ctx.userId, sessionFamily))) throw appError("session_expired", 401);
    const [{ live }] = await tx
      .select({ live: count() })
      .from(assistantConnections)
      .where(
        and(
          eq(assistantConnections.userId, ctx.userId),
          isNull(assistantConnections.revokedAt),
          gt(assistantConnections.expiresAt, sql`now()`),
        ),
      );
    if (live >= MAX_LIVE_CONNECTIONS) throw appError("connection_limit", 409);
    const [inserted] = await tx
      .insert(assistantConnections)
      .values({
        userId: ctx.userId,
        name: body.name,
        keyHash: hash,
        access: body.access,
        expiresAt: keyExpiry(sql`now()`, body.expiresInDays),
      })
      .returning(connectionColumns);
    return inserted;
  });

  return { value: { connection: connectionOf(row), key }, outcome: "created" };
}

/**
 * Revokes one of the user's connections that is not yet revoked, active or
 * expired. The next call with its key is refused. A revoked one, another
 * user's, a missing one or an id that is not a UUID answers 404
 * `connection_not_found`, all alike.
 */
export async function revokeConnection(ctx: WriteContext, id: string): Promise<WriteOutcome<null>> {
  if (!isUuid(id)) throw appError("connection_not_found", 404);
  const revoked = await ctx.db
    .update(assistantConnections)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(assistantConnections.id, id),
        eq(assistantConnections.userId, ctx.userId),
        isNull(assistantConnections.revokedAt),
      ),
    )
    .returning({ id: assistantConnections.id });
  if (revoked.length === 0) throw appError("connection_not_found", 404);
  return { value: null, outcome: "changed" };
}

/**
 * Revokes every connection of the user not yet revoked. Runs inside the
 * transaction of a password change or reset, beside `endAllSessions`, so a
 * change that fails revokes nothing. A key cannot outlive the password it was
 * made under because of both halves: this revokes every key made before the
 * change, and `createConnection` refuses an access token whose session the
 * change ended, which would otherwise make a key for up to 15 minutes after it.
 */
export async function revokeAllConnections(tx: Tx, userId: string): Promise<void> {
  await tx
    .update(assistantConnections)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(assistantConnections.userId, userId), isNull(assistantConnections.revokedAt)));
}
