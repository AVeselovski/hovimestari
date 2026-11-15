import { describe, expect, it, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { browserNonce, enableGoogle } from "../../__tests__/support/google.js";

// ---------------------------------------------------------------------------
// Mock passport so we can control what req.user looks like after the OAuth
// exchange, without needing a real Google authorization code.
// ---------------------------------------------------------------------------

enableGoogle();

type AuthenticateMiddleware = (req: Request, res: Response, next: NextFunction) => void;

const makePassportAuthenticateMock =
  (user: { id: string; error?: string }): AuthenticateMiddleware =>
  (_req: Request & { user?: unknown }, _res: Response, next: NextFunction) => {
    (_req as Request & { user?: unknown }).user = user;
    next();
  };

let passportAuthenticateMock = makePassportAuthenticateMock({ id: "user-id-123" });

jest.unstable_mockModule("passport", () => ({
  default: {
    use: jest.fn(),
    initialize: jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
    authenticate: jest.fn((_strategy: string, _options: unknown) => {
      return (req: Request, res: Response, next: NextFunction) => passportAuthenticateMock(req, res, next);
    }),
  },
}));

const unreachable = () => {
  throw new Error("the sign-in callback must not touch the database");
};
jest.unstable_mockModule("../../db/index.js", () => ({
  db: { select: unreachable, insert: unreachable, update: unreachable, delete: unreachable, transaction: unreachable },
}));

const { app } = await import("../../app.js");
const { env } = await import("../../lib/env.js");
const { signOAuthState } = await import("../../lib/jwt.js");
const { redeemOneTimeCode } = await import("../../lib/oneTimeCodes.js");

const COMPLETE = `${env.FRONTEND_URL}/api/auth/google/complete?code=`;

/** The callback, from the browser that started the sign-in. */
function signInCallback(bind: string) {
  const { state, nonce } = signOAuthState("google-sign-in", { bind });
  return request(app)
    .get(`/api/v1/auth/google/callback?code=fake&state=${encodeURIComponent(state)}`)
    .set("Cookie", `google_sign_in_oauth=${nonce}`);
}

// ---------------------------------------------------------------------------
// GET /api/v1/auth/google/callback
// ---------------------------------------------------------------------------

describe("GET /api/v1/auth/google/callback", () => {
  it("redirects to sign-in with error=google_email_taken when an email-only account tries Google login", async () => {
    passportAuthenticateMock = makePassportAuthenticateMock({ id: "", error: "email_taken" });

    const res = await signInCallback(browserNonce().bind);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${env.FRONTEND_URL}/auth/sign-in?error=google_email_taken`);
  });

  it("redirects to sign-in with error=google_email_unverified when Google has not verified the address", async () => {
    passportAuthenticateMock = makePassportAuthenticateMock({ id: "", error: "email_unverified" });

    const res = await signInCallback(browserNonce().bind);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${env.FRONTEND_URL}/auth/sign-in?error=google_email_unverified`);
  });

  it("hands the web server a one-time code bound to the user and the bind, and no token", async () => {
    const USER_ID = "user-id-abc";
    passportAuthenticateMock = makePassportAuthenticateMock({ id: USER_ID });
    const { bind } = browserNonce();

    const res = await signInCallback(bind);

    expect(res.status).toBe(302);
    const location = res.headers.location as string;
    expect(location.startsWith(COMPLETE)).toBe(true);
    expect(location).not.toMatch(/token/i);
    const code = decodeURIComponent(location.slice(COMPLETE.length));
    expect(redeemOneTimeCode(code, "google-sign-in")).toEqual({ userId: USER_ID, bind });
  });
});
