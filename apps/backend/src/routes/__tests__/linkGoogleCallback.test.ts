import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

// GET /auth/link/google/callback trusts a state only from the browser that
// started the link: the one holding the state's nonce in its google_link_oauth
// cookie. Without it, Google's code is never exchanged and nothing is linked,
// so a consent URL sent to someone else cannot link their Google account to
// the sender. The real google-link strategy runs, with Google's code exchange
// and profile stubbed.

const mockSelect = jest.fn();
const mockUpdate = jest.fn();
const unreachable = () => {
  throw new Error("unexpected database call");
};
jest.unstable_mockModule("../../db/index.js", () => ({
  db: { select: mockSelect, update: mockUpdate, insert: unreachable, delete: unreachable, transaction: unreachable },
}));

const { app } = await import("../../app.js");
const { env } = await import("../../lib/env.js");
const { signOAuthState } = await import("../../lib/jwt.js");
const passport = (await import("passport")).default;

const USER_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const LINKED = `${env.FRONTEND_URL}/auth/link-callback?linked=google`;
const FAILED = `${env.FRONTEND_URL}/auth/link-callback?error=google_failed`;

const exchange = jest.fn((_code: string, _params: unknown, cb: (...args: unknown[]) => void) =>
  cb(null, "access", "refresh", {}),
);
const strategy = (passport as unknown as { _strategy: (name: string) => Record<string, unknown> })._strategy(
  "google-link",
);
strategy._oauth2 = { getOAuthAccessToken: exchange };
strategy.userProfile = (_token: string, done: (err: unknown, profile: unknown) => void) =>
  done(null, { id: "google-1", emails: [{ value: "owner@example.com" }] });

/** One select().from().where().limit() resolving to `rows`. */
function selectOnce(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = async () => rows;
  mockSelect.mockReturnValueOnce(chain);
}

const callback = (state: string, cookie?: string) => {
  const req = request(app).get(`/api/v1/auth/link/google/callback?code=c&state=${encodeURIComponent(state)}`);
  return cookie === undefined ? req : req.set("Cookie", cookie);
};

const cleared = (res: { headers: Record<string, unknown> }) =>
  ([] as string[])
    .concat((res.headers["set-cookie"] as string[] | undefined) ?? [])
    .some((c) => c.startsWith("google_link_oauth=;") && c.includes("Path=/api/v1/auth/link/google/callback"));

beforeEach(() => {
  mockSelect.mockReset();
  mockUpdate.mockReset();
  exchange.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /auth/link/google/callback", () => {
  it("links the Google account when the browser holds the state's cookie, and clears the cookie", async () => {
    selectOnce([]); // nobody else has this Google id
    selectOnce([{ id: USER_ID }]); // the user still exists
    const where = jest.fn(async () => undefined);
    mockUpdate.mockReturnValueOnce({ set: () => ({ where }) });
    const { state, nonce } = signOAuthState("google-link", { userId: USER_ID });

    const res = await callback(state, `other=1; google_link_oauth=${nonce}`);

    expect(res.headers.location).toBe(LINKED);
    expect(where).toHaveBeenCalledTimes(1);
    expect(cleared(res)).toBe(true);
  });

  it.each([
    ["no cookie", undefined],
    ["another link's cookie", "google_link_oauth=0123456789abcdef0123456789abcdef"],
    ["an empty cookie", "google_link_oauth="],
  ])("refuses a good state that arrives with %s, and links nothing", async (_label, cookie) => {
    const res = await callback(signOAuthState("google-link", { userId: USER_ID }).state, cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(FAILED);
    expect(exchange).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(cleared(res)).toBe(true);
  });

  it("refuses a Drive state with its nonce in the link cookie", async () => {
    const { state, nonce } = signOAuthState("drive", { userId: USER_ID, vaultId: USER_ID });
    const res = await callback(state, `google_link_oauth=${nonce}`);
    expect(res.headers.location).toBe(FAILED);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("refuses a forged state", async () => {
    const res = await callback("forged", "google_link_oauth=forged");
    expect(res.headers.location).toBe(FAILED);
    expect(exchange).not.toHaveBeenCalled();
    expect(cleared(res)).toBe(true);
  });

  it("sends a code exchange Google refuses to the link's error page, and links nothing", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    exchange.mockImplementationOnce((_code, _params, cb) =>
      cb({ statusCode: 401, data: JSON.stringify({ error: "invalid_client", error_description: "Unauthorized" }) }),
    );
    const { state, nonce } = signOAuthState("google-link", { userId: USER_ID });

    const res = await callback(state, `google_link_oauth=${nonce}`);

    expect(exchange).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(FAILED);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(cleared(res)).toBe(true);
    expect(log).toHaveBeenCalledWith("[auth] google-link callback failed: TokenError invalid_client");
  });
});
