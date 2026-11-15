import type { Me, SessionGrant } from "@hovimestari/types";
import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { refreshTokens, users } from "../db/schema/index.js";
import type { Db } from "../db/types.js";
import { env } from "./env.js";
import { appError } from "./errors.js";
import { hashToken, signAccessToken, signRefreshToken } from "./jwt.js";

type UserRow = typeof users.$inferSelect;

/** The signed-in user as the API shows it. */
export const meOf = (user: UserRow): Me => ({
  id: user.id,
  email: user.email,
  hasPassword: user.passwordHash !== null,
  hasGoogle: user.googleId !== null,
});

/**
 * Parse an expiry string like "7d", "15m", "1h" to milliseconds.
 */
export function parseExpiryMs(expiry: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiry);
  if (!match) throw new Error(`Invalid expiry format: ${expiry}`);
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown expiry unit: ${match[2]}`);
  }
}

/**
 * A new session for `user`: an access token, and a refresh token stored by
 * its hash. When the session replaces one, `consumedTokenHash` names the
 * refresh token being spent.
 *
 * Every write is one transaction. The spent row is deleted first and the
 * delete must remove it: a second refresh racing with the same token waits on
 * the row's lock, then finds it gone and gets 401, so one refresh token yields
 * exactly one new session. The user's expired rows are swept on the way, so
 * rows cannot pile up.
 */
export async function issueSession(user: UserRow, consumedTokenHash?: string): Promise<SessionGrant> {
  const accessToken = signAccessToken({ sub: user.id });
  const refreshToken = signRefreshToken({ sub: user.id });
  const expiresAt = new Date(Date.now() + parseExpiryMs(env.JWT_REFRESH_EXPIRES_IN));

  await db.transaction(async (tx) => {
    if (consumedTokenHash) {
      const spent = await tx
        .delete(refreshTokens)
        .where(and(eq(refreshTokens.tokenHash, consumedTokenHash), eq(refreshTokens.userId, user.id)))
        .returning({ id: refreshTokens.id });
      if (spent.length === 0) throw appError("session_expired", 401);
    }
    await tx
      .delete(refreshTokens)
      .where(and(eq(refreshTokens.userId, user.id), lt(refreshTokens.expiresAt, new Date())));
    await tx.insert(refreshTokens).values({ userId: user.id, tokenHash: hashToken(refreshToken), expiresAt });
  });

  return { accessToken, refreshToken, user: meOf(user) };
}

/**
 * Ends every session of `userId`: no refresh token of theirs works again.
 * An access token already handed out lives until it expires. Password change,
 * password reset and signing out everywhere call it inside their own
 * transaction.
 */
export async function endAllSessions(tx: Db, userId: string): Promise<void> {
  await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
}
