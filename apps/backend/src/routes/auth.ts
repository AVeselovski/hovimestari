import {
  ForgotPasswordBodySchema,
  LinkPasswordBodySchema,
  LoginBodySchema,
  RefreshBodySchema,
  RegisterBodySchema,
  ResetPasswordBodySchema,
} from "@hovimestari/types";
import { randomBytes } from "crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { Router, type Router as IRouter } from "express";
import { db } from "../db/index.js";
import { passwordResetTokens, users } from "../db/schema/index.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { env } from "../lib/env.js";
import { appError } from "../lib/errors.js";
import { failureOf } from "../lib/failureOf.js";
import { googleEnabled } from "../lib/google.js";
import { hashToken } from "../lib/jwt.js";
import { parseBody } from "../lib/parseBody.js";
import { hashPassword, passwordMatches } from "../lib/passwords.js";
import { isCheckViolation, isUniqueViolation } from "../lib/pgErrors.js";
import { endAllSessions, endSession, issueSession, meOf, renewSession } from "../lib/sessions.js";
import { findUser } from "../lib/users.js";
import { authenticate } from "../middleware/authenticate.js";
import {
  forgotPasswordRateLimit,
  loginAddressRateLimit,
  loginRateLimit,
  registerRateLimit,
} from "../middleware/authRateLimits.js";
import { requireBff } from "../middleware/requireBff.js";
import { revokeAllConnections } from "../services/writes/connections.js";
import { googleRouter } from "./authGoogle.js";

export const authRouter: IRouter = Router();

/** How long a password reset link works. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const FORGOT_PASSWORD_ANSWER = { message: "If an account exists, a reset email has been sent." };

// POST /register. Relayed by the web server only: it answers a refresh token.
authRouter.post("/register", requireBff, registerRateLimit, async (req, res) => {
  const { email, password } = parseBody(RegisterBodySchema, req.body);

  const existing = await db
    .select({ googleId: users.googleId, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    throw appError(existing[0].googleId && !existing[0].passwordHash ? "email_taken_google" : "email_taken", 409);
  }

  const passwordHash = await hashPassword(password);
  let user;
  try {
    [user] = await db.insert(users).values({ email, passwordHash }).returning();
  } catch (err) {
    // A sign-up for the same address that won the race.
    if (isUniqueViolation(err, "users_email_unique")) throw appError("email_taken", 409);
    throw err;
  }

  res.status(201).json(await issueSession(user, { newAccount: true }));
});

// POST /login. Relayed by the web server only.
authRouter.post("/login", requireBff, loginAddressRateLimit, loginRateLimit, async (req, res) => {
  const { email, password } = parseBody(LoginBodySchema, req.body);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Compared even when there is no account or no password, so the timing tells nothing.
  const matches = await passwordMatches(password, user?.passwordHash);
  if (!user?.passwordHash || !matches) throw appError("invalid_credentials", 401);

  res.status(200).json(await issueSession(user, { passwordHash: user.passwordHash }));
});

// POST /refresh. Relayed by the web server only: the refresh token lives in its cookie.
authRouter.post("/refresh", requireBff, async (req, res) => {
  const { refreshToken } = parseBody(RefreshBodySchema, req.body);
  res.status(200).json(await renewSession(refreshToken));
});

// POST /logout. Relayed by the web server, which holds the token: whoever presents it may end its session.
authRouter.post("/logout", requireBff, async (req, res) => {
  const { refreshToken } = parseBody(RefreshBodySchema, req.body);
  await endSession(refreshToken);
  res.status(204).send();
});

// POST /logout-all. Ends every session of the user. Other devices stop at their next refresh.
authRouter.post("/logout-all", authenticate, async (req, res) => {
  await db.transaction((tx) => endAllSessions(tx, req.user!.id));
  res.status(204).send();
});

// GET /providers. Whether the web app shows "Continue with Google".
authRouter.get("/providers", (_req, res) => {
  res.status(200).json({ google: googleEnabled() });
});

authRouter.use(googleRouter);

// POST /forgot-password. The answer is the same whether or not the address has an account.
authRouter.post("/forgot-password", forgotPasswordRateLimit, async (req, res) => {
  const { email } = parseBody(ForgotPasswordBodySchema, req.body);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user?.passwordHash) {
    res.status(200).json(FORGOT_PASSWORD_ANSWER);
    return;
  }

  // Answered before the token is stored and the mail is sent, so an address
  // with an account answers as fast as one without. A failure is logged, and
  // never reaches the caller.
  res.status(200).json(FORGOT_PASSWORD_ANSWER);
  void sendResetLink(user.id, email).catch((err: unknown) => {
    console.error("[auth] password reset mail failed:", failureOf(err));
  });
});

/** Stores a new reset link for the user, sweeping their expired ones, and mails it. */
async function sendResetLink(userId: string, email: string): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  await db.transaction(async (tx) => {
    await tx
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userId), lt(passwordResetTokens.expiresAt, new Date())));
    await tx.insert(passwordResetTokens).values({
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });
  });
  await sendPasswordResetEmail(email, `${env.FRONTEND_URL}/auth/reset-password?token=${rawToken}`);
}

// POST /reset-password. Sets the password, ends every session and revokes every connection key.
authRouter.post("/reset-password", async (req, res) => {
  const { token, newPassword } = parseBody(ResetPasswordBodySchema, req.body);
  const tokenHash = hashToken(token);

  const [found] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  if (!found) throw appError("reset_link_invalid", 400);
  if (found.expiresAt < new Date()) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash));
    throw appError("reset_link_invalid", 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    // The user row first, as every session write and an account deletion take it. Taking the link's row
    // first would deadlock with a deletion, which locks the user and then cascades to the link.
    const [owner] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, found.userId))
      .for("no key update");
    if (!owner) throw appError("reset_link_invalid", 400);
    // Spending the link and setting the password are one step: a second use racing this one finds no row.
    const spent = await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .returning({ id: passwordResetTokens.id });
    if (spent.length === 0) throw appError("reset_link_invalid", 400);
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, found.userId));
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, found.userId));
    await endAllSessions(tx, found.userId);
    await revokeAllConnections(tx, found.userId);
  });

  res.status(204).send();
});

// POST /link/password. Adds a password to a Google-only account.
authRouter.post("/link/password", authenticate, async (req, res) => {
  const { password } = parseBody(LinkPasswordBodySchema, req.body);
  const userId = req.user!.id;

  const user = await findUser(userId);
  if (!user) throw appError("user_not_found", 404);
  if (user.passwordHash) throw appError("password_already_set", 409);

  const passwordHash = await hashPassword(password);
  const [updated] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.passwordHash)))
    .returning();
  if (!updated) throw appError("password_already_set", 409);

  res.status(200).json(meOf(updated));
});

// DELETE /unlink/:method. Removes Google or the password, never the last way in.
authRouter.delete("/unlink/:method", authenticate, async (req, res) => {
  const method = req.params.method;
  if (method !== "google" && method !== "password") throw appError("invalid_method", 400);
  const userId = req.user!.id;

  const user = await findUser(userId);
  if (!user) throw appError("user_not_found", 404);
  const keepsPassword = method === "password" ? false : user.passwordHash !== null;
  const keepsGoogle = method === "google" ? false : user.googleId !== null;
  if (!keepsPassword && !keepsGoogle) throw appError("last_sign_in_method", 400);

  let updated;
  try {
    [updated] = await db
      .update(users)
      .set(
        method === "password"
          ? { passwordHash: null, updatedAt: new Date() }
          : { googleId: null, updatedAt: new Date() },
      )
      .where(eq(users.id, userId))
      .returning();
  } catch (err) {
    // Another request removed the other method in the meantime: the database refuses to leave no way in.
    if (isCheckViolation(err, "users_has_sign_in_method")) throw appError("last_sign_in_method", 400);
    throw err;
  }
  if (!updated) throw appError("user_not_found", 404);

  res.status(200).json(meOf(updated));
});
