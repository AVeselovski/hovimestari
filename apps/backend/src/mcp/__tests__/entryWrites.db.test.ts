import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { randomUUID } from "node:crypto";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { connect, freezeDate, listen, quietConsole } from "./harness.js";
import {
  call,
  CONNECTION_NAME,
  newRequestKey,
  recordsOf,
  writerWithKey,
  written,
  type Writer,
} from "./writeSupport.js";

// Each entry write tool on a real, migrated Postgres, through a real MCP
// client and a read-and-write key made by POST /connections, on one frozen
// clock: the change it makes is the screen's (its day equals GET /days),
// its record row holds the action, the ids and the summary, a retry with the
// same request key answers `replayed` and writes nothing, and a write that
// changed nothing records nothing and says so. writeReplays.db.test.ts holds
// the request key's races and the transaction; writeBrakes.db.test.ts the limits.

process.env.MCP_WRITES_ENABLED = "true";
quietConsole();
const NOW = "2026-11-19T10:00:00.000Z"; // noon in Helsinki
const TODAY = "2026-11-19";
const YESTERDAY = "2026-11-18";
const TOMORROW = "2026-11-20";
const MEAL = { energyKcal: 650, proteinG: 42, carbsG: 70, fatG: 20 };
const ESTIMATE = { energyKcal: 820, proteinG: 31, carbsG: 90, fatG: 35 };
const RECORDED = "Recorded in the app under this connection's name.";
const UNCHANGED = "Nothing changed. Nothing was recorded.";
const REPLAYED = "An earlier call with this requestKey already made this change. Nothing new was written.";

await describeWithDb("mcp entry writes", (suite) => {
  const d = daysApi(suite);
  const api = d.api;

  describe("on a frozen clock", () => {
    let server: Awaited<ReturnType<typeof listen>>;
    let w: Writer;
    let client: Client;
    let food: { id: string; portionId: string };
    let mealId: string;
    let resetBrake: () => void;

    beforeAll(async () => {
      freezeDate(NOW);
      const { writesPerMinute } = await import("../writeBrake.js");
      resetBrake = () => writesPerMinute.reset();
      server = await listen(suite.app);
      w = await writerWithKey(suite, api);
      food = await d.fineliFood();
      mealId = await d.meal(w.user, MEAL, "Lounas", "Wolt");
      client = await connect(server.url, w.key);
    });
    // Every test here writes on one frozen minute: the brake has its own suite.
    beforeEach(() => resetBrake());
    afterAll(async () => {
      await client?.close();
      await server?.close();
      jest.useRealTimers();
    });

    const records = () => recordsOf(suite, w.user.id);
    const restDay = async (date: string) => (await d.day(w.user, date)).body;
    const logFood = (requestKey: string, grams = 150, date = TODAY) =>
      call(client, "log_food", { requestKey, foodId: food.id, amount: { grams }, date, status: "eaten" });
    const estimate = async (date = TODAY, name = "Ravintola") =>
      (
        await written(client, "log_estimate", {
          requestKey: newRequestKey(),
          name,
          figures: ESTIMATE,
          date,
          status: "planned",
        })
      ).entry as { id: string };

    describe("log_food", () => {
      it("logs the food as the screen does, and records the entry by its id", async () => {
        const before = (await records()).length;
        const requestKey = newRequestKey();
        const { data } = await logFood(requestKey);
        expect(data).toMatchObject({ outcome: "created", note: RECORDED });
        expect(data.entry).toMatchObject({ kind: "food", date: TODAY, status: "eaten", grams: 150, isEstimate: false });
        expect(data.days).toEqual([await restDay(TODAY)]);

        const rows = await records();
        expect(rows).toHaveLength(before + 1);
        expect(rows.at(-1)).toEqual({
          action: "entry.added",
          entityIds: [data.entry.id],
          requestKey,
          connectionId: w.connectionId,
          connectionName: CONNECTION_NAME,
          summary: {
            entity: "entry",
            entry: {
              name: data.entry.name,
              date: TODAY,
              status: "eaten",
              kind: "food",
              amount: { grams: 150 },
              figures: data.entry.figures,
            },
            changes: [],
          },
        });
      });

      it("records a portion amount with its label, count and grams", async () => {
        const { data } = await call(client, "log_food", {
          requestKey: newRequestKey(),
          foodId: food.id,
          amount: { portionId: food.portionId, count: 2 },
          date: "today",
          status: "eaten",
        });
        expect(data.entry).toMatchObject({ date: TODAY, grams: 400, portion: { id: food.portionId, count: 2 } });
        expect((await records()).at(-1)?.summary).toMatchObject({
          entry: { amount: { portionLabel: "PORTM", portionUnit: "PORTM", count: 2, grams: 400 } },
        });
      });

      it("answers a retry with the same key as replayed, with the entry read by its id, and writes nothing", async () => {
        const requestKey = newRequestKey();
        const first = (await logFood(requestKey, 175)).data;
        const entries = await d.entryCount(w.user.id);
        const rows = (await records()).length;

        const again = (await logFood(requestKey, 175)).data;
        expect(again).toMatchObject({ outcome: "replayed", note: REPLAYED, firstCallAt: expect.any(String) });
        expect(again.entry).toEqual(first.entry);
        expect(again.recorded).toEqual((await records()).at(-1)?.summary);
        expect(again.days).toEqual([await restDay(TODAY)]);
        expect(await d.entryCount(w.user.id)).toBe(entries);
        expect(await records()).toHaveLength(rows);
      });

      it("answers a retry after the entry was removed with no entry and its recorded day", async () => {
        const requestKey = newRequestKey();
        const first = (await logFood(requestKey, 90, YESTERDAY)).data;
        expect((await d.remove(w.user, first.entry.id)).status).toBe(200);

        const again = (await logFood(requestKey, 90, YESTERDAY)).data;
        expect(again).toMatchObject({ outcome: "replayed", entry: null });
        expect(again.days).toEqual([await restDay(YESTERDAY)]);
      });

      it("records nothing for a refused write, and leaves its key free", async () => {
        const rows = (await records()).length;
        const requestKey = newRequestKey();
        const refused = await call(client, "log_food", {
          requestKey,
          foodId: "99999999-9999-4999-8999-999999999999",
          amount: { grams: 100 },
          date: TODAY,
          status: "eaten",
        });
        expect(refused).toMatchObject({ isError: true, text: "This food is no longer available. (food_not_found)" });
        expect(await records()).toHaveLength(rows);
        // Nothing was recorded, so the same key with other arguments is a first call.
        expect((await logFood(requestKey)).data.outcome).toBe("created");
      });

      it("refuses an eaten entry on a future date, as the screen does", async () => {
        const refused = await logFood(newRequestKey(), 100, TOMORROW);
        expect(refused).toMatchObject({ isError: true, text: expect.stringContaining("(entry_eaten_in_future)") });
      });
    });

    describe("log_saved_meal and log_estimate", () => {
      it("log_saved_meal logs a count of the meal with the meal's figures, and records its count", async () => {
        const { data } = await call(client, "log_saved_meal", {
          requestKey: newRequestKey(),
          savedMealId: mealId,
          count: 2,
          date: TOMORROW,
          status: "planned",
        });
        expect(data).toMatchObject({ outcome: "created", note: RECORDED });
        expect(data.entry).toMatchObject({ kind: "saved_meal", name: "Lounas", count: 2, status: "planned" });
        expect(data.entry.figures).toEqual({ energyKcal: 1300, proteinG: 84, carbsG: 140, fatG: 40 });
        expect(data.days).toEqual([await restDay(TOMORROW)]);
        expect((await records()).at(-1)).toMatchObject({
          action: "entry.added",
          entityIds: [data.entry.id],
          summary: { entry: { kind: "saved_meal", amount: { count: 2 }, figures: data.entry.figures } },
        });
      });

      it("log_estimate stores an estimate, marked as one, and the record keeps no note", async () => {
        const note = "Judged from a photo of the plate";
        const { data } = await call(client, "log_estimate", {
          requestKey: newRequestKey(),
          name: "Pizza at Luigi's",
          figures: ESTIMATE,
          note,
          date: TODAY,
          status: "eaten",
        });
        expect(data.entry).toMatchObject({ kind: "estimate", isEstimate: true, name: "Pizza at Luigi's", note });
        expect(data.entry.figures).toEqual(ESTIMATE);
        expect(data.days[0].eaten.includesEstimate).toBe(true);
        const row = (await records()).at(-1)!;
        expect(row.summary).toMatchObject({ entry: { kind: "estimate", amount: null, name: "Pizza at Luigi's" } });
        expect(JSON.stringify(row)).not.toContain(note);
      });
    });

    describe("update_entry", () => {
      it("moves an entry and records the fields it changed, with both days in the answer and its replay", async () => {
        const entry = await estimate(TODAY, "Moved lunch");
        const requestKey = newRequestKey();
        const args = { requestKey, entryId: entry.id, date: TOMORROW, name: "Moved lunch, later" };
        const { data } = await call(client, "update_entry", args);
        expect(data).toMatchObject({ outcome: "changed", note: RECORDED });
        expect(data.entry).toMatchObject({ id: entry.id, date: TOMORROW, name: "Moved lunch, later" });
        expect(data.days).toEqual([await restDay(TODAY), await restDay(TOMORROW)]);
        expect((await records()).at(-1)).toMatchObject({
          action: "entry.changed",
          entityIds: [entry.id],
          summary: {
            entity: "entry",
            entry: { date: TOMORROW, name: "Moved lunch, later" },
            changes: [
              { field: "date", from: TODAY, to: TOMORROW },
              { field: "name", from: "Moved lunch", to: "Moved lunch, later" },
            ],
          },
        });

        const again = (await call(client, "update_entry", args)).data;
        expect(again).toMatchObject({ outcome: "replayed", entry: { id: entry.id, date: TOMORROW } });
        expect(again.days).toEqual([await restDay(TODAY), await restDay(TOMORROW)]);
      });

      it("answers unchanged for an edit that changes nothing, records nothing, and keeps no key", async () => {
        const entry = await estimate(TODAY, "Same name");
        const rows = (await records()).length;
        const requestKey = newRequestKey();
        const same = await call(client, "update_entry", { requestKey, entryId: entry.id, name: "Same name" });
        expect(same.data).toMatchObject({ outcome: "unchanged", note: UNCHANGED, entry: { id: entry.id } });
        expect(await records()).toHaveLength(rows);
        // No row holds the key, so it is free for another call.
        const other = await call(client, "update_entry", { requestKey, entryId: entry.id, name: "Another name" });
        expect(other.data.outcome).toBe("changed");
      });

      it("refuses a field that does not fit the entry's kind, and records nothing", async () => {
        const entry = await estimate();
        const rows = (await records()).length;
        const refused = await call(client, "update_entry", {
          requestKey: newRequestKey(),
          entryId: entry.id,
          count: 2,
        });
        expect(refused).toMatchObject({ isError: true, text: expect.stringContaining("(entry_kind_mismatch)") });
        expect(await records()).toHaveLength(rows);
      });
    });

    describe("set_entries_status", () => {
      it("marks entries eaten, records the ids it changed, and reads its ids as a set on a retry", async () => {
        const a = await estimate(TODAY, "Breakfast");
        const b = await estimate(TODAY, "Snack");
        const requestKey = newRequestKey();
        const { data } = await call(client, "set_entries_status", {
          requestKey,
          entryIds: [b.id, a.id],
          status: "eaten",
        });
        expect(data).toMatchObject({ outcome: "changed", note: RECORDED, changedIds: [a.id, b.id] });
        expect(data.days).toEqual([await restDay(TODAY)]);
        const row = (await records()).at(-1)!;
        expect(row).toMatchObject({ action: "entries.marked", entityIds: [a.id, b.id] });
        expect(row.summary).toMatchObject({
          entity: "entries",
          toDate: null,
          entries: [
            { name: "Breakfast", status: "eaten" },
            { name: "Snack", status: "eaten" },
          ],
        });

        const again = (
          await call(client, "set_entries_status", { requestKey, entryIds: [a.id, b.id], status: "eaten" })
        ).data;
        expect(again).toMatchObject({ outcome: "replayed", changedIds: [a.id, b.id] });
      });

      it("answers unchanged when every entry already has the status, and inserts no row", async () => {
        const a = await estimate(TOMORROW);
        const rows = (await records()).length;
        const { data } = await call(client, "set_entries_status", {
          requestKey: newRequestKey(),
          entryIds: [a.id, "99999999-9999-4999-8999-999999999999"],
          status: "planned",
        });
        expect(data).toMatchObject({ outcome: "unchanged", note: UNCHANGED, changedIds: [] });
        expect(await records()).toHaveLength(rows);
      });
    });

    describe("copy_entries", () => {
      it("makes planned copies in the entries' own order, records them, and replays them by their ids", async () => {
        const first = (await logFood(newRequestKey(), 120, YESTERDAY)).data.entry;
        const second = await estimate(YESTERDAY, "Second");
        const requestKey = newRequestKey();
        const { data } = await call(client, "copy_entries", {
          requestKey,
          entryIds: [second.id, first.id],
          toDate: TOMORROW,
        });
        expect(data).toMatchObject({ outcome: "created", note: RECORDED });
        expect(data.entries.map((e: { name: string; status: string }) => [e.name, e.status])).toEqual([
          [first.name, "planned"],
          ["Second", "planned"],
        ]);
        expect(data.days).toEqual([await restDay(TOMORROW)]);
        const copyIds = data.entries.map((e: { id: string }) => e.id);
        expect((await records()).at(-1)).toMatchObject({
          action: "entries.copied",
          entityIds: copyIds,
          summary: { entity: "entries", toDate: TOMORROW, entries: [{ name: first.name }, { name: "Second" }] },
        });

        const count = await d.entryCount(w.user.id);
        const again = (
          await call(client, "copy_entries", { requestKey, entryIds: [first.id, second.id], toDate: TOMORROW })
        ).data;
        expect(again).toMatchObject({ outcome: "replayed" });
        expect(again.entries.map((e: { id: string }) => e.id)).toEqual(copyIds);
        expect(await d.entryCount(w.user.id)).toBe(count);
      });

      it("refuses an entry id given twice", async () => {
        const a = await estimate();
        const refused = await call(client, "copy_entries", {
          requestKey: newRequestKey(),
          entryIds: [a.id, a.id],
          toDate: TOMORROW,
        });
        expect(refused).toMatchObject({ isError: true, text: expect.stringContaining("Give each entry id once.") });
      });
    });

    describe("remove_entries and restore_entry", () => {
      it("removes entries and records what they were, then restores one, and a second restore changes nothing", async () => {
        const a = await estimate(TODAY, "Gone one");
        const b = await estimate(TODAY, "Gone two");
        const removeKey = newRequestKey();
        const removed = (await call(client, "remove_entries", { requestKey: removeKey, entryIds: [a.id, b.id] })).data;
        expect(removed).toMatchObject({ outcome: "deleted", note: RECORDED, removedIds: [a.id, b.id] });
        expect(removed.days).toEqual([await restDay(TODAY)]);
        expect((await records()).at(-1)).toMatchObject({
          action: "entries.removed",
          entityIds: [a.id, b.id],
          summary: { entity: "entries", entries: [{ name: "Gone one" }, { name: "Gone two" }], toDate: null },
        });
        const replay = (await call(client, "remove_entries", { requestKey: removeKey, entryIds: [b.id, a.id] })).data;
        expect(replay).toMatchObject({ outcome: "replayed", removedIds: [a.id, b.id] });

        const restoreKey = newRequestKey();
        const restored = (await call(client, "restore_entry", { requestKey: restoreKey, entryId: a.id })).data;
        expect(restored).toMatchObject({ outcome: "created", note: RECORDED, entry: { id: a.id, name: "Gone one" } });
        expect((await records()).at(-1)).toMatchObject({ action: "entry.restored", entityIds: [a.id] });

        const rows = (await records()).length;
        const twice = (await call(client, "restore_entry", { requestKey: newRequestKey(), entryId: a.id })).data;
        expect(twice).toMatchObject({ outcome: "unchanged", note: UNCHANGED, entry: { id: a.id } });
        expect(await records()).toHaveLength(rows);
        const retried = (await call(client, "restore_entry", { requestKey: restoreKey, entryId: a.id })).data;
        expect(retried).toMatchObject({ outcome: "replayed", entry: { id: a.id } });
      });

      it("refuses an entry id given twice with the sentence copy_entries gives", async () => {
        const a = await estimate();
        const rows = (await records()).length;
        for (const entryIds of [
          [a.id, a.id],
          [a.id, a.id.toUpperCase()],
        ]) {
          const refused = await call(client, "remove_entries", { requestKey: newRequestKey(), entryIds });
          expect(refused).toMatchObject({ isError: true, text: expect.stringContaining("Give each entry id once.") });
        }
        expect((await restDay(TODAY)).entries.map((e: { id: string }) => e.id)).toContain(a.id);
        expect(await records()).toHaveLength(rows);
      });

      it("answers unchanged when every entry is already gone, and inserts no row", async () => {
        const a = await estimate();
        expect((await d.remove(w.user, a.id)).status).toBe(200);
        const rows = (await records()).length;
        const { data } = await call(client, "remove_entries", { requestKey: newRequestKey(), entryIds: [a.id] });
        expect(data).toMatchObject({ outcome: "unchanged", note: UNCHANGED, removedIds: [] });
        expect(await records()).toHaveLength(rows);
      });
    });

    describe("the day afterwards", () => {
      it("reads the same through get_day as through GET /days/:date", async () => {
        const answer = await written(client, "get_day", { date: TODAY });
        expect(answer).toEqual(await restDay(TODAY));
      });
    });

    describe("another person's ids", () => {
      it("are answered exactly as ids that do not exist, change nothing and record nothing", async () => {
        const other = await writerWithKey(suite, api);
        const theirs = await d.added(other.user, d.estimateBody(ESTIMATE, { date: TODAY, status: "planned" }));
        const theirRemoved = await d.added(other.user, d.estimateBody(ESTIMATE, { date: TODAY, status: "planned" }));
        expect((await d.remove(other.user, theirRemoved.id)).status).toBe(200);
        const theirFood = await d.ownFood(other.user, { energyKcal: 100, proteinG: 10, carbsG: 10, fatG: 2 });
        const theirMeal = await d.meal(other.user, MEAL, "Their lunch");
        const theirDay = (await d.day(other.user, TODAY)).body;
        const mine = (await records()).length;

        // Each tool that takes an id, once with the other person's and once with a new one.
        const calls: [string, (id: string) => Record<string, unknown>, string][] = [
          ["update_entry", (id) => ({ entryId: id, name: "Taken" }), theirs.id],
          ["set_entries_status", (id) => ({ entryIds: [id], status: "eaten" }), theirs.id],
          ["copy_entries", (id) => ({ entryIds: [id], toDate: TOMORROW }), theirs.id],
          ["remove_entries", (id) => ({ entryIds: [id] }), theirs.id],
          ["restore_entry", (id) => ({ entryId: id }), theirRemoved.id],
          ["log_food", (id) => ({ foodId: id, amount: { grams: 100 }, date: TODAY, status: "eaten" }), theirFood],
          ["log_saved_meal", (id) => ({ savedMealId: id, count: 1, date: TODAY, status: "eaten" }), theirMeal],
        ];
        for (const [tool, args, id] of calls) {
          const withTheirs = await call(client, tool, { requestKey: newRequestKey(), ...args(id) });
          const withMissing = await call(client, tool, { requestKey: newRequestKey(), ...args(randomUUID()) });
          expect({ tool, ...withTheirs }).toEqual({ tool, ...withMissing });
        }

        expect((await d.day(other.user, TODAY)).body).toEqual(theirDay);
        expect((await d.restore(other.user, theirRemoved.id)).status).toBe(201);
        expect(await records()).toHaveLength(mine);
        expect(await recordsOf(suite, other.user.id)).toEqual([]);
      });
    });

    describe("a write from the screen", () => {
      it("records nothing, whichever entry route it takes", async () => {
        const rows = (await records()).length;
        const added = await d.added(w.user, d.estimateBody(ESTIMATE, { date: TODAY, status: "planned" }));
        expect((await d.patch(w.user, added.id, { name: "From the screen" })).status).toBe(200);
        expect((await d.setStatus(w.user, [added.id], "eaten")).status).toBe(200);
        const copy = await d.copy(w.user, TOMORROW, [{ sourceId: added.id, id: randomUUID() }]);
        expect(copy.status).toBe(201);
        expect((await d.remove(w.user, added.id)).status).toBe(200);
        expect((await d.restore(w.user, added.id)).status).toBe(201);
        expect(await records()).toHaveLength(rows);
      });
    });
  });
});
