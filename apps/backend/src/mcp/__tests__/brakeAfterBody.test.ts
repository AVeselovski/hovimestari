import { CONNECTION_KEY_PREFIX } from "@hovimestari/types";
import { describe, expect, it, jest } from "@jest/globals";
import type { Request } from "express";
import request from "supertest";
import { freezeDate, keyMocks, OTHER_KEY_EXPORTS, quietConsole } from "./harness.js";

// Lifted from finanssiappisV2. The refused-key brake keeps its books per
// address and key prefix. A request that dies in body parsing never reaches
// the bearer gate, so it must never reach those books either: a stream of
// bad bodies with made-up prefixes would otherwise fill the store with
// entries that never count.

quietConsole();
freezeDate("2026-11-19T10:00:00.000Z");
jest.unstable_mockModule("../../db/index.js", () => ({ db: {} }));
jest.unstable_mockModule("../../lib/connectionKeys.js", () => ({ ...OTHER_KEY_EXPORTS, ...keyMocks() }));

const { app } = await import("../../app.js");
const { AUTH_FAILURE_LIMIT, authFailureLimiter, refusedKeyOf } = await import("../router.js");

const ACCEPT = "application/json, text/event-stream";
const prefixed = (i: number) => `${CONNECTION_KEY_PREFIX}${i.toString(36).padStart(4, "0")}${"q".repeat(39)}`;
/** The brake's key for a request from supertest's address carrying `key`. */
const booksOf = (key: string) =>
  authFailureLimiter.getKey(
    refusedKeyOf({
      headers: { authorization: `Bearer ${key}` },
      ip: "::ffff:127.0.0.1",
      get: () => undefined,
    } as unknown as Request),
  );

describe("/mcp refused-key brake and bad bodies", () => {
  it("keeps books for a refused key (the control for the checks below)", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${prefixed(0)}`)
      .set("Accept", ACCEPT)
      .send({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(res.status).toBe(401);
    expect(await booksOf(prefixed(0))).toMatchObject({ totalHits: 1 });
  });

  it("opens no books for requests that fail body parsing, and sends no brake headers", async () => {
    for (let i = 1; i <= 40; i++) {
      const res = await request(app)
        .post("/mcp")
        .set("Authorization", `Bearer ${prefixed(i)}`)
        .set("Accept", ACCEPT)
        .set("Content-Type", "application/json")
        .send("{not json");
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(-32700);
      expect(res.headers["ratelimit-remaining"]).toBeUndefined();
      expect(await booksOf(prefixed(i))).toBeUndefined();
    }
  });

  it("opens no books for a body over the limit", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${prefixed(99)}`)
      .set("Accept", ACCEPT)
      .send({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(110_000) } });
    expect(res.status).toBe(413);
    expect(res.headers["ratelimit-remaining"]).toBeUndefined();
    expect(await booksOf(prefixed(99))).toBeUndefined();
  });

  it("leaves a real prefix's budget whole after its bad bodies", async () => {
    for (let i = 0; i < AUTH_FAILURE_LIMIT + 5; i++) {
      const res = await request(app)
        .post("/mcp")
        .set("Authorization", `Bearer ${prefixed(0)}`)
        .set("Content-Type", "application/json")
        .set("Accept", ACCEPT)
        .send("{not json");
      expect(res.status).toBe(400);
    }
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${prefixed(0)}`)
      .set("Accept", ACCEPT)
      .send({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(res.status).toBe(401);
    // The one refusal from the first case and this one.
    expect(res.headers["ratelimit-remaining"]).toBe(String(AUTH_FAILURE_LIMIT - 2));
  });
});
