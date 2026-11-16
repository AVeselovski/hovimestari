import type { SettingsBody } from "@hovimestari/types";
import { eq } from "drizzle-orm";
import { users } from "../../db/schema/index.js";
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
