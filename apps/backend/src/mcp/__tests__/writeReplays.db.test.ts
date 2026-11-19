import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { randomUUID } from "node:crypto";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { serviceHolder } from "../../__tests__/support/holder.js";
import { sessionApi } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import type { AssistantActor } from "../../services/writes/changeRecord.js";
import { connect, listen, quietConsole } from "./harness.js";
import {
  call,
  CONNECTION_NAME,
  newRequestKey,
  recordsOf,
  writerWithKey,
  written,
  type Writer,
} from "./writeSupport.js";

// The request key and the one transaction, on a real Postgres (design d.4).
// A held transaction makes the first of two calls with one key: it has
// written its change and its record row and not committed, so the second
// call finds no row, makes its own change, and its record insert queues on
// the unique index, which pg_locks shows. Once the first commits, the second
// loses the insert, rolls back with its change, and answers from the
// winner's row. These cases name no day: they log for `today`, the person's
// today on the server, because the lock wait polls the real clock.

process.env.MCP_WRITES_ENABLED = "true";
quietConsole();

await describeWithDb("mcp write replays", (suite) => {
  const d = daysApi(suite);
  const sessions = sessionApi(suite);
  let server: Awaited<ReturnType<typeof listen>>;
  let w: Writer;
  let client: Client;
  let foodId: string;
  let resetBrake: () => void;

  beforeAll(async () => {
    const { writesPerMinute } = await import("../writeBrake.js");
    resetBrake = () => writesPerMinute.reset();
    server = await listen(suite.app);
    w = await writerWithKey(suite, d.api);
    foodId = (await d.fineliFood()).id;
    client = await connect(server.url, w.key);
  });
  beforeEach(() => resetBrake());
  afterAll(async () => {
    await client?.close();
    await server?.close();
  });

  const records = () => recordsOf(suite, w.user.id);
  const logArgs = (requestKey: string, grams: number) => ({
    requestKey,
    foodId,
    amount: { grams },
    date: "today",
    status: "eaten" as const,
  });

  /** The actor runWriteTool builds for `args` on log_food, so a held call and a tool call share one key and hash. */
  async function actorFor(args: ReturnType<typeof logArgs>): Promise<AssistantActor> {
    const { requestHashOf } = await import("../../services/writes/changeRecord.js");
    return {
      connectionId: w.connectionId,
      connectionName: CONNECTION_NAME,
      requestKey: args.requestKey,
      requestHash: requestHashOf("log_food", args),
    };
  }

  describe("two calls with one key at once", () => {
    it("make one change, and the second answers replayed with the first one's entry", async () => {
      const { recordedLogFood } = await import("../../services/writes/recorded/entries.js");
      const args = logArgs(newRequestKey(), 120);
      const via = await actorFor(args);
      const entries = await d.entryCount(w.user.id);
      const first = await serviceHolder(await d.contextAt(w.user.id), (c) =>
        recordedLogFood(c, via, { foodId, amount: { grams: 120 }, date: c.today, status: "eaten" }),
      );

      const second = call(client, "log_food", args);
      const waited = await sessions.queuedOnLock(1);
      await first.commit();
      const answer = await second;

      expect(waited).toBe(1);
      expect(first.value.outcome).toBe("created");
      expect(answer.data).toMatchObject({ outcome: "replayed", entry: { id: first.value.value.entry!.id } });
      expect(await d.entryCount(w.user.id)).toBe(entries + 1);
      expect((await records()).filter((r) => r.requestKey === args.requestKey)).toHaveLength(1);
    });

    it("refuse the second as request_key_reused when its arguments differ, and keep only the first change", async () => {
      const { recordedLogFood } = await import("../../services/writes/recorded/entries.js");
      const held = logArgs(newRequestKey(), 120);
      const via = await actorFor(held);
      const entries = await d.entryCount(w.user.id);
      const first = await serviceHolder(await d.contextAt(w.user.id), (c) =>
        recordedLogFood(c, via, { foodId, amount: { grams: 120 }, date: c.today, status: "eaten" }),
      );

      const second = call(client, "log_food", logArgs(held.requestKey, 130));
      const waited = await sessions.queuedOnLock(1);
      await first.commit();
      const answer = await second;

      expect(waited).toBe(1);
      expect(answer).toMatchObject({
        isError: true,
        text: "This requestKey was already used for a different change. Use a new requestKey. (request_key_reused)",
      });
      expect(await d.entryCount(w.user.id)).toBe(entries + 1);
    });
  });

  describe("two calls with one key at once, on a tool that changes what is there", () => {
    // The loser finds nothing left to change once the winner commits, so its
    // own record would be empty. It must still answer as the winner's replay.
    const planned = async () =>
      (
        await written(client, "log_food", {
          requestKey: newRequestKey(),
          foodId,
          amount: { grams: 100 },
          date: "today",
          status: "planned",
        })
      ).entry.id as string;

    /** Holds `hold` open as the first call, sends the same call through the tool, and commits once it waits on a lock. */
    async function race<T>(
      tool: string,
      args: Record<string, unknown> & { requestKey: string },
      hold: (c: Awaited<ReturnType<typeof d.contextAt>>, via: AssistantActor) => Promise<T>,
    ) {
      const { requestHashOf } = await import("../../services/writes/changeRecord.js");
      const via: AssistantActor = {
        connectionId: w.connectionId,
        connectionName: CONNECTION_NAME,
        requestKey: args.requestKey,
        requestHash: requestHashOf(tool, args),
      };
      const first = await serviceHolder(await d.contextAt(w.user.id), (c) => hold(c, via));
      const second = call(client, tool, args);
      const waited = await sessions.queuedOnLock(1);
      await first.commit();
      const answer = await second;
      expect(waited).toBe(1);
      expect((await records()).filter((r) => r.requestKey === args.requestKey)).toHaveLength(1);
      return { first: first.value, answer };
    }

    it("update_entry: the second answers replayed with the winner's entry", async () => {
      const { recordedUpdateEntry } = await import("../../services/writes/recorded/entries.js");
      const entryId = await planned();
      const args = { requestKey: newRequestKey(), entryId, amount: { grams: 222 } };
      const { first, answer } = await race("update_entry", args, (c, via) =>
        recordedUpdateEntry(c, via, entryId, { amount: { grams: 222 } }),
      );
      expect((first as { outcome: string }).outcome).toBe("changed");
      expect(answer.data).toMatchObject({ outcome: "replayed", entry: { id: entryId, grams: 222 } });
    });

    it("set_entries_status: the second answers replayed with the winner's ids", async () => {
      const { recordedSetEntriesStatus } = await import("../../services/writes/recorded/entries.js");
      const ids = [await planned(), await planned()];
      const args = { requestKey: newRequestKey(), entryIds: ids, status: "eaten" as const };
      const { answer } = await race("set_entries_status", args, (c, via) =>
        recordedSetEntriesStatus(c, via, { entryIds: ids, status: "eaten" }),
      );
      expect(answer.data.outcome).toBe("replayed");
      expect([...answer.data.changedIds].sort()).toEqual([...ids].sort());
    });

    it("remove_entries: the second answers replayed with the winner's ids", async () => {
      const { recordedRemoveEntries } = await import("../../services/writes/recorded/entries.js");
      const entryId = await planned();
      const args = { requestKey: newRequestKey(), entryIds: [entryId] };
      const { answer } = await race("remove_entries", args, (c, via) =>
        recordedRemoveEntries(c, via, { entryIds: [entryId] }),
      );
      expect(answer.data).toMatchObject({ outcome: "replayed", removedIds: [entryId] });
    });

    it("restore_entry: the second answers replayed with the winner's entry", async () => {
      const { recordedRestoreEntry } = await import("../../services/writes/recorded/entries.js");
      const entryId = await planned();
      await written(client, "remove_entries", { requestKey: newRequestKey(), entryIds: [entryId] });
      const args = { requestKey: newRequestKey(), entryId };
      const { answer } = await race("restore_entry", args, (c, via) => recordedRestoreEntry(c, via, entryId));
      expect(answer.data).toMatchObject({ outcome: "replayed", entry: { id: entryId } });
    });
  });

  describe("a different call with one key at once, on a tool that changes what is there", () => {
    it("is refused request_key_reused once the first commits, and only the first change is recorded", async () => {
      const { recordedRemoveEntries, requestHashOf } = await Promise.all([
        import("../../services/writes/recorded/entries.js"),
        import("../../services/writes/changeRecord.js"),
      ]).then(([recorded, record]) => ({ ...recorded, ...record }));
      const entryId = (await written(client, "log_food", logArgs(newRequestKey(), 90))).entry.id as string;
      const held = { requestKey: newRequestKey(), entryIds: [entryId] };
      const via: AssistantActor = {
        connectionId: w.connectionId,
        connectionName: CONNECTION_NAME,
        requestKey: held.requestKey,
        requestHash: requestHashOf("remove_entries", held),
      };
      const first = await serviceHolder(await d.contextAt(w.user.id), (c) =>
        recordedRemoveEntries(c, via, { entryIds: [entryId] }),
      );
      // The same key with another set of ids: it waits on the first's lock, then finds the entry gone.
      const second = call(client, "remove_entries", { requestKey: held.requestKey, entryIds: [entryId, randomUUID()] });
      const waited = await sessions.queuedOnLock(1);
      await first.commit();
      const answer = await second;

      expect(waited).toBe(1);
      expect(answer).toMatchObject({
        isError: true,
        text: "This requestKey was already used for a different change. Use a new requestKey. (request_key_reused)",
      });
      expect((await records()).filter((r) => r.requestKey === held.requestKey)).toEqual([
        expect.objectContaining({ action: "entries.removed", entityIds: [entryId] }),
      ]);
    });
  });

  describe("a key used again", () => {
    it("is refused with other arguments, and writes nothing", async () => {
      const requestKey = newRequestKey();
      expect((await call(client, "log_food", logArgs(requestKey, 150))).data.outcome).toBe("created");
      const entries = await d.entryCount(w.user.id);
      const rows = (await records()).length;

      const reused = await call(client, "log_food", logArgs(requestKey, 151));
      expect(reused).toMatchObject({ isError: true, text: expect.stringContaining("(request_key_reused)") });
      expect(await d.entryCount(w.user.id)).toBe(entries);
      expect(await records()).toHaveLength(rows);
    });

    it("is refused on another tool, whose call hashes with its own name", async () => {
      const requestKey = newRequestKey();
      const logged = await call(client, "log_food", logArgs(requestKey, 150));
      const refused = await call(client, "remove_entries", { requestKey, entryIds: [logged.data.entry.id] });
      expect(refused).toMatchObject({ isError: true, text: expect.stringContaining("(request_key_reused)") });
      expect((await d.day(w.user, logged.data.entry.date)).body.entries.map((e: { id: string }) => e.id)).toContain(
        logged.data.entry.id,
      );
    });

    it("belongs to its connection: another key of the same person may use the same text", async () => {
      const second = await writerWithKey(suite, d.api);
      const requestKey = newRequestKey();
      expect((await call(client, "log_food", logArgs(requestKey, 150))).data.outcome).toBe("created");
      const other = await connect(server.url, second.key);
      try {
        expect((await call(other, "log_food", logArgs(requestKey, 150))).data.outcome).toBe("created");
      } finally {
        await other.close();
      }
    });
  });

  describe("a conflict with no row to replay", () => {
    it("throws the original failure, so the log names its cause", async () => {
      const { replayAfterConflict, RequestKeyTaken } = await import("../../services/writes/changeRecord.js");
      const original = Object.assign(new Error("duplicate key"), { code: "23505" });
      const via: AssistantActor = {
        connectionId: w.connectionId,
        connectionName: CONNECTION_NAME,
        requestKey: newRequestKey(),
        requestHash: "h",
      };
      const replay = replayAfterConflict(await d.contextAt(w.user.id), via, new RequestKeyTaken(original));
      await expect(replay).rejects.toBe(original);
    });
  });

  describe("one transaction", () => {
    it("leaves neither the change nor a record when the record's insert fails after the service", async () => {
      const { recordedWrite } = await import("../../services/writes/changeRecord.js");
      const { addEntry } = await import("../../services/writes/entries.js");
      const { AddEntryBodySchema } = await import("@hovimestari/types");
      const ctx = await d.contextAt(w.user.id);
      const body = AddEntryBodySchema.parse(d.estimateBody({ energyKcal: 1, proteinG: 1, carbsG: 1, fatG: 1 }));
      const rows = (await records()).length;
      const via: AssistantActor = {
        connectionId: w.connectionId,
        connectionName: CONNECTION_NAME,
        requestKey: newRequestKey(),
        requestHash: "h",
      };

      // An empty entity_ids passes the service and fails the table's CHECK at the insert.
      const failing = recordedWrite(ctx, via, {
        userLock: "key share",
        before: async () => null,
        run: (tx) => addEntry(tx, body),
        record: () => ({ action: "entry.added", entityIds: [], summary: { entity: "food", name: "x", changes: [] } }),
      });
      await expect(failing).rejects.toMatchObject({ cause: { constraint: "assistant_changes_entity_ids" } });
      const { rows: left } = await suite.client.query("SELECT id FROM entries WHERE id = $1", [body.id]);
      expect(left).toEqual([]);
      expect(await records()).toHaveLength(rows);

      // A record that throws after the service, the same.
      const throwing = recordedWrite(
        ctx,
        { ...via, requestKey: newRequestKey() },
        {
          userLock: "key share",
          before: async () => null,
          run: (tx) => addEntry(tx, { ...body }),
          record: () => {
            throw new Error("forced");
          },
        },
      );
      await expect(throwing).rejects.toThrow("forced");
      expect((await suite.client.query("SELECT id FROM entries WHERE id = $1", [body.id])).rows).toEqual([]);
      expect(await records()).toHaveLength(rows);
    });
  });
});
