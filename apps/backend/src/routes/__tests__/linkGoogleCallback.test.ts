import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import { browserNonce, enableGoogle } from "../../__tests__/support/google.js";

// GET /auth/link/google/callback learns which Google account consented and
// links nothing. It hands the web server a one-time code bound to the user,
// the Google id and the starting browser's bind, and only
// POST /auth/link/google/exchange, with that browser's nonce, makes the link.
// The real google-link strategy runs, with Google's code exchange and profile
// stubbed. The database throws on any use: the callback must not touch it.

enableGoogle();

const unreachable = () => {
  throw new Error("the link callback must not touch the database");
};
jest.unstable_mockModule("../../db/index.js", () => ({
  db: { select: unreachable, update: unreachable, insert: unreachable, delete: unreachable, transaction: unreachable },
}));

const { app } = await import("../../app.js");
const { env } = await import("../../lib/env.js");
const { signOAuthState } = await import("../../lib/jwt.js");
const { redeemOneTimeCode } = await import("../../lib/oneTimeCodes.js");
const passport = (await import("passport")).default;

const USER_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const FAILED = `${env.FRONTEND_URL}/settings?google=failed`;
const COMPLETE = `${env.FRONTEND_URL}/api/auth/google/link/complete?code=`;

const exchange = jest.fn((_code: string, _params: unknown, cb: (...args: unknown[]) => void) =>
  cb(null, "access", "refresh", {}),
);
const strategy = (passport as unknown as { _strategy: (name: string) => Record<string, unknown> })._strategy(
  "google-link",
);
strategy._oauth2 = { getOAuthAccessToken: exchange };
let verified = true;
strategy.userProfile = (_token: string, done: (err: unknown, profile: unknown) => void) =>
  done(null, { id: "google-1", emails: [{ value: "owner@example.com", verified }] });

const callback = (state: string) =>
  request(app).get(`/api/v1/auth/link/google/callback?code=c&state=${encodeURIComponent(state)}`);

beforeEach(() => {
  exchange.mockClear();
  verified = true;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /auth/link/google/callback", () => {
  it("issues a link code for the state's user, the consenting Google id and the bind, and links nothing", async () => {
    const { bind } = browserNonce();
    const { state } = signOAuthState("google-link", { userId: USER_ID, bind });

    const res = await callback(state);

    expect(res.status).toBe(302);
    const location = res.headers.location as string;
    expect(location.startsWith(COMPLETE)).toBe(true);
    const code = decodeURIComponent(location.slice(COMPLETE.length));
    expect(redeemOneTimeCode(code, "google-link")).toEqual({ userId: USER_ID, bind, googleId: "google-1" });
  });

  it("links a Google account whose email Google has not verified: linking stores only the Google id", async () => {
    verified = false;
    const { bind } = browserNonce();
    const { state } = signOAuthState("google-link", { userId: USER_ID, bind });
    const res = await callback(state);
    const location = res.headers.location as string;
    expect(location.startsWith(COMPLETE)).toBe(true);
    const code = decodeURIComponent(location.slice(COMPLETE.length));
    expect(redeemOneTimeCode(code, "google-link")).toEqual({ userId: USER_ID, bind, googleId: "google-1" });
  });

  it("refuses a sign-in state, and exchanges no code", async () => {
    const { state } = signOAuthState("google-sign-in", { bind: browserNonce().bind });
    const res = await callback(state);
    expect(res.headers.location).toBe(FAILED);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("refuses a link state without a bind", async () => {
    const { state } = signOAuthState("google-link", { userId: USER_ID });
    const res = await callback(state);
    expect(res.headers.location).toBe(FAILED);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("refuses a forged state", async () => {
    const res = await callback("forged");
    expect(res.headers.location).toBe(FAILED);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("sends a code exchange Google refuses to the settings page's failure, and issues no code", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    exchange.mockImplementationOnce((_code, _params, cb) =>
      cb({ statusCode: 401, data: JSON.stringify({ error: "invalid_client", error_description: "Unauthorized" }) }),
    );
    const { state } = signOAuthState("google-link", { userId: USER_ID, bind: browserNonce().bind });

    const res = await callback(state);

    expect(exchange).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(FAILED);
    expect(log).toHaveBeenCalledWith("[auth] google-link callback failed: TokenError invalid_client");
  });
});
