import type { FoodNameLanguage, Me, SessionGrant } from "@hovimestari/types";
import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { refreshTokens, users } from "../db/schema/index.js";
import type { Db, Tx } from "../db/types.js";
import { env } from "./env.js";
import { appError } from "./errors.js";
import { isUuid } from "./isUuid.js";
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from "./jwt.js";

// Sessions as refresh-token families. A sign-in starts a family. Renewing a
// live token supersedes it and issues one successor. Renewing a superseded
// token again issues another successor beside the first, a sibling, so a
// renewal whose answer was lost can be repeated. Using any live token of a
// family deletes every other row of the family. A signature-valid token whose
// row is gone while its family still has rows is a reuse.
//
// Every write to a user's refresh rows takes the user's row lock first, with
// FOR NO KEY UPDATE, so renewals, sign-ins and every way a session ends run
// one after another for one user. Expiry is judged by the database clock.
// docs/design/session-renewal.md holds the reasoning.

type UserRow = typeof users.$inferSelect;

/** The most unused successors a family keeps. Past it an older one is deleted. */
export const MAX_UNUSED_SUCCESSORS = 5;

/**
 * What a sign-in route checked before it asked for a session: the password
 * hash bcrypt compared, the Google id the code named, or a brand new account.
 * `issueSession` checks it again under the user lock.
 */
export type SignInProof = { passwordHash: string } | { googleId: string } | { newAccount: true };

/** The signed-in user as the API shows it. */
export const meOf = (user: UserRow): Me => ({
  id: user.id,
  email: user.email,
  hasPassword: user.passwordHash !== null,
  hasGoogle: user.googleId !== null,
  // A CHECK keeps the column to the two languages.
  foodNameLanguage: user.foodNameLanguage as FoodNameLanguage,
  timeZone: user.timeZone,
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

const sessionExpired = () => appError("session_expired", 401);

/** A row is live by the database clock while this holds. */
const unexpired = sql`${refreshTokens.expiresAt} > now()`;

/** Takes the user's row lock for the rest of the transaction, and answers the row, or undefined when there is none. */
async function lockUser(tx: Db, userId: string): Promise<UserRow | undefined> {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("no key update");
  return user;
}

/** Deletes the user's expired rows. Runs under the user lock. */
async function sweepExpired(tx: Db, userId: string): Promise<void> {
  await tx.delete(refreshTokens).where(and(eq(refreshTokens.userId, userId), sql`${refreshTokens.expiresAt} <= now()`));
}

/** Stores a new refresh token of `familyId` for `user`, and answers the session it opens. */
async function grant(tx: Db, user: UserRow, familyId: string): Promise<SessionGrant> {
  const refreshToken = signRefreshToken({ sub: user.id, fam: familyId });
  const lifetime = `${parseExpiryMs(env.JWT_REFRESH_EXPIRES_IN)} milliseconds`;
  await tx.insert(refreshTokens).values({
    userId: user.id,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt: sql`now() + ${lifetime}::interval`,
  });
  return { accessToken: signAccessToken({ sub: user.id }), refreshToken, user: meOf(user) };
}

function proofHolds(user: UserRow, proof: SignInProof): boolean {
  if ("passwordHash" in proof) return user.passwordHash === proof.passwordHash;
  if ("googleId" in proof) return user.googleId === proof.googleId;
  return true;
}

function proofRefused(proof: SignInProof) {
  if ("passwordHash" in proof) return appError("invalid_credentials", 401);
  if ("googleId" in proof) return appError("google_failed", 401);
  return sessionExpired();
}

/**
 * A new session for `user`, the first token of a new family. Under the user
 * lock it checks `proof` again, so a sign-in that checked the password just
 * before a password change, or Google just before an unlink, is refused
 * rather than outliving it.
 */
export async function issueSession(user: UserRow, proof: SignInProof): Promise<SessionGrant> {
  return db.transaction(async (tx) => {
    const locked = await lockUser(tx, user.id);
    if (!locked || !proofHolds(locked, proof)) throw proofRefused(proof);
    await sweepExpired(tx, locked.id);
    return grant(tx, locked, randomUUID());
  });
}

type PresentedRow = { id: string; familyId: string; supersededAt: Date | null };

/** Renews a live token: supersedes it, deletes every other row of its family, and issues one successor. */
async function renewLive(tx: Db, user: UserRow, row: PresentedRow): Promise<SessionGrant | null> {
  const claimed = await tx
    .update(refreshTokens)
    .set({ supersededAt: sql`now()` })
    .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.supersededAt), unexpired))
    .returning({ id: refreshTokens.id });
  if (claimed.length === 0) return null;
  await tx
    .delete(refreshTokens)
    .where(
      and(eq(refreshTokens.userId, user.id), eq(refreshTokens.familyId, row.familyId), ne(refreshTokens.id, row.id)),
    );
  return grant(tx, user, row.familyId);
}

/** Renews a superseded token again: issues a sibling beside the unused successors, keeping at most the cap. */
async function renewSuperseded(tx: Db, user: UserRow, row: PresentedRow): Promise<SessionGrant | null> {
  const still = await tx
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.id, row.id), isNotNull(refreshTokens.supersededAt), unexpired));
  if (still.length === 0) return null;
  const pastTheCap = tx
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.userId, user.id),
        eq(refreshTokens.familyId, row.familyId),
        isNull(refreshTokens.supersededAt),
      ),
    )
    .orderBy(desc(refreshTokens.createdAt), desc(refreshTokens.id))
    .offset(MAX_UNUSED_SUCCESSORS - 1);
  await tx.delete(refreshTokens).where(inArray(refreshTokens.id, pastTheCap));
  return grant(tx, user, row.familyId);
}

/**
 * A token whose row is gone: when its `fam` names a family the user still
 * has, it is a reuse, whether it was presented to renew or to sign out.
 * Runs under the user lock.
 */
async function reuseIfFamilyLives(tx: Tx, userId: string, fam: string | undefined): Promise<void> {
  if (fam && isUuid(fam) && (await familyLives(tx, userId, fam))) {
    await onRefreshReuse(tx, { userId, familyId: fam });
  }
}

/** Whether the user still has any row in `familyId`. */
async function familyLives(tx: Db, userId: string, familyId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.familyId, familyId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Renews the session `refreshToken` belongs to, or throws 401
 * `session_expired`. A refusal is thrown after the transaction commits, so
 * what it wrote on the way (an expired row deleted, a reuse policy's deletes)
 * stays written.
 */
export async function renewSession(refreshToken: string): Promise<SessionGrant> {
  let claims: { sub: string; fam?: string };
  try {
    claims = verifyRefreshToken(refreshToken);
  } catch {
    throw sessionExpired();
  }
  if (!isUuid(claims.sub)) throw sessionExpired();
  const tokenHash = hashToken(refreshToken);

  const granted = await db.transaction(async (tx) => {
    const user = await lockUser(tx, claims.sub);
    if (!user) return null;

    const [row] = await tx
      .select({
        id: refreshTokens.id,
        familyId: refreshTokens.familyId,
        supersededAt: refreshTokens.supersededAt,
        live: sql<boolean>`${unexpired}`,
      })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.userId, user.id)));

    let result: SessionGrant | null = null;
    if (!row) {
      await reuseIfFamilyLives(tx, user.id, claims.fam);
      return null;
    }
    if (row.live)
      result = row.supersededAt === null ? await renewLive(tx, user, row) : await renewSuperseded(tx, user, row);
    // An expired presented row goes with the rest of the user's expired rows.
    await sweepExpired(tx, user.id);
    return result;
  });

  if (!granted) throw sessionExpired();
  return granted;
}

/**
 * A dead token of a living family was presented: a used predecessor, or a
 * sibling deleted when another was used or trimmed by the cap. It ends that
 * family, every row of it, under the user lock the caller holds. Whoever
 * presented the token is refused either way, and the web relay then deletes
 * that browser's cookie, so the owner loses nothing more. A thief who renewed
 * first loses the session they would otherwise keep rotating. The user's
 * other sign-ins are untouched. Whether to end every session of the user
 * instead is the owner's open decision in TODO.md: `await endAllSessions(tx, reuse.userId);`
 * The log line carries ids only, never a token, a hash or an address.
 */
export async function onRefreshReuse(tx: Tx, reuse: { userId: string; familyId: string }): Promise<void> {
  await tx
    .delete(refreshTokens)
    .where(and(eq(refreshTokens.userId, reuse.userId), eq(refreshTokens.familyId, reuse.familyId)));
  console.warn(`[auth] refresh token reuse, family ended: user ${reuse.userId}, family ${reuse.familyId}`);
}

/**
 * Signs out the session `refreshToken` belongs to: deletes every row of its
 * family, superseded rows and unused successors included. A token whose row
 * is gone while its family lives is a reuse, handled as a renewal handles it:
 * the owner signing out with a token a thief's renewal deleted must not leave
 * the thief's line alive. A token that does not verify, or whose family has
 * ended, ends nothing.
 */
export async function endSession(refreshToken: string): Promise<void> {
  let sub: string;
  let fam: string | undefined;
  try {
    ({ sub, fam } = verifyRefreshToken(refreshToken));
  } catch {
    return;
  }
  if (!isUuid(sub)) return;
  const tokenHash = hashToken(refreshToken);

  await db.transaction(async (tx) => {
    if (!(await lockUser(tx, sub))) return;
    const [row] = await tx
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.userId, sub)));
    if (!row) {
      await reuseIfFamilyLives(tx, sub, fam);
      return;
    }
    await tx.delete(refreshTokens).where(and(eq(refreshTokens.userId, sub), eq(refreshTokens.familyId, row.familyId)));
  });
}

/**
 * Ends every session of `userId`: no refresh token of theirs works again,
 * superseded ones included. It takes the user lock first, so a renewal or a
 * sign-in in flight either commits before it and is deleted, or runs after
 * it. It takes a transaction, because on the pool the lock would end with
 * the statement.
 * An access token already handed out lives until it expires. Password
 * change, password reset and signing out everywhere call it.
 */
export async function endAllSessions(tx: Tx, userId: string): Promise<void> {
  await lockUser(tx, userId);
  await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
}
