import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema/index.js";

/** The user with `id`, or undefined when there is none. */
export async function findUser(id: string): Promise<typeof users.$inferSelect | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}
