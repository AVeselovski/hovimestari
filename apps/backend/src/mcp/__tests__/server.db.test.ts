import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import request from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { connect, freezeDate, listen, quietConsole } from "./harness.js";

// get_context on a real, migrated Postgres, through a real MCP client and a
// key made by POST /connections: its targets equal GET /targets field for
// field for a user with targets, a user with none and a user before their
// first change. The clock is frozen at 23:30 UTC, already the next day in
// Helsinki, so the tool's today is the user's today in their zone, as the
// route's is. The key's last use is recorded and a revoked key is refused.

quietConsole();
const NOW = "2026-11-19T23:30:00.000Z";
const TODAY_IN_HELSINKI = "2026-11-20";

const ranges = (energy: [number, number], protein: [number, number]) => ({
  ranges: {
    energyKcal: { lower: energy[0], upper: energy[1] },
    proteinG: { lower: protein[0], upper: protein[1] },
  },
});

type Envelope = { today: string; timeZone: string; units: string; data: Record<string, unknown> };

await describeWithDb("mcp server", (suite) => {
  let server: Awaited<ReturnType<typeof listen>>;
  let APP_RULES: string;

  // A block of its own, so its afterAll gives the real clock back before the
  // suite's afterAll drops the database, which waits on the clock.
  describe("on a frozen clock", () => {
    beforeAll(async () => {
      freezeDate(NOW);
      server = await listen(suite.app);
      ({ APP_RULES } = await import("../appRules.js"));
    });

    afterAll(async () => {
      await server?.close();
      jest.useRealTimers();
    });

    const api = () => request(suite.app);

    /** A signed-in user in Helsinki with a read key made through the API. */
    async function userWithKey(): Promise<{ user: ApiUser; key: string; connectionId: string }> {
      const user = await signUp(suite.client);
      await suite.client.query("UPDATE users SET time_zone = 'Europe/Helsinki' WHERE id = $1", [user.id]);
      const res = await api().post("/api/v1/connections").set(user.auth).send({ name: "Claude on my laptop" });
      expect(res.status).toBe(201);
      return { user, key: res.body.key as string, connectionId: res.body.connection.id as string };
    }

    async function getContext(key: string): Promise<Envelope> {
      const client: Client = await connect(server.url, key);
      try {
        const result = await client.callTool({ name: "get_context", arguments: {} });
        expect(result.isError).toBeFalsy();
        return JSON.parse((result.content as { text: string }[])[0].text) as Envelope;
      } finally {
        await client.close();
      }
    }

    async function getTargets(user: ApiUser) {
      const res = await api().get("/api/v1/targets").set(user.auth);
      expect(res.status).toBe(200);
      return res.body as { date: string; today: string; inForce: unknown; changes: unknown[]; firstRunDue: boolean };
    }

    const put = async (user: ApiUser, date: string, body: object) =>
      expect((await api().put(`/api/v1/targets/${date}`).set(user.auth).send(body)).status).toBe(200);

    describe("get_context", () => {
      it("answers the targets GET /targets answers, for a user with targets", async () => {
        const { user, key } = await userWithKey();
        await put(user, "2026-11-01", ranges([1800, 2000], [120, 160]));
        await put(user, TODAY_IN_HELSINKI, ranges([1900, 2100], [130, 170]));
        await put(user, "2026-12-01", ranges([2000, 2200], [140, 180]));

        const answer = await getContext(key);
        const route = await getTargets(user);

        expect(route.today).toBe(TODAY_IN_HELSINKI);
        expect(answer.today).toBe(route.today);
        expect(answer.timeZone).toBe("Europe/Helsinki");
        expect(answer.data.today).toBe(route.today);
        expect(answer.data.timeZone).toBe("Europe/Helsinki");
        expect(answer.data.targets).toEqual({ inForce: route.inForce, changes: route.changes });
        expect((route.inForce as { effectiveFrom: string }).effectiveFrom).toBe(TODAY_IN_HELSINKI);
        expect(route.changes).toHaveLength(3);
      });

      it("answers no targets as null with no changes, for a user with none", async () => {
        const { user, key } = await userWithKey();
        const answer = await getContext(key);
        const route = await getTargets(user);
        expect(answer.data.targets).toEqual({ inForce: null, changes: [] });
        expect(answer.data.targets).toEqual({ inForce: route.inForce, changes: route.changes });
      });

      it("answers no targets in force, with the change listed, before the first change", async () => {
        const { user, key } = await userWithKey();
        await put(user, "2026-12-01", ranges([2000, 2200], [140, 180]));
        const answer = await getContext(key);
        const route = await getTargets(user);
        expect(route.inForce).toBeNull();
        expect(answer.data.targets).toEqual({ inForce: null, changes: route.changes });
        expect(route.changes).toHaveLength(1);
      });

      it("answers the key's access and expiry, the rules, and nothing a screen routes by", async () => {
        const { user, key } = await userWithKey();
        const answer = await getContext(key);
        const listed = await api().get("/api/v1/connections").set(user.auth);
        expect(answer.data.access).toEqual({ canWrite: false, expiresAt: listed.body.connections[0].expiresAt });
        expect(answer.data.rules).toBe(APP_RULES);
        expect(Object.keys(answer.data).sort()).toEqual(["access", "rules", "targets", "timeZone", "today"]);
        expect(JSON.stringify(answer)).not.toContain("firstRunDue");
        expect(JSON.stringify(answer)).not.toContain(user.id);
      });

      it("reads only the key's own user", async () => {
        const mine = await userWithKey();
        const theirs = await userWithKey();
        await put(theirs.user, "2026-11-01", ranges([1500, 1700], [100, 120]));
        expect((await getContext(mine.key)).data.targets).toEqual({ inForce: null, changes: [] });
        expect(((await getContext(theirs.key)).data.targets as { changes: unknown[] }).changes).toHaveLength(1);
      });
    });

    describe("the key", () => {
      it("records its last use", async () => {
        const { key, connectionId } = await userWithKey();
        await getContext(key);
        const { rows } = await suite.client.query("SELECT last_used_at FROM assistant_connections WHERE id = $1", [
          connectionId,
        ]);
        expect(rows[0].last_used_at).not.toBeNull();
      });

      it("is refused, saying why, once the user revokes it", async () => {
        const { user, key, connectionId } = await userWithKey();
        await getContext(key);
        expect((await api().delete(`/api/v1/connections/${connectionId}`).set(user.auth)).status).toBe(204);

        const res = await api()
          .post("/mcp")
          .set("Authorization", `Bearer ${key}`)
          .set("Accept", "application/json, text/event-stream")
          .send({ jsonrpc: "2.0", id: 1, method: "ping" });
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "invalid_token", error_description: "This key was revoked." });
      });
    });
  });
});
