import { CONNECTION_KEY_PREFIX, MAX_LIVE_CONNECTIONS } from "@hovimestari/types";
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createHash, randomBytes } from "node:crypto";
import { signUp } from "../../__tests__/support/apiUser.js";
import { sessionApi } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Connection keys on a real Postgres: make, list and revoke them under
// /api/v1/connections, the two operator switches, the ten-key limit under two
// transactions that race, and the key's one answer. Expiry is read on the
// database clock, so a key is made expired by moving its expires_at behind
// the database's now(), never by the test machine's date.

type Env = typeof import("../../lib/env.js").env;
type Auth = { Authorization: string };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

await describeWithDb("connections", (suite) => {
  const s = sessionApi(suite);
  let env: Env;
  const api = () => s.api();
  const list = (auth: Auth) => api().get("/api/v1/connections").set(auth);
  const create = (auth: Auth, body: object) => api().post("/api/v1/connections").set(auth).send(body);
  const revoke = (auth: Auth, id: string) => api().delete(`/api/v1/connections/${id}`).set(auth);

  /** Live keys of `userId`, on the database clock. */
  async function liveKeys(userId: string): Promise<number> {
    const { rows } = await suite.client.query(
      "SELECT count(*)::int AS n FROM assistant_connections WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()",
      [userId],
    );
    return rows[0].n as number;
  }

  /** `n` live read keys for `userId`, inserted directly, with hashes of nothing. */
  async function seedKeys(userId: string, n: number): Promise<void> {
    await suite.client.query(
      `INSERT INTO assistant_connections (user_id, name, key_hash, access, expires_at)
         SELECT $1, 'Key ' || i, md5($2 || i::text), 'read', now() + interval '30 days'
           FROM generate_series(1, $3::int) AS i`,
      [userId, randomBytes(8).toString("hex"), n],
    );
  }

  const expire = (id: string) =>
    suite.client.query("UPDATE assistant_connections SET expires_at = now() - interval '1 second' WHERE id = $1", [id]);

  beforeAll(async () => {
    ({ env } = await import("../../lib/env.js"));
  });

  beforeEach(() => {
    // The defaults a deployment gets with neither switch set.
    env.MCP_ENABLED = true;
    env.MCP_WRITES_ENABLED = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("POST /connections", () => {
    it("makes a read key: 201 with the key once, no-store, and only its hash stored", async () => {
      const user = await signUp(suite.client);

      const res = await create(user.auth, { name: "  Claude on my laptop " });

      expect(res.status).toBe(201);
      expect(res.headers["cache-control"]).toBe("no-store");
      const { connection, key } = res.body as { connection: Record<string, unknown>; key: string };
      expect(key).toMatch(/^hovi_mcp_[A-Za-z0-9_-]{43}$/);
      expect(connection).toEqual({
        id: expect.any(String),
        name: "Claude on my laptop",
        access: "read",
        status: "active",
        createdAt: expect.any(String),
        expiresAt: expect.any(String),
        lastUsedAt: null,
      });

      const { rows } = await suite.client.query(
        `SELECT key_hash, extract(epoch FROM expires_at - created_at) = 86400 * 30 AS thirty_days,
                to_jsonb(c)::text AS whole_row
           FROM assistant_connections c WHERE id = $1`,
        [connection.id],
      );
      expect(rows[0].key_hash).toBe(sha256(key));
      expect(rows[0].thirty_days).toBe(true);
      expect(rows[0].whole_row).not.toContain(key.slice(CONNECTION_KEY_PREFIX.length));
    });

    it("sets each lifetime on offer, in exact days on the database clock", async () => {
      const user = await signUp(suite.client);
      for (const days of [7, 90, 365]) {
        const res = await create(user.auth, { name: `For ${days}`, expiresInDays: days });
        expect(res.status).toBe(201);
        const { rows } = await suite.client.query(
          "SELECT extract(epoch FROM expires_at - created_at)::int AS secs FROM assistant_connections WHERE id = $1",
          [res.body.connection.id],
        );
        expect(rows[0].secs).toBe(86400 * days);
      }
    });

    it("counts a lifetime in exact days in any time zone, across a daylight-saving change", async () => {
      const { db } = await import("../../db/index.js");
      const { keyExpiry } = await import("../../services/writes/connections.js");
      const { sql } = await import("drizzle-orm");
      // Helsinki leaves summer time on 25 October 2026, inside these 30 days.
      const start = sql`'2026-10-10 12:00:00+03'::timestamptz`;

      const secs = await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL TimeZone = 'Europe/Helsinki'`);
        const { rows } = await tx.execute(
          sql`SELECT extract(epoch FROM ${keyExpiry(start, 30)} - ${start})::int AS secs`,
        );
        return rows[0].secs;
      });

      expect(secs).toBe(86400 * 30);
    });

    it("refuses a writing key while writing is off, as it is by default, and makes nothing", async () => {
      const user = await signUp(suite.client);

      const res = await create(user.auth, { name: "Writer", access: "read_write", expiresInDays: 30 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("writes_off");
      expect(await liveKeys(user.id)).toBe(0);
    });

    it("makes a writing key once writing is on", async () => {
      env.MCP_WRITES_ENABLED = true;
      const user = await signUp(suite.client);

      const res = await create(user.auth, { name: "Writer", access: "read_write", expiresInDays: 90 });

      expect(res.status).toBe(201);
      expect(res.body.connection.access).toBe("read_write");
    });

    it("refuses a writing key for a year, with writing on", async () => {
      env.MCP_WRITES_ENABLED = true;
      const user = await signUp(suite.client);

      const res = await create(user.auth, { name: "Writer", access: "read_write", expiresInDays: 365 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("connection_write_expiry_too_long");
      expect(await liveKeys(user.id)).toBe(0);
    });

    it("refuses every key while connected AI is off, and makes nothing", async () => {
      env.MCP_ENABLED = false;
      env.MCP_WRITES_ENABLED = true;
      const user = await signUp(suite.client);

      for (const body of [{ name: "Reader" }, { name: "Writer", access: "read_write" }]) {
        const res = await create(user.auth, body);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("connect_off");
      }
      expect(await liveKeys(user.id)).toBe(0);
    });

    it.each([
      [{}, "connection_name_required"],
      [{ name: " " }, "connection_name_required"],
      [{ name: "x".repeat(65) }, "connection_name_too_long"],
      [{ name: "a\u0000b" }, "connection_name_invalid"],
      [{ name: "a\u202eb" }, "connection_name_invalid"],
      [{ name: "\u200b" }, "connection_name_invalid"],
      [{ name: "\u3164" }, "connection_name_invalid"],
      [{ name: "a", expiresInDays: 14 }, "connection_expiry_invalid"],
      [{ name: "a", access: "owner" }, "invalid_request"],
    ])("answers 400 to %j with its code", async (body, code) => {
      const user = await signUp(suite.client);
      const res = await create(user.auth, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
    });

    it("refuses an eleventh live key, and counts no revoked or expired one", async () => {
      const user = await signUp(suite.client);
      await seedKeys(user.id, MAX_LIVE_CONNECTIONS - 1);

      const tenth = await create(user.auth, { name: "Tenth" });
      expect(tenth.status).toBe(201);
      const eleventh = await create(user.auth, { name: "Eleventh" });
      expect(eleventh.status).toBe(409);
      expect(eleventh.body.code).toBe("connection_limit");

      // One revoked and one expired free two places.
      const [first, second] = (await list(user.auth)).body.connections as { id: string }[];
      expect((await revoke(user.auth, first.id)).status).toBe(204);
      await expire(second.id);
      expect((await create(user.auth, { name: "After revoke" })).status).toBe(201);
      expect((await create(user.auth, { name: "After expiry" })).status).toBe(201);
      expect((await create(user.auth, { name: "Over again" })).status).toBe(409);
      expect(await liveKeys(user.id)).toBe(MAX_LIVE_CONNECTIONS);
    });

    it("waits for another create that holds the user's row, then counts its key", async () => {
      const user = await signUp(suite.client);
      await seedKeys(user.id, MAX_LIVE_CONNECTIONS - 1);
      // The test plays the other create: it holds the user's row and adds the tenth key while the route waits.
      const other = await s.holdUserLock(user.id);
      const pending = create(user.auth, { name: "Claude" }).then((r) => r);
      const waited = await s.queuedOnLock(1);
      await other.query(
        `INSERT INTO assistant_connections (user_id, name, key_hash, access, expires_at)
         VALUES ($1, 'Tenth', $2, 'read', now() + interval '30 days')`,
        [user.id, randomBytes(32).toString("hex")],
      );
      await other.commit();

      const res = await pending;
      expect(waited).toBe(1);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("connection_limit");
      expect(await liveKeys(user.id)).toBe(MAX_LIVE_CONNECTIONS);
    });

    // A smoke test under real concurrency. Whether the six overlap depends on scheduling, so without the row lock
    // it can still pass in a full run. The deterministic test above, which holds the lock open, guards the limit.
    it("lets exactly one of six simultaneous creates take the tenth place", async () => {
      const user = await signUp(suite.client);
      await seedKeys(user.id, MAX_LIVE_CONNECTIONS - 1);

      const statuses = await Promise.all(
        Array.from({ length: 6 }, (_, i) => create(user.auth, { name: `Claude ${i}` }).then((r) => r.status)),
      );

      expect(statuses.sort()).toEqual([201, 409, 409, 409, 409, 409]);
      expect(await liveKeys(user.id)).toBe(MAX_LIVE_CONNECTIONS);
    });

    it("counts only the caller's own keys toward the limit", async () => {
      const full = await signUp(suite.client);
      const other = await signUp(suite.client);
      await seedKeys(full.id, MAX_LIVE_CONNECTIONS);

      expect((await create(full.auth, { name: "One more" })).status).toBe(409);
      expect((await create(other.auth, { name: "Mine" })).status).toBe(201);
    });
  });

  describe("GET /connections", () => {
    it("lists the user's keys newest first, expired ones as expired, revoked ones not at all", async () => {
      const user = await signUp(suite.client);
      const ids: string[] = [];
      for (const name of ["First", "Second", "Third"]) {
        const res = await create(user.auth, { name });
        ids.push(res.body.connection.id as string);
      }
      await expire(ids[1]);
      await revoke(user.auth, ids[0]);

      const res = await list(user.auth);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        connections: [
          expect.objectContaining({ id: ids[2], name: "Third", status: "active", changeCount: 0 }),
          expect.objectContaining({ id: ids[1], name: "Second", status: "expired", changeCount: 0 }),
        ],
        // A revoked key that made no change is not a past connection.
        past: [],
        availability: { connect: true, write: false },
      });
    });

    it("lists no one else's keys", async () => {
      const mine = await signUp(suite.client);
      const theirs = await signUp(suite.client);
      await create(theirs.auth, { name: "Theirs" });

      expect((await list(mine.auth)).body.connections).toEqual([]);
    });

    it("reads both switches on each request", async () => {
      const user = await signUp(suite.client);
      expect((await list(user.auth)).body.availability).toEqual({ connect: true, write: false });

      env.MCP_WRITES_ENABLED = true;
      expect((await list(user.auth)).body.availability).toEqual({ connect: true, write: true });

      // Writing needs connected AI on as well.
      env.MCP_ENABLED = false;
      expect((await list(user.auth)).body.availability).toEqual({ connect: false, write: false });
    });

    it("answers last use as the key path records it", async () => {
      const user = await signUp(suite.client);
      const { connection } = (await create(user.auth, { name: "Used" })).body as { connection: { id: string } };
      const { touchLastUsed } = await import("../../lib/connectionKeys.js");

      await touchLastUsed(connection.id);

      const [listed] = (await list(user.auth)).body.connections as { lastUsedAt: string | null }[];
      const { rows } = await suite.client.query("SELECT last_used_at FROM assistant_connections WHERE id = $1", [
        connection.id,
      ]);
      expect(listed.lastUsedAt).toBe((rows[0].last_used_at as Date).toISOString());
    });
  });

  describe("DELETE /connections/:id", () => {
    it("revokes an active key: 204, and it leaves the list", async () => {
      const user = await signUp(suite.client);
      const { connection } = (await create(user.auth, { name: "Gone soon" })).body as { connection: { id: string } };

      const res = await revoke(user.auth, connection.id);

      expect(res.status).toBe(204);
      expect(res.text).toBe("");
      expect((await list(user.auth)).body.connections).toEqual([]);
    });

    it("removes an expired key: listed as expired, then 204, then gone", async () => {
      const user = await signUp(suite.client);
      const { connection } = (await create(user.auth, { name: "Old" })).body as { connection: { id: string } };
      await expire(connection.id);
      expect((await list(user.auth)).body.connections).toEqual([
        expect.objectContaining({ id: connection.id, status: "expired" }),
      ]);

      expect((await revoke(user.auth, connection.id)).status).toBe(204);
      expect((await list(user.auth)).body.connections).toEqual([]);
    });

    it("answers 404 to a key already revoked", async () => {
      const user = await signUp(suite.client);
      const { connection } = (await create(user.auth, { name: "Twice" })).body as { connection: { id: string } };
      await revoke(user.auth, connection.id);

      const res = await revoke(user.auth, connection.id);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("connection_not_found");
    });

    it("answers another user's key the same 404, and leaves it live", async () => {
      const owner = await signUp(suite.client);
      const other = await signUp(suite.client);
      const { connection, key } = (await create(owner.auth, { name: "Owner's" })).body as {
        connection: { id: string };
        key: string;
      };

      const res = await revoke(other.auth, connection.id);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: expect.any(String), code: "connection_not_found" });
      const { lookupConnectionKey } = await import("../../lib/connectionKeys.js");
      expect((await lookupConnectionKey(key)).state).toBe("active");
      expect((await list(owner.auth)).body.connections).toHaveLength(1);
    });

    it.each(["not-a-uuid", "00000000-0000-4000-8000-000000000000"])("answers 404 to %s", async (id) => {
      const user = await signUp(suite.client);
      const res = await revoke(user.auth, id);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("connection_not_found");
    });
  });

  describe("the key", () => {
    it("appears in the create answer and in no other answer or log line", async () => {
      env.MCP_WRITES_ENABLED = true;
      const user = await signUp(suite.client);
      const lines: string[] = [];
      for (const method of ["log", "info", "warn", "error", "debug"] as const) {
        jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
          lines.push(args.map(String).join(" "));
        });
      }

      const made = await create(user.auth, { name: "Secret holder" });
      const key = made.body.key as string;
      const id = made.body.connection.id as string;
      const secret = key.slice(CONNECTION_KEY_PREFIX.length);
      const answers = [
        await list(user.auth),
        await create(user.auth, { name: "Another" }),
        await create(user.auth, { name: "x".repeat(65) }),
        await create(user.auth, { name: "Writer", access: "read_write", expiresInDays: 365 }),
        await api().get("/api/v1/connections").set("Authorization", `Bearer ${key}`),
        await revoke(user.auth, id),
        await revoke(user.auth, id),
        await list(user.auth),
      ];

      expect(made.text).toContain(secret);
      for (const answer of answers) {
        expect(answer.text).not.toContain(secret);
        expect(answer.text).not.toContain(sha256(key));
        expect(JSON.stringify(answer.headers)).not.toContain(secret);
      }
      // Whatever the app writes to the console meanwhile. The request log is off under test, and it writes
      // only the method, the route key and the status.
      for (const line of lines) expect(line).not.toContain(secret);
    });

    it("opens nothing under /api/v1: a key presented as a session answers 401", async () => {
      const user = await signUp(suite.client);
      const { key } = (await create(user.auth, { name: "Not a session" })).body as { key: string };
      const asKey = { Authorization: `Bearer ${key}` };
      const asGarbage = { Authorization: `Bearer ${randomBytes(32).toString("base64url")}` };
      const routes = [
        (auth: Auth) => api().get("/api/v1/connections").set(auth),
        (auth: Auth) => api().post("/api/v1/connections").set(auth).send({ name: "Minted by a key" }),
        (auth: Auth) => api().get("/api/v1/users/me").set(auth),
        (auth: Auth) => api().get("/api/v1/targets").set(auth),
      ];

      // The refusal does not tell a key apart from any other text that is not a session.
      for (const route of routes) {
        const [asKeyRes, asGarbageRes] = [await route(asKey), await route(asGarbage)];
        expect(asKeyRes.status).toBe(401);
        expect(asKeyRes.body).toEqual(asGarbageRes.body);
        expect(asKeyRes.body).toEqual({ message: expect.any(String), code: "unauthorized" });
      }
      expect(await liveKeys(user.id)).toBe(1);
    });

    it("looks up in four states: active with its user and zone, revoked, expired and unknown", async () => {
      const user = await signUp(suite.client);
      await suite.client.query("UPDATE users SET time_zone = 'America/New_York' WHERE id = $1", [user.id]);
      const { lookupConnectionKey, generateConnectionKey } = await import("../../lib/connectionKeys.js");
      const made = async (name: string) =>
        (await create(user.auth, { name })).body as { connection: { id: string; expiresAt: string }; key: string };
      const live = await made("Live");
      const revoked = await made("Revoked");
      const expired = await made("Expired");
      const both = await made("Both");
      await revoke(user.auth, revoked.connection.id);
      await expire(expired.connection.id);
      await expire(both.connection.id);
      await revoke(user.auth, both.connection.id);

      expect(await lookupConnectionKey(live.key)).toEqual({
        state: "active",
        connection: {
          id: live.connection.id,
          userId: user.id,
          name: "Live",
          access: "read",
          expiresAt: new Date(live.connection.expiresAt),
          timeZone: "America/New_York",
          touchDue: true,
        },
      });
      expect(await lookupConnectionKey(revoked.key)).toEqual({ state: "revoked" });
      expect(await lookupConnectionKey(expired.key)).toEqual({ state: "expired" });
      expect(await lookupConnectionKey(both.key)).toEqual({ state: "revoked" });
      expect(await lookupConnectionKey(generateConnectionKey().key)).toEqual({ state: "unknown" });
    });

    it("reads as unknown once its account is deleted", async () => {
      const user = await signUp(suite.client);
      const { key } = (await create(user.auth, { name: "Orphan" })).body as { key: string };
      const { lookupConnectionKey } = await import("../../lib/connectionKeys.js");

      await suite.client.query("DELETE FROM users WHERE id = $1", [user.id]);

      expect(await lookupConnectionKey(key)).toEqual({ state: "unknown" });
    });
  });
});
