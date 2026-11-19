import { describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import {
  EXPIRED_KEY,
  freezeDate,
  freshKey,
  keyMocks,
  OTHER_KEY_EXPORTS,
  OTHER_USER_KEY,
  quietConsole,
  READ_KEY,
  REVOKED_KEY,
  SECOND_KEY,
} from "./harness.js";

// Lifted from finanssiappisV2, with the request limit keyed by the key's user
// rather than by the key: every key one user holds shares the 120, so ten
// keys get no more than one. The limiters are module-level, one in-memory
// store per process, so this file runs them in order on one app, on a frozen
// clock: the request limit first, then the brake per address and key prefix,
// which counts refused keys (401) and nothing else. refusedKeyBrake.test.ts
// covers how the prefix splits it. A known key that has expired or been
// revoked is refused but not counted: that is a stale client, not a guess.
// It has its own cap (deadKeyBrake.test.ts). On a 401 the
// RateLimit-Remaining header is the brake's (a 200 carries the request
// limit's): what the brake has on its books for the address and that key,
// the request in flight included.

quietConsole();
freezeDate("2026-11-19T10:00:00.000Z");
jest.unstable_mockModule("../../db/index.js", () => ({ db: {} }));
jest.unstable_mockModule("../../lib/connectionKeys.js", () => ({ ...OTHER_KEY_EXPORTS, ...keyMocks() }));

const { app } = await import("../../app.js");
const { AUTH_FAILURE_LIMIT, REQUEST_LIMIT_PER_MINUTE } = await import("../router.js");

const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
const post = (key: string) =>
  request(app)
    .post("/mcp")
    .set("Authorization", `Bearer ${key}`)
    .set("Accept", "application/json, text/event-stream")
    .send(ping);

describe("/mcp rate limits", () => {
  it("allows 120 requests a minute per user, shared by the user's keys, and answers the 121st with 429", async () => {
    expect(REQUEST_LIMIT_PER_MINUTE).toBe(120);
    // Half on each of the user's two keys.
    for (let i = 0; i < REQUEST_LIMIT_PER_MINUTE; i++) {
      expect((await post(i % 2 === 0 ? READ_KEY : SECOND_KEY)).status).toBe(200);
    }
    for (const key of [READ_KEY, SECOND_KEY]) {
      const limited = await post(key);
      expect(limited.status).toBe(429);
      expect(limited.body).toEqual({
        error: "rate_limited",
        error_description: "Too many requests. Try again in a minute.",
      });
      expect(limited.headers["retry-after"]).toBeDefined();
      expect(limited.headers["ratelimit-limit"]).toBe(String(REQUEST_LIMIT_PER_MINUTE));
    }

    // The limit is per user: another user's key is unaffected.
    expect((await post(OTHER_USER_KEY)).status).toBe(200);
  }, 60_000);

  it("refills the request limit once its minute has passed, and not before", async () => {
    // The 120 above opened the user's window at the frozen instant.
    const opened = Date.now();
    jest.setSystemTime(opened + 60_000 - 1);
    expect((await post(READ_KEY)).status).toBe(429);
    expect((await post(OTHER_USER_KEY)).status).toBe(200);
    jest.setSystemTime(opened + 60_000 + 1);
    expect((await post(READ_KEY)).status).toBe(200);
    expect((await post(SECOND_KEY)).status).toBe(200);
  });

  it("does not brake an address for a legacy client's normal 405s, or for a user's own 429", async () => {
    // The 429s above are on the books for the user, not for the address.
    for (let i = 0; i < AUTH_FAILURE_LIMIT + 10; i++) {
      const res = await request(app)
        .get("/mcp")
        .set("Authorization", `Bearer ${OTHER_USER_KEY}`)
        .set("Accept", "application/json, text/event-stream");
      expect(res.status).toBe(405);
    }
    expect((await post(OTHER_USER_KEY)).status).toBe(200);
  });

  it("keeps a known key that has expired or been revoked off the refused-key books", async () => {
    for (let i = 0; i < AUTH_FAILURE_LIMIT + 10; i++) {
      const res = await post(EXPIRED_KEY);
      expect(res.status).toBe(401);
      expect(res.body.error_description).toBe("This key has expired. Create a new one in Settings.");
      // Nothing is on the books but this request itself.
      expect(res.headers["ratelimit-remaining"]).toBe(String(AUTH_FAILURE_LIMIT - 1));
    }
    for (let i = 0; i < 5; i++) {
      expect((await post(REVOKED_KEY)).status).toBe(401);
    }
    expect((await post(OTHER_USER_KEY)).status).toBe(200);
  });

  it("counts a request with no key, which is what a guess looks like too", async () => {
    const res = await request(app).post("/mcp").set("Accept", "application/json, text/event-stream").send(ping);
    expect(res.status).toBe(401);
    expect(res.headers["ratelimit-remaining"]).toBe(String(AUTH_FAILURE_LIMIT - 1));
    // It stayed on the books: the next request with no key sees it.
    const again = await request(app).post("/mcp").set("Accept", "application/json, text/event-stream").send(ping);
    expect(again.headers["ratelimit-remaining"]).toBe(String(AUTH_FAILURE_LIMIT - 2));
  });

  it("stops answering a key after 30 refusals from one address in 15 minutes", async () => {
    const unknown = freshKey();
    for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) {
      expect((await post(unknown)).status).toBe(401);
    }
    const braked = await post(unknown);
    expect(braked.status).toBe(429);
    expect(braked.body).toEqual({
      error: "rate_limited",
      error_description: "Too many failed requests. Try again later.",
    });
  });
});
