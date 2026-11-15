import { describe, expect, it, jest } from "@jest/globals";
import { createHmac, randomBytes } from "node:crypto";
import request from "supertest";

// A Google link state in the format signed before the shared OAuth state
// (an HMAC over `${userId}:${nonce}:${expiresAt}`, with no purpose) is what a
// consent started before a deploy brings back after it, with its nonce in the
// link cookie. It must end on the link page's error, never a 500 and never
// "linked". Google's code exchange and profile are stubbed, so a state that got
// past the callback's check would reach the real google-link strategy.

const unreachable = () => {
  throw new Error("the database must not be reached");
};
jest.unstable_mockModule("../../db/index.js", () => ({
  db: { select: unreachable, insert: unreachable, update: unreachable, delete: unreachable, transaction: unreachable },
}));

const { app } = await import("../../app.js");
const { env } = await import("../../lib/env.js");
const passport = (await import("passport")).default;

const USER_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

/** A link state as the earlier signLinkState made it. */
const NONCE = randomBytes(16).toString("hex");
function oldLinkState(): string {
  const nonce = NONCE;
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const sig = createHmac("sha256", env.JWT_ACCESS_SECRET).update(`${USER_ID}:${nonce}:${expiresAt}`).digest("hex");
  return Buffer.from(JSON.stringify({ userId: USER_ID, nonce, expiresAt, sig })).toString("base64url");
}

describe("GET /auth/link/google/callback with a state in the earlier format", () => {
  it("redirects to the link page's error and links nothing", async () => {
    const strategy = (passport as unknown as { _strategy: (name: string) => Record<string, unknown> })._strategy(
      "google-link",
    );
    strategy._oauth2 = {
      getOAuthAccessToken: (_code: string, _params: unknown, cb: (...args: unknown[]) => void) =>
        cb(null, "access", "refresh", {}),
    };
    strategy.userProfile = (_token: string, done: (err: unknown, profile: unknown) => void) =>
      done(null, { id: "google-1", emails: [{ value: "owner@example.com" }] });

    const res = await request(app)
      .get(`/api/v1/auth/link/google/callback?code=c&state=${encodeURIComponent(oldLinkState())}`)
      .set("Cookie", `google_link_oauth=${NONCE}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${env.FRONTEND_URL}/auth/link-callback?error=google_failed`);
  });
});
