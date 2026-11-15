import { eq } from "drizzle-orm";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "../db/index.js";
import { users } from "../db/schema/index.js";
import { env } from "./env.js";
import { verifyOAuthState } from "./jwt.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value;
        const displayName = profile.displayName?.trim() || (email ? email.split("@")[0] : "User");

        // 1. Look up by googleId
        const byGoogleId = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);

        if (byGoogleId.length > 0) {
          return done(null, { id: byGoogleId[0].id });
        }

        // 2. Look up by email — only allow login if this Google account is already linked
        if (email) {
          const byEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);

          if (byEmail.length > 0) {
            const existingUser = byEmail[0];
            if (!existingUser.googleId) {
              // An account with this email exists but Google is not linked to it.
              // Do NOT auto-link — that would allow anyone with Google access to hijack
              // an email+password account without consent.
              // Error signalling via user object — Passport done() only accepts Express.User;
              // this error is detected in the callback route before issueTokens() is called.
              return done(null, { id: "", error: "email_taken" } as unknown as Express.User);
            }
            return done(null, { id: existingUser.id });
          }
        }

        // 3. Create new user
        if (!email) {
          return done(new Error("No email from Google"), undefined);
        }

        const inserted = await db
          .insert(users)
          .values({
            email,
            displayName,
            googleId,
            passwordHash: null,
          })
          .returning();

        return done(null, { id: inserted[0].id });
      } catch (err) {
        return done(err as Error, undefined);
      }
    },
  ),
);

// "google-link" strategy — links a Google account to an already-authenticated user.
// The authenticated user's id rides in the OAuth `state`, signed for "google-link" (lib/jwt.ts signOAuthState).
passport.use(
  "google-link",
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_LINK_CALLBACK_URL,
      passReqToCallback: true,
    },
    async (
      req: Express.Request,
      _accessToken: string,
      _refreshToken: string,
      profile: { id: string },
      done: (err: Error | null, user?: Express.User | false) => void,
    ) => {
      try {
        const stateParam = (req as unknown as { query: Record<string, string> }).query.state ?? "";
        const userId = verifyOAuthState("google-link", stateParam)?.fields.userId;
        if (!userId) {
          // Error signalling via user object — Passport done() only accepts Express.User;
          // this error is detected in the callback route before issueTokens() is called.
          return done(null, { id: "", error: "invalid_state" } as unknown as Express.User);
        }

        const googleId = profile.id;

        // Check if another user already owns this googleId
        const byGoogleId = await db.select({ id: users.id }).from(users).where(eq(users.googleId, googleId)).limit(1);
        if (byGoogleId.length > 0 && byGoogleId[0].id !== userId) {
          // Error signalling via user object — Passport done() only accepts Express.User;
          // this error is detected in the callback route before issueTokens() is called.
          return done(null, { id: "", error: "google_taken" } as unknown as Express.User);
        }

        // Verify the requesting user still exists
        const requester = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
        if (requester.length === 0) {
          // Error signalling via user object — Passport done() only accepts Express.User;
          // this error is detected in the callback route before issueTokens() is called.
          return done(null, { id: "", error: "user_not_found" } as unknown as Express.User);
        }

        // Link the Google account
        await db.update(users).set({ googleId, updatedAt: new Date() }).where(eq(users.id, userId));
        return done(null, { id: userId });
      } catch (err) {
        return done(err as Error, undefined);
      }
    },
  ),
);
