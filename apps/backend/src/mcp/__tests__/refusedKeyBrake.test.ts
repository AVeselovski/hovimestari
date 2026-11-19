import { CONNECTION_KEY_PREFIX } from "@hovimestari/types";
import { describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import { freezeDate, freshKey, keyMocks, OTHER_KEY_EXPORTS, quietConsole, READ_KEY, SECOND_KEY } from "./harness.js";

// Lifted from finanssiappisV2. The refused-key brake on /mcp counts per
// address and key prefix, with a coarse ceiling per address. A person who
// replaces a key on one computer leaves the old config retrying it, and that
// must not lock the new key out. The limiters are module-level, so this file
// runs its cases in order on one app and one address, on a frozen clock, and
// each case leaves the books as the next expects.

quietConsole();
freezeDate("2026-11-19T10:00:00.000Z");
jest.unstable_mockModule("../../db/index.js", () => ({ db: {} }));
jest.unstable_mockModule("../../lib/connectionKeys.js", () => ({ ...OTHER_KEY_EXPORTS, ...keyMocks() }));

const { app } = await import("../../app.js");
const { ADDRESS_FAILURE_LIMIT, AUTH_FAILURE_LIMIT } = await import("../router.js");

/** A key the app never issued, or whose account is gone: it resolves to nothing, so it counts. */
const GONE_KEY = freshKey();

const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
const post = (key: string) =>
  request(app)
    .post("/mcp")
    .set("Authorization", `Bearer ${key}`)
    .set("Accept", "application/json, text/event-stream")
    .send(ping);

describe("/mcp refused-key brake", () => {
  it("has finanssi's numbers", () => {
    expect([AUTH_FAILURE_LIMIT, ADDRESS_FAILURE_LIMIT]).toEqual([30, 300]);
  });

  it("brakes a key that keeps being refused, and not a new key from the same address", async () => {
    for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) {
      expect((await post(GONE_KEY)).status).toBe(401);
    }
    expect((await post(GONE_KEY)).status).toBe(429);

    // The replacement key on the same computer keeps working.
    expect((await post(READ_KEY)).status).toBe(200);
    expect((await post(SECOND_KEY)).status).toBe(200);
    // And the old key stays braked.
    expect((await post(GONE_KEY)).status).toBe(429);
  });

  it("stops answering an address that rotates keys past the coarse ceiling", async () => {
    // The 30 refusals above are on the address's books (a 429 is not a
    // refusal). Each guess below has its own prefix, so only the ceiling can
    // stop them.
    const guesses = ADDRESS_FAILURE_LIMIT - AUTH_FAILURE_LIMIT;
    const statuses: number[] = [];
    for (let i = 0; i < guesses; i++) {
      const guess = `${CONNECTION_KEY_PREFIX}${i.toString(36).padStart(4, "0")}${"x".repeat(39)}`;
      statuses.push((await post(guess)).status);
    }
    expect(new Set(statuses)).toEqual(new Set([401]));

    const braked = await post(READ_KEY);
    expect(braked.status).toBe(429);
    expect(braked.body).toEqual({
      error: "rate_limited",
      error_description: "Too many failed requests. Try again later.",
    });
  }, 60_000);

  it("answers a braked address before reading its body", async () => {
    // The address is over its ceiling from the case above. Its body is never
    // parsed: a bad one and an oversized one get the brake, not a parse error.
    const bad = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${READ_KEY}`)
      .set("Accept", "application/json, text/event-stream")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(bad.status).toBe(429);
    const big = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${READ_KEY}`)
      .set("Accept", "application/json, text/event-stream")
      .send({ ...ping, params: { pad: "x".repeat(110_000) } });
    expect(big.status).toBe(429);
  });

  it("lifts both brakes once their 15 minutes have passed, and not before", async () => {
    // Every refusal above was counted at the frozen instant, so both windows close together.
    const opened = Date.now();
    jest.setSystemTime(opened + 15 * 60_000 - 1);
    expect((await post(READ_KEY)).status).toBe(429);
    expect((await post(GONE_KEY)).status).toBe(429);
    jest.setSystemTime(opened + 15 * 60_000 + 1);
    expect((await post(READ_KEY)).status).toBe(200);
    // The key that was braked is refused again, as a fresh first refusal.
    const refused = await post(GONE_KEY);
    expect(refused.status).toBe(401);
    expect(refused.headers["ratelimit-remaining"]).toBe(String(AUTH_FAILURE_LIMIT - 1));
  });
});
