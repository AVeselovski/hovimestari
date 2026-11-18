import type { SettingsBody } from "@hovimestari/types";
import { and, eq, isNull } from "drizzle-orm";
import { users } from "../../db/schema/index.js";
import type { Db, Tx } from "../../db/types.js";
import { appError } from "../../lib/errors.js";
import type { WriteContext, WriteOutcome } from "./context.js";

type UserRow = typeof users.$inferSelect;

/**
 * Changes the user's food-name language, time zone, or both. The time zone
 * was checked against `Intl` by the body's schema. Settings stay out of an
 * assistant's reach: only REST calls this.
 */
export async function updateSettings(ctx: WriteContext, body: SettingsBody): Promise<WriteOutcome<UserRow>> {
  const [current] = await ctx.db.select().from(users).where(eq(users.id, ctx.userId));
  if (!current) throw appError("user_not_found", 404);
  const next = {
    foodNameLanguage: body.foodNameLanguage ?? current.foodNameLanguage,
    timeZone: body.timeZone ?? current.timeZone,
  };
  if (next.foodNameLanguage === current.foodNameLanguage && next.timeZone === current.timeZone) {
    return { value: current, outcome: "unchanged" };
  }
  const [user] = await ctx.db
    .update(users)
    .set({ ...next, updatedAt: ctx.now })
    .where(eq(users.id, ctx.userId))
    .returning();
  // Deleted between the read and the update: the update waited on its row and found it gone.
  if (!user) throw appError("user_not_found", 404);
  return { value: user, outcome: "changed" };
}

/**
 * Stores that the first run is behind the user, once: `first_run_done_at`
 * and `updated_at` take `ctx.now` only while the flag is unset, so a repeat
 * writes nothing. Answers whether this call set it.
 */
export async function markFirstRunDone(db: Db | Tx, ctx: WriteContext): Promise<boolean> {
  const set = await db
    .update(users)
    .set({ firstRunDoneAt: ctx.now, updatedAt: ctx.now })
    .where(and(eq(users.id, ctx.userId), isNull(users.firstRunDoneAt)))
    .returning({ id: users.id });
  return set.length > 0;
}

/**
 * The user goes on without targets from the first run. Idempotent: a user
 * already past it is a success with nothing written. A deleted account
 * answers 404 `user_not_found`.
 */
export async function finishFirstRun(ctx: WriteContext): Promise<WriteOutcome<null>> {
  if (await markFirstRunDone(ctx.db, ctx)) return { value: null, outcome: "changed" };
  const [user] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.id, ctx.userId));
  if (!user) throw appError("user_not_found", 404);
  return { value: null, outcome: "unchanged" };
}
