import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { browserNonce, enableGoogle } from "../../__tests__/support/google.js";

// GET /auth/google, where the web app's /api/auth/google/start sends the
// browser. The real google strategy builds the consent URL.

enableGoogle();

const { app } = await import("../../app.js");
const { env } = await import("../../lib/env.js");
const { verifyOAuthState } = await import("../../lib/jwt.js");

const FAILED = `${env.FRONTEND_URL}/auth/sign-in?error=google_failed`;

describe("GET /auth/google", () => {
  it("sends the browser to Google with a sign-in state carrying the bind, and sets the state cookie", async () => {
    const { bind } = browserNonce();
    const res = await request(app).get(`/api/v1/auth/google?bind=${bind}`);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.hostname).toBe("accounts.google.com");
    const state = verifyOAuthState("google-sign-in", location.searchParams.get("state") ?? "");
    expect(state?.fields).toEqual({ bind });
    const cookie = ([] as string[])
      .concat(res.headers["set-cookie"] ?? [])
      .find((c) => c.startsWith("google_sign_in_oauth="));
    expect(cookie).toContain(`google_sign_in_oauth=${state?.nonce}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/v1/auth/google/callback");
  });

  it.each([
    ["no bind", ""],
    ["a bind that is not a SHA-256", "?bind=abc"],
  ])("refuses a start with %s", async (_label, query) => {
    const res = await request(app).get(`/api/v1/auth/google${query}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(FAILED);
  });
});
