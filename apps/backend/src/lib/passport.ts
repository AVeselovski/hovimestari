import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { db } from "../db/index.js";
import { users } from "../db/schema/index.js";
import type { GoogleConfig } from "./google.js";

/**
 * What the Google strategies hand the callback routes in `req.user`. Passport's
 * `done` only takes an `Express.User`, so an outcome other than a user rides
 * in `error`, and the callback checks it before anything is issued.
 */
export interface GoogleOutcome {
  id: string;
  /** The Google account the consent returned, on the link strategy. */
  googleId?: string;
  error?: "email_taken" | "email_unverified";
}

/**
 * Whether Google has verified the profile's email address. An unverified
 * address could claim someone else's address here and block its real owner
 * from signing up with it, so sign-in refuses it wherever it would match or
 * create an account by address.
 */
export function googleEmailVerified(profile: Profile): boolean {
  const json = (profile as { _json?: { email_verified?: unknown } })._json;
  return json?.email_verified === true || profile.emails?.[0]?.verified === true;
}

/** The scope both flows ask Google for. */
export const GOOGLE_SCOPE = ["profile", "email"];

/**
 * Sign-in: finds the account by Google id, refuses an email that belongs to
 * an account Google is not linked to, and otherwise creates a Google-only
 * account. It never links Google to an existing account: that would let
 * whoever controls a Google login with the same address take over a password
 * account without its owner's consent.
 */
export async function signInWithGoogle(profile: Profile): Promise<GoogleOutcome> {
  const googleId = profile.id;
  const email = profile.emails?.[0]?.value?.trim().toLowerCase();

  const byGoogleId = await db.select({ id: users.id }).from(users).where(eq(users.googleId, googleId)).limit(1);
  if (byGoogleId.length > 0) return { id: byGoogleId[0].id };

  if (!email) throw new Error("No email from Google");
  // Only the paths that match or create an account by address read it, so only they need it verified.
  if (!googleEmailVerified(profile)) return { id: "", error: "email_unverified" };

  const byEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (byEmail.length > 0) return { id: "", error: "email_taken" };

  const inserted = await db.insert(users).values({ email, googleId, passwordHash: null }).returning({ id: users.id });
  return { id: inserted[0].id };
}

/**
 * Registers the "google" (sign-in) and "google-link" strategies. Called only
 * when this deployment has Google configured.
 *
 * The link strategy writes nothing. It only reports which Google account the
 * consent returned. The link is made by POST /auth/link/google/exchange, once
 * the web server proves the browser that finishes the flow is the one that
 * started it.
 */
export function registerGoogleStrategies(config: GoogleConfig): void {
  passport.use(
    "google",
    new GoogleStrategy(
      { clientID: config.clientID, clientSecret: config.clientSecret, callbackURL: config.callbackURL },
      (_accessToken, _refreshToken, profile, done) => {
        signInWithGoogle(profile).then(
          (outcome) => done(null, outcome as Express.User),
          (err: unknown) => done(err as Error, undefined),
        );
      },
    ),
  );

  passport.use(
    "google-link",
    new GoogleStrategy(
      { clientID: config.clientID, clientSecret: config.clientSecret, callbackURL: config.linkCallbackURL },
      (_accessToken, _refreshToken, profile, done) => {
        // Linking stores only the Google id, never the address, so it needs no verified email.
        const outcome: GoogleOutcome = { id: "", googleId: profile.id };
        done(null, outcome as Express.User);
      },
    ),
  );
}

/**
 * The URL of Google's consent screen for `strategy`, carrying `state`. Built
 * by the strategy itself, as its redirect would be, so the URL and the
 * strategy's callback can never disagree.
 */
export function googleConsentUrl(strategy: "google" | "google-link", state: string, req: Request): Promise<string> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    const capture = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = String(value);
      },
      end() {
        if (headers.location) resolve(headers.location);
        else reject(new Error(`The ${strategy} strategy did not redirect.`));
      },
    } as unknown as Response;
    passport.authenticate(strategy, { scope: GOOGLE_SCOPE, state, session: false })(req, capture, (err?: unknown) =>
      reject(err ?? new Error(`The ${strategy} strategy did not redirect.`)),
    );
  });
}
