import {
  ForgotPasswordBodySchema,
  LinkPasswordBodySchema,
  LoginBodySchema,
  RefreshBodySchema,
  RegisterBodySchema,
  ResetPasswordBodySchema,
} from "@finanssiappis/types";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { and, eq, lt } from "drizzle-orm";
import { Router, type Router as IRouter, type RequestHandler } from "express";
import passport from "passport";
import { db } from "../db/index.js";
import { passwordResetTokens, refreshTokens, users } from "../db/schema/index.js";
import { revokeUserAccessTokens } from "../lib/accessTokens.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { env } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import { failureOf } from "../lib/failureOf.js";
import {
  hashToken,
  OAUTH_STATE_TTL_MS,
  signAccessToken,
  signOAuthState,
  signRefreshToken,
  verifyOAuthState,
  verifyRefreshToken,
  type OAuthStatePurpose,
} from "../lib/jwt.js";
import { issueNavigationTicket } from "../lib/navigationTickets.js";
import { cookieValue, nonceMatches, stateCookieOptions } from "../lib/oauthStateCookie.js";
import { generateStubsForUser } from "../lib/recurringStubs.js";
import { authenticate } from "../middleware/authenticate.js";
import { authenticateNavigation } from "../middleware/authenticateNavigation.js";
import {
  forgotPasswordRateLimit,
  loginAddressRateLimit,
  loginRateLimit,
  registerRateLimit,
} from "../middleware/authRateLimits.js";

export const authRouter: IRouter = Router();

/**
 * Parse an expiry string like "7d", "15m", "1h" to milliseconds.
 */
function parseExpiryMs(expiry: string): number {
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

async function issueTokens(
  userId: string,
  consumedTokenHash?: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ sub: userId });
  const refreshToken = signRefreshToken({ sub: userId });
  const newTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseExpiryMs(env.JWT_REFRESH_EXPIRES_IN));

  // All token mutations are in a single transaction so that a concurrent refresh
  // with the same token cannot race:
  //   1. Delete the consumed token (if any) atomically with the new insert so
  //      two simultaneous refreshes cannot both proceed past the deletion and
  //      each issue a new token pair.
  //   2. Clean up any other expired tokens for this user to prevent unbounded
  //      row accumulation.
  //   3. Insert the new refresh token.
  await db.transaction(async (tx) => {
    if (consumedTokenHash) {
      await tx.delete(refreshTokens).where(eq(refreshTokens.tokenHash, consumedTokenHash));
    }

    await tx
      .delete(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), lt(refreshTokens.expiresAt, new Date())));

    await tx.insert(refreshTokens).values({
      userId,
      tokenHash: newTokenHash,
      expiresAt,
    });
  });

  return { accessToken, refreshToken };
}

// POST /register
authRouter.post("/register", registerRateLimit, async (req, res) => {
  const body = RegisterBodySchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError(body.error.errors[0].message, 400);
  }

  const { email, password, displayName } = body.data;

  const existing = await db
    .select({ id: users.id, googleId: users.googleId, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0].googleId && !existing[0].passwordHash) {
      throw new AppError("An account with this email already exists. Sign in with Google to access it.", 409);
    }
    throw new AppError("An account with this email already exists.", 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const inserted = await db.insert(users).values({ email, displayName, passwordHash }).returning({ id: users.id });

  const tokens = await issueTokens(inserted[0].id);
  res.status(201).json(tokens);
});

// POST /login
authRouter.post("/login", loginAddressRateLimit, loginRateLimit, async (req, res) => {
  const body = LoginBodySchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError(body.error.errors[0].message, 400);
  }

  const { email, password } = body.data;

  const found = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (found.length === 0 || !found[0].passwordHash) {
    throw new AppError("Invalid email or password.", 401);
  }

  const valid = await bcrypt.compare(password, found[0].passwordHash);
  if (!valid) {
    throw new AppError("Invalid email or password.", 401);
  }

  const tokens = await issueTokens(found[0].id);

  // Lazy-on-login stub generation (FR-REC-03). Awaited so stubs are visible to
  // the very next request from this session; swallowed so a generator failure
  // never blocks login.
  try {
    await generateStubsForUser(found[0].id, db);
  } catch (err) {
    console.error("generateStubsForUser failed", { userId: found[0].id, failure: failureOf(err) });
  }

  res.status(200).json(tokens);
});

// POST /refresh
authRouter.post("/refresh", async (req, res) => {
  const body = RefreshBodySchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError(body.error.errors[0].message, 400);
  }

  const { refreshToken } = body.data;

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token.", 401);
  }

  const tokenHash = hashToken(refreshToken);
  const found = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);

  if (found.length === 0) {
    throw new AppError("Invalid or expired refresh token.", 401);
  }

  if (found[0].expiresAt < new Date()) {
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    throw new AppError("Invalid or expired refresh token.", 401);
  }

  const tokens = await issueTokens(payload.sub, tokenHash);

  // Refresh is also a "user just got a new access token" moment — refresh-only
  // long-lived sessions still need stub generation to stay current (FR-REC-03).
  try {
    await generateStubsForUser(payload.sub, db);
  } catch (err) {
    console.error("generateStubsForUser failed", { userId: payload.sub, failure: failureOf(err) });
  }

  res.status(200).json(tokens);
});

// POST /logout
authRouter.post("/logout", authenticate, async (req, res) => {
  const body = RefreshBodySchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError(body.error.errors[0].message, 400);
  }

  const { refreshToken } = body.data;
  const tokenHash = hashToken(refreshToken);
  // Scope the delete to the authenticated user so a valid access token
  // cannot be used to revoke another user's refresh token.
  await db
    .delete(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.userId, req.user!.id)));
  res.status(204).send();
});

/**
 * What a failed Google callback logs: the OAuth error code when Google gave
 * one (`invalid_client`, `invalid_grant`), else the failure's stack.
 */
function oauthFailureOf(err: unknown): string {
  const code = err instanceof Error ? (err as { code?: unknown }).code : undefined;
  return typeof code === "string" ? `${(err as Error).name} ${code}` : failureOf(err);
}

/**
 * Passport finishing a Google consent. It redirects a declined consent to
 * `failure` itself, but hands any other error, such as a code exchange Google
 * refuses, to `next`. This sends those to `failure` too, so every failure
 * lands on the flow's page in the web app and never on the API's JSON 500.
 */
const finishGoogleConsent =
  (strategy: "google" | "google-link", failure: string): RequestHandler =>
  (req, res, next) => {
    const handler = passport.authenticate(strategy, { session: false, failureRedirect: failure });
    handler(req, res, (err?: unknown) => {
      if (!err) return next();
      console.error(`[auth] ${strategy} callback failed: ${oauthFailureOf(err)}`);
      res.redirect(failure);
    });
  };

/**
 * A Google callback's check that the consent started in this browser: the
 * signed state is the flow's own, and the browser's state cookie holds its
 * nonce. Otherwise Google's code is never exchanged and the flow fails. The
 * cookie has served either way, so it is cleared on every outcome.
 */
const requireOwnState =
  (purpose: OAuthStatePurpose, cookieName: string, cookiePath: string, failure: string): RequestHandler =>
  (req, res, next) => {
    const state = verifyOAuthState(purpose, typeof req.query.state === "string" ? req.query.state : "");
    const cookie = cookieValue(req.headers.cookie, cookieName);
    res.clearCookie(cookieName, stateCookieOptions(cookiePath));
    if (!state || !nonceMatches(state.nonce, cookie)) {
      res.redirect(failure);
      return;
    }
    next();
  };

// Signing in with Google. The start signs a state and sets its nonce in a
// cookie only the callback receives, as the link flow below does, so a
// callback URL from someone else's consent cannot sign this browser into
// their account.
const SIGN_IN_STATE_COOKIE = "google_sign_in_oauth";
const SIGN_IN_CALLBACK_PATH = "/api/v1/auth/google/callback";
const GOOGLE_SIGN_IN_FAILED = `${env.FRONTEND_URL}/auth/sign-in?error=oauth_failed`;

// GET /google
authRouter.get("/google", (req, res, next) => {
  const { state, nonce } = signOAuthState("google-sign-in", {});
  res.cookie(SIGN_IN_STATE_COOKIE, nonce, { ...stateCookieOptions(SIGN_IN_CALLBACK_PATH), maxAge: OAUTH_STATE_TTL_MS });
  passport.authenticate("google", { scope: ["profile", "email"], state, session: false })(req, res, next);
});

// GET /google/callback
authRouter.get(
  "/google/callback",
  requireOwnState("google-sign-in", SIGN_IN_STATE_COOKIE, SIGN_IN_CALLBACK_PATH, GOOGLE_SIGN_IN_FAILED),
  finishGoogleConsent("google", GOOGLE_SIGN_IN_FAILED),
  async (req, res) => {
    const user = req.user as Express.User & { error?: string };
    if (user.error === "email_taken") {
      res.redirect(`${env.FRONTEND_URL}/auth/sign-in?error=google_email_taken`);
      return;
    }
    const tokens = await issueTokens(user.id);

    // Lazy-on-login stub generation (FR-REC-03).
    try {
      await generateStubsForUser(user.id, db);
    } catch (err) {
      console.error("generateStubsForUser failed", { userId: user.id, failure: failureOf(err) });
    }

    res.redirect(
      `${env.FRONTEND_URL}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
    );
  },
);

// POST /forgot-password
authRouter.post("/forgot-password", forgotPasswordRateLimit, async (req, res) => {
  const body = ForgotPasswordBodySchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError(body.error.errors[0].message, 400);
  }

  const { email } = body.data;

  const found = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Silently ignore if not found or no passwordHash
  if (found.length === 0 || !found[0].passwordHash) {
    res.status(200).json({ message: "If an account exists, a reset email has been sent." });
    return;
  }

  const rawToken = randomBytes(16).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokens).values({
    userId: found[0].id,
    tokenHash,
    expiresAt,
  });

  const resetLink = `${env.FRONTEND_URL}/auth/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(email, resetLink);

  res.status(200).json({ message: "If an account exists, a reset email has been sent." });
});

// POST /reset-password
authRouter.post("/reset-password", async (req, res) => {
  const body = ResetPasswordBodySchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError(body.error.errors[0].message, 400);
  }

  const { token, newPassword } = body.data;
  const tokenHash = hashToken(token);

  const found = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (found.length === 0) {
    throw new AppError("Invalid or expired reset token.", 400);
  }

  if (found[0].expiresAt < new Date()) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash));
    throw new AppError("Invalid or expired reset token.", 400);
  }

  const userId = found[0].userId;
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // A reset is a password change: it also ends every session and revokes every
  // AI connection the user made, in one transaction with the new password.
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash));
    await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
    await revokeUserAccessTokens(tx, userId);
  });

  res.status(200).json({ message: "Password reset successfully." });
});

// POST /link/password — add password to a Google-only account (FR-AUTH-04c)
authRouter.post("/link/password", authenticate, async (req, res) => {
  const body = LinkPasswordBodySchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError(body.error.errors[0].message, 400);
  }

  const userId = req.user!.id;
  const found = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (found.length === 0) throw new AppError("User not found.", 404);
  if (found[0].passwordHash) throw new AppError("Password already set.", 409);

  const passwordHash = await bcrypt.hash(body.data.password, 12);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));

  const updated = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const u = updated[0];
  res.status(200).json({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    hasPassword: !!u.passwordHash,
    hasGoogle: !!u.googleId,
  });
});

// ---------------------------------------------------------------------------
// Linking Google (FR-AUTH-04c). Starting the consent is a page navigation,
// which cannot carry an Authorization header, so the page first asks
// POST /link/google/ticket for a navigation ticket and navigates with it.
// The user id rides in the signed state, and the state's nonce goes to this
// browser in a cookie only the callback receives. The callback refuses a state
// without it, so a consent URL sent to someone else's browser links nothing.
// ---------------------------------------------------------------------------

const LINK_STATE_COOKIE = "google_link_oauth";
const LINK_CALLBACK_PATH = "/api/v1/auth/link/google/callback";
const LINK_FAILED = `${env.FRONTEND_URL}/auth/link-callback?error=google_failed`;

// POST /link/google/ticket: a ticket for one GET /link/google, for a minute.
authRouter.post("/link/google/ticket", authenticate, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({ ticket: issueNavigationTicket(req.user!.id, "google-link") });
});

// GET /link/google?ticket=: Google's consent, for the ticket's user.
authRouter.get("/link/google", authenticateNavigation("google-link"), (req, res, next) => {
  const { state, nonce } = signOAuthState("google-link", { userId: req.user!.id });
  res.cookie(LINK_STATE_COOKIE, nonce, { ...stateCookieOptions(LINK_CALLBACK_PATH), maxAge: OAUTH_STATE_TTL_MS });
  const handler = passport.authenticate("google-link", {
    scope: ["profile", "email"],
    state,
    session: false,
  });
  handler(req, res, next);
});

// GET /link/google/callback
authRouter.get(
  "/link/google/callback",
  // Another browser's consent: Google's code is never exchanged, nothing is linked.
  requireOwnState("google-link", LINK_STATE_COOKIE, LINK_CALLBACK_PATH, LINK_FAILED),
  finishGoogleConsent("google-link", LINK_FAILED),
  (req, res) => {
    const user = req.user as { id: string; error?: string };
    if (user.error === "google_taken") {
      res.redirect(`${env.FRONTEND_URL}/auth/link-callback?error=google_taken`);
      return;
    }
    // A user who is gone, or a state that stopped verifying: nothing was linked.
    if (user.error) {
      res.redirect(LINK_FAILED);
      return;
    }
    res.redirect(`${env.FRONTEND_URL}/auth/link-callback?linked=google`);
  },
);

// DELETE /unlink/:method — remove google_id or password_hash (FR-AUTH-04c)
authRouter.delete("/unlink/:method", authenticate, async (req, res) => {
  const method = req.params.method as string;
  if (method !== "google" && method !== "password") {
    throw new AppError("Invalid method. Use 'google' or 'password'.", 400);
  }

  const userId = req.user!.id;
  const found = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (found.length === 0) throw new AppError("User not found.", 404);

  const { passwordHash, googleId } = found[0];
  const wouldHavePassword = method === "password" ? null : passwordHash;
  const wouldHaveGoogle = method === "google" ? null : googleId;

  if (!wouldHavePassword && !wouldHaveGoogle) {
    throw new AppError("Cannot remove your only sign-in method.", 400);
  }

  const updates: { passwordHash?: null; googleId?: null; updatedAt: Date } = { updatedAt: new Date() };
  if (method === "password") updates.passwordHash = null;
  if (method === "google") updates.googleId = null;

  await db.update(users).set(updates).where(eq(users.id, userId));

  const updated = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const u = updated[0];
  res.status(200).json({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    hasPassword: !!u.passwordHash,
    hasGoogle: !!u.googleId,
  });
});
