import { ConnectionListSchema } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { insertChange, insertChanges, insertConnection } from "../../__tests__/support/changeRows.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// GET /connections on a real Postgres, for what it says about the record of
// changes: each listed connection's exact count of changes, and the past
// connections, revoked ones that made changes, newest change first. A revoked
// connection that changed nothing is not listed anywhere. Record rows are
// inserted with their times written out, never read off the machine's clock.

type Listed = { id: string; changeCount: number };
type Past = { id: string; name: string; changeCount: number; lastChangeAt: string };

await describeWithDb("connection counts", (suite) => {
  const list = async (user: ApiUser) => {
    const res = await request(suite.app).get("/api/v1/connections").set(user.auth);
    expect(res.status).toBe(200);
    return res.body as { connections: Listed[]; past: Past[] };
  };
  const revoke = (id: string) =>
    suite.client.query("UPDATE assistant_connections SET revoked_at = now() WHERE id = $1", [id]);

  describe("changeCount", () => {
    it("gives each listed connection its exact count, zero for none, and counts no one else's", async () => {
      const user = await signUp(suite.client);
      const busy = await insertConnection(suite.client, user.id, "Busy");
      const quiet = await insertConnection(suite.client, user.id, "Quiet");
      await insertChanges(suite.client, user.id, busy, 3);
      const other = await signUp(suite.client);
      const theirs = await insertConnection(suite.client, other.id, "Theirs");
      await insertChanges(suite.client, other.id, theirs, 4);

      const { connections } = await list(user);

      const counts = Object.fromEntries(connections.map((c) => [c.id, c.changeCount]));
      expect(counts).toEqual({ [busy]: 3, [quiet]: 0 });
    });

    it("counts nothing for another user's connection, even when asked by its id", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      const theirs = await insertConnection(suite.client, other.id, "Theirs");
      await insertChanges(suite.client, other.id, theirs, 2);
      const { contextForUser } = await import("../../lib/requestContext.js");
      const { changeCount } = await import("../../services/reads/connections.js");
      // A fixed instant: the count reads no clock, and the context wants one.
      const at = new Date("2026-11-18T10:00:00Z");

      expect(await changeCount(contextForUser({ id: user.id, timeZone: "UTC" }, at), [theirs])).toEqual(new Map());
      expect(await changeCount(contextForUser({ id: other.id, timeZone: "UTC" }, at), [theirs])).toEqual(
        new Map([[theirs, 2]]),
      );
    });

    it("keeps an expired connection's count while it is listed", async () => {
      const user = await signUp(suite.client);
      const expired = await insertConnection(suite.client, user.id, "Expired");
      await insertChanges(suite.client, user.id, expired, 2);
      await suite.client.query(
        "UPDATE assistant_connections SET expires_at = now() - interval '1 second' WHERE id = $1",
        [expired],
      );

      const { connections, past } = await list(user);

      expect(connections).toEqual([expect.objectContaining({ id: expired, status: "expired", changeCount: 2 })]);
      expect(past).toEqual([]);
    });
  });

  describe("past", () => {
    it("lists a revoked connection that made changes and leaves out one that made none", async () => {
      const user = await signUp(suite.client);
      const live = await insertConnection(suite.client, user.id, "Live");
      await insertChanges(suite.client, user.id, live, 1);
      const madeChanges = await insertConnection(suite.client, user.id, "Old laptop");
      await insertChanges(suite.client, user.id, madeChanges, 2, "2026-11-10 08:00:00+00");
      const madeNone = await insertConnection(suite.client, user.id, "Never wrote");
      await revoke(madeChanges);
      await revoke(madeNone);

      const body = await list(user);

      expect(body.connections.map((c) => c.id)).toEqual([live]);
      expect(body.past).toEqual([
        { id: madeChanges, name: "Old laptop", changeCount: 2, lastChangeAt: "2026-11-10T08:02:00.000Z" },
      ]);
      expect(ConnectionListSchema.parse(body)).toEqual(body);
    });

    it("orders past connections newest change first, whatever order they were made or revoked in", async () => {
      const user = await signUp(suite.client);
      const first = await insertConnection(suite.client, user.id, "First");
      const second = await insertConnection(suite.client, user.id, "Second");
      const third = await insertConnection(suite.client, user.id, "Third");
      await insertChange(suite.client, user.id, first, { at: "2026-11-12 10:00:00+00" });
      await insertChange(suite.client, user.id, second, { at: "2026-11-03 10:00:00+00" });
      await insertChange(suite.client, user.id, third, { at: "2026-11-01 10:00:00+00" });
      await insertChange(suite.client, user.id, third, { at: "2026-11-15 10:00:00+00" });
      for (const id of [third, first, second]) await revoke(id);

      const { past } = await list(user);

      expect(past.map((p) => [p.name, p.changeCount, p.lastChangeAt])).toEqual([
        ["Third", 2, "2026-11-15T10:00:00.000Z"],
        ["First", 1, "2026-11-12T10:00:00.000Z"],
        ["Second", 1, "2026-11-03T10:00:00.000Z"],
      ]);
    });

    it("lists no one else's past connections", async () => {
      const mine = await signUp(suite.client);
      const other = await signUp(suite.client);
      const theirs = await insertConnection(suite.client, other.id, "Theirs");
      await insertChanges(suite.client, other.id, theirs, 2);
      await revoke(theirs);

      expect((await list(mine)).past).toEqual([]);
      expect((await list(other)).past).toEqual([expect.objectContaining({ id: theirs, changeCount: 2 })]);
    });

    it("moves a connection from the list to past when it is revoked through the route, with its count", async () => {
      const user = await signUp(suite.client);
      const id = await insertConnection(suite.client, user.id, "Claude on my laptop");
      await insertChanges(suite.client, user.id, id, 3);
      expect((await list(user)).connections).toEqual([expect.objectContaining({ id, changeCount: 3 })]);

      const res = await request(suite.app).delete(`/api/v1/connections/${id}`).set(user.auth);

      expect(res.status).toBe(204);
      const after = await list(user);
      expect(after.connections).toEqual([]);
      expect(after.past).toEqual([expect.objectContaining({ id, changeCount: 3 })]);
    });
  });
});
