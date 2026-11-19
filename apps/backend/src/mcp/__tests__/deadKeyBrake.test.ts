import { describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import {
  EXPIRED_KEY,
  freezeDate,
  keyMocks,
  OTHER_KEY_EXPORTS,
  quietConsole,
  READ_KEY,
  REVOKED_KEY,
} from "./harness.js";

// Lifted from finanssiappisV2. A known key that has expired or been revoked
// does not count toward the refused-key brake, so a stale client is never
// mistaken for a guesser. It has a cap of its own per address and key prefix
// instead, generous enough that a client retrying on launch never meets it,
// so a dead key cannot be used to send unlimited requests, while a new key on
// the same computer keeps working. The limiters are module-level, so the
// cases run in order on one app and one address, on a frozen clock.

quietConsole();
freezeDate("2026-11-19T10:00:00.000Z");
const keys = keyMocks();
jest.unstable_mockModule("../../db/index.js", () => ({ db: {} }));
jest.unstable_mockModule("../../lib/connectionKeys.js", () => ({ ...OTHER_KEY_EXPORTS, ...keys }));

const { app } = await import("../../app.js");
const { AUTH_FAILURE_LIMIT, DEAD_KEY_LIMIT } = await import("../router.js");

const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
const post = (key: string) =>
  request(app)
    .post("/mcp")
    .set("Authorization", `Bearer ${key}`)
    .set("Accept", "application/json, text/event-stream")
    .send(ping);

describe("/mcp dead-key cap", () => {
  it("is far above the refused-key brake", () => {
    expect(DEAD_KEY_LIMIT).toBe(300);
    expect(DEAD_KEY_LIMIT).toBeGreaterThanOrEqual(10 * AUTH_FAILURE_LIMIT);
  });

  it("answers a known dead key 401 up to the cap, then 429", async () => {
    const statuses = new Set<number>();
    for (let i = 0; i < DEAD_KEY_LIMIT; i++) {
      statuses.add((await post(EXPIRED_KEY)).status);
    }
    expect(statuses).toEqual(new Set([401]));

    const capped = await post(EXPIRED_KEY);
    expect(capped.status).toBe(429);
    expect(capped.body).toEqual({
      error: "rate_limited",
      error_description: "This key no longer works. Create a new one in Settings.",
    });
    expect(keys.lookupConnectionKey).toHaveBeenCalledTimes(DEAD_KEY_LIMIT);
    // Three hundred requests in a row: slower than the default five seconds on a busy machine.
  }, 60_000);

  it("holds only that key: a new key from the same address keeps working", async () => {
    expect((await post(READ_KEY)).status).toBe(200);
    expect((await post(EXPIRED_KEY)).status).toBe(429);
  });

  it("keeps a separate budget for another dead key", async () => {
    const revoked = await post(REVOKED_KEY);
    expect(revoked.status).toBe(401);
    expect(revoked.body.error_description).toBe("This key was revoked.");
  });

  it("lifts the cap once its 15 minutes have passed, and not before", async () => {
    // Every request on the cap's books was counted at the frozen instant.
    const opened = Date.now();
    jest.setSystemTime(opened + 15 * 60_000 - 1);
    expect((await post(EXPIRED_KEY)).status).toBe(429);
    jest.setSystemTime(opened + 15 * 60_000 + 1);
    const refused = await post(EXPIRED_KEY);
    expect(refused.status).toBe(401);
    expect(refused.body.error_description).toBe("This key has expired. Create a new one in Settings.");
  });
});
