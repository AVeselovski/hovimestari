import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Removing several entries in one request on a real Postgres: only the user's
// own and still there, whatever happened to them since, each restorable for
// ten minutes exactly as a single removal is. The sequence a copy's Undo runs
// leaves both days as they were.

const lunch = { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 };
const snack = { energyKcal: 150.5, proteinG: 12.3, carbsG: 10, fatG: 5 };
const dinner = { energyKcal: 820, proteinG: 55.5, carbsG: 70, fatG: 30 };

await describeWithDb("entriesRemove", (suite) => {
  const d = daysApi(suite);
  const today = () => helsinkiToday();
  const removeMany = (user: ApiUser, entryIds: string[]) =>
    d.api().post(d.v1("/entries/remove")).set(user.auth).send({ entryIds });
  const dayOf = async (user: ApiUser, date: string) => (await d.day(user, date)).body as Record<string, unknown>;
  const ids = (day: { entries: { id: string }[] }) => day.entries.map((e) => e.id);
  const estimate = (user: ApiUser, figures: typeof lunch, date = today(), status: "planned" | "eaten" = "planned") =>
    d.added(user, d.estimateBody(figures, { date, status }));
  const removedRows = async (userId: string) =>
    (await suite.client.query("SELECT id FROM removed_entries WHERE user_id = $1 ORDER BY id", [userId])).rows.map(
      (r) => r.id as string,
    );

  describe("removing", () => {
    it("removes entries across two days and answers both days, read after the write, in date order", async () => {
      const user = await signUp(suite.client);
      const tomorrow = addDays(today(), 1);
      const a = await estimate(user, lunch, tomorrow);
      const kept = await estimate(user, snack, today());
      const b = await estimate(user, dinner, today());
      const c = await estimate(user, snack, tomorrow);

      const res = await removeMany(user, [c.id, a.id, b.id]);
      expect(res.status).toBe(200);
      expect(res.body.removedIds).toEqual([b.id, a.id, c.id]);
      expect(res.body.days.map((day: { date: string }) => day.date)).toEqual([today(), tomorrow]);
      expect(res.body.days[0]).toEqual(await dayOf(user, today()));
      expect(res.body.days[1]).toEqual(await dayOf(user, tomorrow));
      expect(ids(res.body.days[0])).toEqual([kept.id]);
      expect(ids(res.body.days[1])).toEqual([]);
      // Fresh totals: only the kept snack is left (planned), and tomorrow is empty.
      expect(res.body.days[0].withPlan.figures.energyKcal).toBe(151);
      expect(res.body.days[1].withPlan.figures.energyKcal).toBe(0);
      expect(await d.entryCount(user.id)).toBe(1);
    });

    it("answers a repeat 200 with empty lists and changes nothing", async () => {
      const user = await signUp(suite.client);
      const a = await estimate(user, lunch);
      const b = await estimate(user, snack);
      expect((await removeMany(user, [a.id, b.id])).body.removedIds).toHaveLength(2);

      const repeat = await removeMany(user, [a.id, b.id]);
      expect(repeat.status).toBe(200);
      expect(repeat.body).toEqual({ removedIds: [], days: [] });
      expect((await removedRows(user.id)).sort()).toEqual([a.id, b.id].sort());
    });

    it("neither removes nor reveals another user's entry", async () => {
      const owner = await signUp(suite.client);
      const other = await signUp(suite.client);
      const theirs = await estimate(owner, lunch);
      const before = await dayOf(owner, today());

      const res = await removeMany(other, [theirs.id]);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ removedIds: [], days: [] });
      expect(await dayOf(owner, today())).toEqual(before);
      expect(await removedRows(owner.id)).toEqual([]);
      expect(await removedRows(other.id)).toEqual([]);
    });

    it("removes the valid ids of a mix of valid, unknown, already removed and another user's", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      const gone = await estimate(user, lunch);
      await d.remove(user, gone.id);
      const valid = await estimate(user, snack);
      const theirs = await estimate(other, dinner);

      const res = await removeMany(user, [randomUUID(), gone.id, theirs.id, valid.id]);
      expect(res.status).toBe(200);
      expect(res.body.removedIds).toEqual([valid.id]);
      expect(ids(res.body.days[0])).toEqual([]);
      expect(await d.entryCount(other.id)).toBe(1);
      // The earlier removal keeps its own row, untouched by this one.
      expect((await removedRows(user.id)).sort()).toEqual([gone.id, valid.id].sort());
    });

    it("removes entries edited, marked eaten and moved since they were copied", async () => {
      const user = await signUp(suite.client);
      const tomorrow = addDays(today(), 1);
      const food = await d.fineliFood();
      const sources = [
        await d.added(user, d.foodBody(food.id, { grams: 100 }, { date: addDays(today(), -1) })),
        await estimate(user, lunch, addDays(today(), -1)),
        await estimate(user, snack, addDays(today(), -1)),
      ];
      const pairs = sources.map((s) => ({ sourceId: s.id, id: randomUUID() }));
      expect((await d.copy(user, today(), pairs)).status).toBe(201);
      const [edited, eaten, moved] = pairs.map((p) => p.id);
      expect((await d.patch(user, edited, { amount: { grams: 250 } })).status).toBe(200);
      expect((await d.setStatus(user, [eaten], "eaten")).body.changedIds).toEqual([eaten]);
      expect((await d.patch(user, moved, { date: tomorrow })).status).toBe(200);

      const res = await removeMany(user, [moved, eaten, edited]);
      expect(res.body.removedIds).toEqual([edited, eaten, moved]);
      expect(res.body.days.map((day: { date: string }) => day.date)).toEqual([today(), tomorrow]);
      expect(await d.entryCount(user.id)).toBe(3);
    });

    it("orders removedIds by position as a number: 9 before 10", async () => {
      const user = await signUp(suite.client);
      const first = await estimate(user, lunch);
      const second = await estimate(user, snack);
      // Text order would put "10" before "9".
      await suite.client.query("UPDATE entries SET position = 10 WHERE id = $1", [first.id]);
      await suite.client.query("UPDATE entries SET position = 9 WHERE id = $1", [second.id]);

      const res = await removeMany(user, [first.id, second.id]);
      expect(res.body.removedIds).toEqual([second.id, first.id]);
    });
  });

  describe("restoring", () => {
    it("keeps each removed entry restorable by the restore route, and the days then match what they were", async () => {
      const user = await signUp(suite.client);
      const tomorrow = addDays(today(), 1);
      const food = await d.fineliFood();
      const a = await d.added(user, d.foodBody(food.id, { portionId: food.portionId, count: 1.5 }));
      const b = await estimate(user, lunch, today(), "eaten");
      const c = await estimate(user, dinner, tomorrow);
      await estimate(user, snack);
      const stored = async (id: string) =>
        (await suite.client.query("SELECT * FROM entries WHERE id = $1", [id])).rows[0];
      const rowsBefore = [await stored(a.id), await stored(b.id), await stored(c.id)];
      const before = [await dayOf(user, today()), await dayOf(user, tomorrow)];

      expect((await removeMany(user, [a.id, b.id, c.id])).body.removedIds).toHaveLength(3);
      for (const id of [c.id, a.id, b.id]) expect((await d.restore(user, id)).status).toBe(201);

      expect([await dayOf(user, today()), await dayOf(user, tomorrow)]).toEqual(before);
      expect([await stored(a.id), await stored(b.id), await stored(c.id)]).toEqual(rowsBefore);
      expect(await removedRows(user.id)).toEqual([]);
    });

    it("refuses a restore after ten minutes, as a single removal does", async () => {
      const user = await signUp(suite.client);
      const a = await estimate(user, lunch);
      const b = await estimate(user, snack);
      const { removeEntries, restoreEntry } = await import("../../services/writes/entries.js");
      const now = Date.now();
      await removeEntries(await d.contextAt(user.id, new Date(now)), [a.id, b.id]);

      await expect(restoreEntry(await d.contextAt(user.id, new Date(now + 9 * 60_000)), a.id)).resolves.toMatchObject({
        outcome: "created",
      });
      await expect(restoreEntry(await d.contextAt(user.id, new Date(now + 11 * 60_000)), b.id)).rejects.toMatchObject({
        code: "entry_not_found",
        status: 404,
      });
    });

    it("clears the user's expired removals, as every removal does", async () => {
      const user = await signUp(suite.client);
      const old = await estimate(user, lunch);
      const fresh = await estimate(user, snack);
      const { removeEntry, removeEntries } = await import("../../services/writes/entries.js");
      const now = Date.now();
      await removeEntry(await d.contextAt(user.id, new Date(now)), old.id);
      await removeEntries(await d.contextAt(user.id, new Date(now + 11 * 60_000)), [fresh.id]);
      expect(await removedRows(user.id)).toEqual([fresh.id]);
    });
  });

  describe("the copy's Undo", () => {
    it("copies three entries to another day, removes those ids, and both days are as they were", async () => {
      const user = await signUp(suite.client);
      const target = addDays(today(), 2);
      const sources = [
        await estimate(user, lunch, today(), "eaten"),
        await estimate(user, snack),
        await estimate(user, dinner),
      ];
      await estimate(user, snack, target);
      const sourceDay = await dayOf(user, today());
      const targetDay = await dayOf(user, target);

      const pairs = sources.map((s) => ({ sourceId: s.id, id: randomUUID() }));
      const copied = await d.copy(user, target, pairs);
      expect(copied.status).toBe(201);
      const undo = await removeMany(
        user,
        pairs.map((p) => p.id),
      );
      expect(undo.status).toBe(200);
      expect(undo.body.removedIds).toEqual(pairs.map((p) => p.id));
      expect(undo.body.days).toEqual([targetDay]);
      expect(await dayOf(user, target)).toEqual(targetDay);
      expect(await dayOf(user, today())).toEqual(sourceDay);

      // A retry of the copy after its Undo adds nothing.
      const retry = await d.copy(user, target, pairs);
      expect(retry.status).toBe(200);
      expect(retry.body.outcome).toBe("replayed");
      expect(await dayOf(user, target)).toEqual(targetDay);
    });
  });

  describe("concurrency", () => {
    it("leaves one consistent result for two identical requests at once", async () => {
      const user = await signUp(suite.client);
      const entryIds = [
        (await estimate(user, lunch)).id,
        (await estimate(user, snack)).id,
        (await estimate(user, dinner, addDays(today(), 1))).id,
      ];
      const answers = await Promise.all([removeMany(user, entryIds), removeMany(user, entryIds)]);
      expect(answers.map((a) => a.status)).toEqual([200, 200]);
      const counts = answers.map((a) => a.body.removedIds.length).sort();
      expect(counts).toEqual([0, 3]);
      expect(await d.entryCount(user.id)).toBe(0);
      expect(await removedRows(user.id)).toEqual([...entryIds].sort());
    });
  });

  describe("the body", () => {
    it("answers 400 invalid_request to an empty list, over 100 ids, a repeated id and a malformed id", async () => {
      const user = await signUp(suite.client);
      const entry = await estimate(user, lunch);
      const over = Array.from({ length: 101 }, () => randomUUID());
      for (const entryIds of [[], over, [entry.id, entry.id], [entry.id, entry.id.toUpperCase()], ["nope"]]) {
        const res = await removeMany(user, entryIds);
        expect([res.status, res.body.code]).toEqual([400, "invalid_request"]);
      }
      const missing = await d.api().post(d.v1("/entries/remove")).set(user.auth).send({});
      expect([missing.status, missing.body.code]).toEqual([400, "invalid_request"]);
      expect(await d.entryCount(user.id)).toBe(1);
    });

    it("takes exactly 100 ids", async () => {
      const user = await signUp(suite.client);
      const entry = await estimate(user, lunch);
      const full = [entry.id, ...Array.from({ length: 99 }, () => randomUUID())];
      const res = await removeMany(user, full);
      expect([res.status, res.body.removedIds]).toEqual([200, [entry.id]]);
    });

    it("answers 401 without a session", async () => {
      const res = await d
        .api()
        .post(d.v1("/entries/remove"))
        .send({ entryIds: [randomUUID()] });
      expect(res.status).toBe(401);
    });
  });
});
