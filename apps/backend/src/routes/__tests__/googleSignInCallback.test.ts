import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

// GET /auth/google/callback answers every failure with a redirect to the
// sign-in page's Google error, never the API's JSON. The real google strategy
// runs, with Google's code exchange stubbed, so the errors are the ones
// Passport itself raises.
//
// It trusts a state only from the browser that started the sign-in: the one
// holding the state's nonce in its google_sign_in_oauth cookie. Without it,
// Google's code is never exchanged and nobody is signed in, so a callback URL
// from someone else's consent cannot sign this browser into their account.

const unreachable = () => {
  throw new Error("unexpected database call");
};
jest.unstable_mockModule("../../db/index.js", () => ({
  db: { select: unreachable, update: unreachable, insert: unreachable, delete: unreachable, transaction: unreachable },
}));

const { app } = await import("../../app.js");
const { env } = await import("../../lib/env.js");
const { signOAuthState } = await import("../../lib/jwt.js");
const passport = (await import("passport")).default;

const FAILED = `${env.FRONTEND_URL}/auth/sign-in?error=oauth_failed`;

const exchange = jest.fn((_code: string, _params: unknown, cb: (...args: unknown[]) => void) =>
  cb({ statusCode: 400, data: JSON.stringify({ error: "invalid_grant", error_description: "Bad Request" }) }),
);
const strategy = (passport as unknown as { _strategy: (name: string) => Record<string, unknown> })._strategy("google");
strategy._oauth2 = { getOAuthAccessToken: exchange };

let log: ReturnType<typeof jest.spyOn>;

const callback = (query: string, cookie?: string) => {
  const req = request(app).get(`/api/v1/auth/google/callback?${query}`);
  return cookie === undefined ? req : req.set("Cookie", cookie);
};

/** A sign-in state, and the cookie of the browser that started it. */
function started() {
  const { state, nonce } = signOAuthState("google-sign-in", {});
  return { state: encodeURIComponent(state), cookie: `other=1; google_sign_in_oauth=${nonce}` };
}

const cleared = (res: { headers: Record<string, unknown> }) =>
  ([] as string[])
    .concat((res.headers["set-cookie"] as string[] | undefined) ?? [])
    .some((c) => c.startsWith("google_sign_in_oauth=;") && c.includes("Path=/api/v1/auth/google/callback"));

beforeEach(() => {
  exchange.mockClear();
  log = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /auth/google/callback", () => {
  it("sends a code exchange Google refuses to the sign-in page's Google error", async () => {
    const { state, cookie } = started();
    const res = await callback(`code=c&state=${state}`, cookie);

    expect(exchange).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(FAILED);
    expect(log).toHaveBeenCalledWith("[auth] google callback failed: TokenError invalid_grant");
    expect(cleared(res)).toBe(true);
  });

  it("sends a declined consent to the same page, without an exchange", async () => {
    const { state, cookie } = started();
    const res = await callback(`error=access_denied&state=${state}`, cookie);

    expect(exchange).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(FAILED);
    expect(cleared(res)).toBe(true);
  });

  it.each([
    ["no cookie", undefined],
    ["another sign-in's cookie", "google_sign_in_oauth=0123456789abcdef0123456789abcdef"],
    ["an empty cookie", "google_sign_in_oauth="],
  ])("refuses a good state that arrives with %s, and exchanges no code", async (_label, cookie) => {
    const res = await callback(`code=c&state=${started().state}`, cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(FAILED);
    expect(exchange).not.toHaveBeenCalled();
    expect(cleared(res)).toBe(true);
  });

  it("refuses a callback with no state at all", async () => {
    const res = await callback("code=c", started().cookie);
    expect(res.headers.location).toBe(FAILED);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("refuses a link state with its nonce in the sign-in cookie", async () => {
    const { state, nonce } = signOAuthState("google-link", { userId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
    const res = await callback(`code=c&state=${encodeURIComponent(state)}`, `google_sign_in_oauth=${nonce}`);
    expect(res.headers.location).toBe(FAILED);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("refuses a forged state", async () => {
    const res = await callback("code=c&state=forged", "google_sign_in_oauth=forged");
    expect(res.headers.location).toBe(FAILED);
    expect(exchange).not.toHaveBeenCalled();
    expect(cleared(res)).toBe(true);
  });
});
