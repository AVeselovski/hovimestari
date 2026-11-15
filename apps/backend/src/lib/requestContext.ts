import type { Request } from "express";
import { db } from "../db/index.js";
import type { users } from "../db/schema/index.js";
import type { WriteContext } from "../services/writes/context.js";
import { appError } from "./errors.js";
import { calendarDate, usableTimeZone } from "./userTime.js";
import { findUser } from "./users.js";

/**
 * The service context for `user` at `now`: the user, the clock, and the
 * user's time zone and today. Pure, so every caller that has the user's row
 * builds the same context: a route here, the MCP key path later.
 */
export function contextForUser(user: Pick<typeof users.$inferSelect, "id" | "timeZone">, now: Date): WriteContext {
  const timeZone = usableTimeZone(user.timeZone);
  return { userId: user.id, db, now, timeZone, today: calendarDate(now, timeZone), actor: { userId: user.id } };
}

/**
 * The service context for an authenticated request, built once per request.
 * A deleted account whose access token is still alive answers 404 `user_not_found`.
 */
export async function contextFor(req: Request): Promise<WriteContext> {
  const user = await findUser(req.user!.id);
  if (!user) throw appError("user_not_found", 404);
  return contextForUser(user, new Date());
}
