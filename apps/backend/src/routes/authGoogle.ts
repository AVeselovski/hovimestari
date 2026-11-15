import { GoogleExchangeBodySchema, GoogleLinkStartBodySchema } from "@hovimestari/types";
import { and, eq, isNull } from "drizzle-orm";
import { Router, type Router as IRouter, type RequestHandler } from "express";
import passport from "passport";
import { db } from "../db/index.js";
import { users } from "../db/schema/index.js";
import { env } from "../lib/env.js";
import { appError } from "../lib/errors.js";
import { failureOf } from "../lib/failureOf.js";
import { googleEnabled } from "../lib/google.js";
import { OAUTH_STATE_TTL_MS, signOAuthState, verifyOAuthState, type OAuthStatePurpose } from "../lib/jwt.js";
import { cookieValue, nonceMatches, stateCookieOptions } from "../lib/oauthStateCookie.js";
import { issueOneTimeCode, nonceMatchesBind, redeemOneTimeCode } from "../lib/oneTimeCodes.js";
import { parseBody } from "../lib/parseBody.js";
import { GOOGLE_SCOPE, googleConsentUrl, type GoogleOutcome } from "../lib/passport.js";
import { isUniqueViolation } from "../lib/pgErrors.js";
import { issueSession } from "../lib/sessions.js";
import { findUser } from "../lib/users.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireBff } from "../middleware/requireBff.js";

// ---------------------------------------------------------------------------
// Google, for signing in and for linking a Google account. Both flows are
// bound to the browser that started them by a nonce the web server keeps in
// an httpOnly cookie: the start sends its SHA-256 (`bind`) into the signed
// OAuth state, the callback hands the web server a one-time code bound to it,
// and the exchange requires the nonce itself. No token ever rides in a URL,
// and a code made by finishing a flow in one browser is useless in another.
// ---------------------------------------------------------------------------

export const googleRouter: IRouter = Router();

/** The SHA-256 of the web app's nonce, in hex. */
const BIND = /^[0-9a-f]{64}$/;

const requireGoogle: RequestHandler = (_req, _res, next) => {
  if (!googleEnabled()) throw appError("google_unavailable", 404);
  next();
};

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

/** The state Google returned, verified for `purpose`, or null. */
const stateOf = (purpose: OAuthStatePurpose, query: unknown) =>
  verifyOAuthState(purpose, typeof query === "string" ? query : "");

// ---------------------------------------------------------------------------
// Signing in with Google
// ---------------------------------------------------------------------------

// The backend's own state cookie ties Google's answer to the browser that went
// to Google. The web app's nonce, carried as `bind`, ties the finished sign-in
// to the browser that started it.
const SIGN_IN_STATE_COOKIE = "google_sign_in_oauth";
const SIGN_IN_CALLBACK_PATH = "/api/v1/auth/google/callback";
const signInFailed = (code: "google_failed" | "google_email_taken" | "google_email_unverified" = "google_failed") =>
  `${env.FRONTEND_URL}/auth/sign-in?error=${code}`;

// GET /google?bind=. The web app's /api/auth/google/start sends the browser here.
googleRouter.get("/google", requireGoogle, (req, res, next) => {
  const bind = req.query.bind;
  if (typeof bind !== "string" || !BIND.test(bind)) {
    res.redirect(signInFailed());
    return;
  }
  const { state, nonce } = signOAuthState("google-sign-in", { bind });
  res.cookie(SIGN_IN_STATE_COOKIE, nonce, { ...stateCookieOptions(SIGN_IN_CALLBACK_PATH), maxAge: OAUTH_STATE_TTL_MS });
  passport.authenticate("google", { scope: GOOGLE_SCOPE, state, session: false })(req, res, next);
});

/**
 * The sign-in callback's check that the consent started in this browser: the
 * signed state is a sign-in's, and the browser's state cookie holds its
 * nonce. Otherwise Google's code is never exchanged and the flow fails. The
 * cookie has served either way, so it is cleared on every outcome.
 */
const requireOwnSignInState: RequestHandler = (req, res, next) => {
  const state = stateOf("google-sign-in", req.query.state);
  const cookie = cookieValue(req.headers.cookie, SIGN_IN_STATE_COOKIE);
  res.clearCookie(SIGN_IN_STATE_COOKIE, stateCookieOptions(SIGN_IN_CALLBACK_PATH));
  if (!state || !nonceMatches(state.nonce, cookie) || !BIND.test(state.fields.bind ?? "")) {
    res.redirect(signInFailed());
    return;
  }
  res.locals.bind = state.fields.bind;
  next();
};

// GET /google/callback. Hands the web server a one-time code, never a token.
googleRouter.get(
  "/google/callback",
  requireGoogle,
  requireOwnSignInState,
  finishGoogleConsent("google", signInFailed()),
  (req, res) => {
    const outcome = req.user as GoogleOutcome;
    if (outcome.error === "email_taken") {
      res.redirect(signInFailed("google_email_taken"));
      return;
    }
    if (outcome.error === "email_unverified") {
      res.redirect(signInFailed("google_email_unverified"));
      return;
    }
    const code = issueOneTimeCode("google-sign-in", { userId: outcome.id, bind: res.locals.bind as string });
    res.redirect(`${env.FRONTEND_URL}/api/auth/google/complete?code=${encodeURIComponent(code)}`);
  },
);

// POST /google/exchange. The web server trades the code and its browser's nonce for a session.
googleRouter.post("/google/exchange", requireBff, async (req, res) => {
  const { code, nonce } = parseBody(GoogleExchangeBodySchema, req.body);
  // A well-formed exchange spends the code, whatever the outcome. A body without a nonce is refused before this.
  const grant = redeemOneTimeCode(code, "google-sign-in");
  if (!grant || !nonceMatchesBind(nonce, grant.bind)) throw appError("google_failed", 401);
  const user = await findUser(grant.userId);
  if (!user) throw appError("google_failed", 401);
  res.status(200).json(await issueSession(user));
});

// ---------------------------------------------------------------------------
// Linking Google to the signed-in account
// ---------------------------------------------------------------------------

const linkResult = (result: "failed") => `${env.FRONTEND_URL}/settings?google=${result}`;

// POST /link/google/start. The web server relays the user's bearer and the hash of its nonce.
googleRouter.post("/link/google/start", authenticate, requireBff, requireGoogle, async (req, res) => {
  const { bind } = parseBody(GoogleLinkStartBodySchema, req.body);
  const user = await findUser(req.user!.id);
  if (!user) throw appError("user_not_found", 404);
  if (user.googleId) throw appError("google_already_linked", 409);
  const { state } = signOAuthState("google-link", { userId: user.id, bind });
  const url = await googleConsentUrl("google-link", state, req);
  res.set("Cache-Control", "no-store");
  res.status(200).json({ url });
});

// GET /link/google/callback. Learns which Google account consented, links nothing, and hands the web server a code.
googleRouter.get(
  "/link/google/callback",
  requireGoogle,
  (req, res, next) => {
    const state = stateOf("google-link", req.query.state);
    if (!state?.fields.userId || !BIND.test(state.fields.bind ?? "")) {
      res.redirect(linkResult("failed"));
      return;
    }
    res.locals.userId = state.fields.userId;
    res.locals.bind = state.fields.bind;
    next();
  },
  finishGoogleConsent("google-link", linkResult("failed")),
  (req, res) => {
    const { googleId } = req.user as GoogleOutcome;
    if (!googleId) {
      res.redirect(linkResult("failed"));
      return;
    }
    const code = issueOneTimeCode("google-link", {
      userId: res.locals.userId as string,
      bind: res.locals.bind as string,
      googleId,
    });
    res.redirect(`${env.FRONTEND_URL}/api/auth/google/link/complete?code=${encodeURIComponent(code)}`);
  },
);

// POST /link/google/exchange. Links the code's Google account to the code's user, for the browser that started it.
googleRouter.post("/link/google/exchange", requireBff, async (req, res) => {
  const { code, nonce } = parseBody(GoogleExchangeBodySchema, req.body);
  const grant = redeemOneTimeCode(code, "google-link");
  if (!grant?.googleId || !nonceMatchesBind(nonce, grant.bind)) throw appError("google_failed", 401);
  const { userId, googleId } = grant;

  const [holder] = await db.select({ id: users.id }).from(users).where(eq(users.googleId, googleId)).limit(1);
  if (holder && holder.id !== userId) throw appError("google_taken", 409);

  const user = await findUser(userId);
  if (!user) throw appError("google_failed", 401);
  if (user.googleId === googleId) {
    res.status(204).send();
    return;
  }
  if (user.googleId) throw appError("google_already_linked", 409);

  try {
    const linked = await db
      .update(users)
      .set({ googleId, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.googleId)))
      .returning({ id: users.id });
    if (linked.length === 0) throw appError("google_already_linked", 409);
  } catch (err) {
    if (isUniqueViolation(err, "users_google_id_unique")) throw appError("google_taken", 409);
    throw err;
  }
  res.status(204).send();
});
