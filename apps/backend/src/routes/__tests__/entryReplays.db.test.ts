import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { signUp } from "../../__tests__/support/apiUser.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Removing, restoring, replaying and copying entries on a real Postgres. A
// removed entry is kept ten minutes and comes back exactly. An add whose id
// was removed adds nothing, so a late retry cannot bring back an undone
// entry. A copy keeps its source's basis, so a hidden source copies too.

const meal600 = { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 };

await describeWithDb("entryReplays", (suite) => {
  const d = daysApi(suite);
  const today = () => helsinkiToday();
  const stored = async (id: string) =>
    (await suite.client.query("SELECT * FROM entries WHERE id = $1", [id])).rows[0] as Record<string, unknown>;

  describe("removing and restoring", () => {
    it("removes an entry, answers its day, and restores it exactly: id, position, basis and figures", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const first = await d.added(user, d.foodBody(food.id, { portionId: food.portionId, count: 1.5 }));
      const second = await d.added(user, d.foodBody(food.id, { grams: 80 }));
      const before = await stored(first.id);

      const removed = await d.remove(user, first.id);
      expect(removed.status).toBe(200);
      expect(removed.body.days[0].entries.map((e: { id: string }) => e.id)).toEqual([second.id]);
      expect(await stored(first.id)).toBeUndefined();

      const back = await d.restore(user, first.id);
      expect(back.status).toBe(201);
      expect(back.body.outcome).toBe("created");
      expect(back.body.entry).toEqual(first);
      expect(back.body.days[0].entries.map((e: { id: string }) => e.id)).toEqual([first.id, second.id]);
      expect(await stored(first.id)).toEqual(before);

      const again = await d.restore(user, first.id);
      expect([again.status, again.body.outcome]).toEqual([200, "replayed"]);
    });

    it("restores after its own food was edited and after it was hidden, with its original figures", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, { energyKcal: 100, proteinG: 10, carbsG: 0, fatG: 0 });
      const entry = await d.added(user, d.foodBody(food, { grams: 200 }));
      const other = await d.added(user, d.foodBody(food, { grams: 100 }));

      await d.remove(user, entry.id);
      const edit = { name: "Oma ruoka", per100g: { energyKcal: 120, proteinG: 12, carbsG: 0, fatG: 0 }, barcode: null };
      expect(
        (
          await d
            .api()
            .put(d.v1(`/foods/${food}`))
            .set(user.auth)
            .send(edit)
        ).status,
      ).toBe(200);
      expect((await d.restore(user, entry.id)).body.entry.figures.energyKcal).toBe(200);

      await d.remove(user, entry.id);
      await d.remove(user, other.id);
      expect(
        (
          await d
            .api()
            .delete(d.v1(`/foods/${food}`))
            .set(user.auth)
        ).status,
      ).toBe(204);
      const back = await d.restore(user, entry.id);
      expect(back.status).toBe(201);
      expect(back.body.entry).toMatchObject({ figures: { energyKcal: 200 }, food: { deleted: true } });
    });

    it("restores a saved meal entry after the meal was hidden", async () => {
      const user = await signUp(suite.client);
      const meal = await d.meal(user, meal600);
      const entry = await d.added(user, d.mealBody(meal, 2));
      await d.remove(user, entry.id);
      expect(
        (
          await d
            .api()
            .delete(d.v1(`/saved-meals/${meal}`))
            .set(user.auth)
        ).status,
      ).toBe(204);
      const back = await d.restore(user, entry.id);
      expect(back.status).toBe(201);
      expect(back.body.entry).toMatchObject({ figures: { energyKcal: 1200 }, savedMeal: { deleted: true } });
    });

    it("hides a food whose only entry was removed in the last ten minutes, so the restore still finds it", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, { energyKcal: 100, proteinG: 10, carbsG: 0, fatG: 0 });
      const entry = await d.added(user, d.foodBody(food, { grams: 100 }));
      await d.remove(user, entry.id);
      await d
        .api()
        .delete(d.v1(`/foods/${food}`))
        .set(user.auth);
      const row = await suite.client.query("SELECT deleted_at FROM foods WHERE id = $1", [food]);
      expect(row.rows[0].deleted_at).toBeInstanceOf(Date);
      expect((await d.restore(user, entry.id)).status).toBe(201);
    });

    it("refuses a restore after ten minutes with 404, and clears the row at the next remove", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const entry = await d.added(user, d.foodBody(food.id, { grams: 100 }));
      const later = await d.added(user, d.foodBody(food.id, { grams: 100 }));
      const { removeEntry, restoreEntry } = await import("../../services/writes/entries.js");
      const now = Date.now();
      await removeEntry(await d.contextAt(user.id, new Date(now)), entry.id);

      const inTime = d.contextAt(user.id, new Date(now + 9 * 60_000));
      const tooLate = await d.contextAt(user.id, new Date(now + 11 * 60_000));
      await expect(restoreEntry(tooLate, entry.id)).rejects.toMatchObject({ code: "entry_not_found", status: 404 });
      expect(await stored(entry.id)).toBeUndefined();

      await removeEntry(tooLate, later.id);
      const kept = await suite.client.query("SELECT id FROM removed_entries WHERE user_id = $1", [user.id]);
      expect(kept.rows.map((r) => r.id)).toEqual([later.id]);
      await expect(restoreEntry(await inTime, entry.id)).rejects.toMatchObject({ code: "entry_not_found" });
    });

    it("clears the user's expired rows at a restore too", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const old = await d.added(user, d.foodBody(food.id, { grams: 100 }));
      const fresh = await d.added(user, d.foodBody(food.id, { grams: 100 }));
      const { removeEntry, restoreEntry } = await import("../../services/writes/entries.js");
      const now = Date.now();
      await removeEntry(await d.contextAt(user.id, new Date(now)), old.id);
      await removeEntry(await d.contextAt(user.id, new Date(now + 5 * 60_000)), fresh.id);

      await restoreEntry(await d.contextAt(user.id, new Date(now + 11 * 60_000)), fresh.id);
      const kept = await suite.client.query("SELECT id FROM removed_entries WHERE user_id = $1", [user.id]);
      expect(kept.rows).toEqual([]);
    });

    it.each([
      ["a column the entries table requires", "status", null],
      ["a value a check refuses", "grams", null],
      ["a value of the wrong type", "position", "not a number"],
    ])("answers a stored row with %s 404 entry_not_found, never 500", async (_label, key, value) => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const entry = await d.added(user, d.foodBody(food.id, { grams: 100 }));
      await d.remove(user, entry.id);
      // A row removed before a migration changed the table: the key is missing or holds what the column refuses.
      const edit = value === null ? "row - $2::text" : "jsonb_set(row, ARRAY[$2::text], to_jsonb($3::text))";
      await suite.client.query(
        `UPDATE removed_entries SET row = ${edit} WHERE id = $1`,
        value === null ? [entry.id, key] : [entry.id, key, value],
      );

      const res = await d.restore(user, entry.id);
      expect([res.status, res.body.code]).toEqual([404, "entry_not_found"]);
      expect(await stored(entry.id)).toBeUndefined();
    });

    it("refuses another user's restore with 404", async () => {
      const owner = await signUp(suite.client);
      const other = await signUp(suite.client);
      const food = await d.fineliFood();
      const entry = await d.added(owner, d.foodBody(food.id, { grams: 100 }));
      await d.remove(owner, entry.id);
      const res = await d.restore(other, entry.id);
      expect([res.status, res.body.code]).toEqual([404, "entry_not_found"]);
      expect((await d.restore(owner, entry.id)).status).toBe(201);
    });
  });

  describe("a late retry", () => {
    it("of an add whose entry was removed answers replayed with no entry, and adds nothing", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const body = d.foodBody(food.id, { grams: 100 });
      const first = await d.added(user, body);
      await d.remove(user, first.id);
      const retry = await d.add(user, body);
      expect(retry.status).toBe(200);
      expect(retry.body).toMatchObject({ entry: null, outcome: "replayed" });
      expect(retry.body.days[0].entries).toEqual([]);
      expect(await d.entryCount(user.id)).toBe(0);
    });

    it("of another user's removed id answers 409", async () => {
      const owner = await signUp(suite.client);
      const other = await signUp(suite.client);
      const food = await d.fineliFood();
      const body = d.foodBody(food.id, { grams: 100 });
      await d.added(owner, body);
      await d.remove(owner, body.id);
      expect((await d.add(other, body)).status).toBe(409);
    });

    it("of a Save and log whose entry was removed answers no entry, and neither the meal nor the entry repeats", async () => {
      const user = await signUp(suite.client);
      const body = {
        meal: { id: randomUUID(), name: "Lohikeitto", source: "Foodie", figures: meal600 },
        entry: { id: randomUUID(), date: today(), status: "eaten", count: 1 },
      };
      const post = () => d.api().post(d.v1("/saved-meals/log")).set(user.auth).send(body);
      const first = await post();
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ outcome: "created", meal: { id: body.meal.id, lastCount: 1 } });
      expect(first.body.entry).toMatchObject({ id: body.entry.id, figures: { energyKcal: 600 } });

      const replay = await post();
      expect([replay.status, replay.body.outcome, replay.body.entry.id]).toEqual([200, "replayed", body.entry.id]);

      await d.remove(user, body.entry.id);
      const late = await post();
      expect(late.status).toBe(200);
      expect(late.body).toMatchObject({ entry: null, outcome: "replayed", meal: { id: body.meal.id } });
      const meals = await suite.client.query("SELECT count(*)::int AS n FROM saved_meals WHERE user_id = $1", [
        user.id,
      ]);
      expect(meals.rows[0].n).toBe(1);
      expect(await d.entryCount(user.id)).toBe(0);
    });
  });

  describe("copying", () => {
    it("copies entries planned to another day, with their basis, in their source order, and replays", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const meal = await d.meal(user, meal600);
      const a = await d.added(user, d.foodBody(food.id, { portionId: food.portionId, count: 1 }));
      const b = await d.added(user, d.mealBody(meal, 1.5));
      const tomorrow = addDays(today(), 1);
      const pairs = [
        { sourceId: b.id, id: randomUUID() },
        { sourceId: a.id, id: randomUUID() },
      ];
      const res = await d.copy(user, tomorrow, pairs);
      expect(res.status).toBe(201);
      expect(res.body.outcome).toBe("created");
      const copies = res.body.days[0].entries;
      expect(copies.map((e: { id: string }) => e.id)).toEqual([pairs[1].id, pairs[0].id]);
      expect(copies[0]).toMatchObject({ status: "planned", date: tomorrow, figures: a.figures, grams: 200 });
      expect(copies[0].portion).toMatchObject({ id: food.portionId, unit: "PORTM", count: 1 });
      expect(copies[1]).toMatchObject({ status: "planned", figures: b.figures, count: 1.5 });
      expect(copies[0].position).toBeLessThan(copies[1].position);

      const replay = await d.copy(user, tomorrow, pairs);
      expect([replay.status, replay.body.outcome]).toEqual([200, "replayed"]);
      expect(await d.entryCount(user.id)).toBe(4);
    });

    it("copies a day whose saved meal was since deleted, with the original figures", async () => {
      const user = await signUp(suite.client);
      const meal = await d.meal(user, meal600);
      const entry = await d.added(user, d.mealBody(meal, 1));
      expect(
        (
          await d
            .api()
            .delete(d.v1(`/saved-meals/${meal}`))
            .set(user.auth)
        ).status,
      ).toBe(204);
      const res = await d.copy(user, addDays(today(), 2), [{ sourceId: entry.id, id: randomUUID() }]);
      expect(res.status).toBe(201);
      expect(res.body.entries[0]).toMatchObject({ figures: { energyKcal: 600 }, savedMeal: { deleted: true } });
    });

    it("refuses an unknown source with 404, another user's id with 409, and repeated ids", async () => {
      const owner = await signUp(suite.client);
      const other = await signUp(suite.client);
      const food = await d.fineliFood();
      const entry = await d.added(owner, d.foodBody(food.id, { grams: 100 }));
      const theirs = await d.added(other, d.foodBody(food.id, { grams: 100 }));

      const unknown = await d.copy(owner, today(), [{ sourceId: randomUUID(), id: randomUUID() }]);
      expect([unknown.status, unknown.body.code]).toEqual([404, "entry_not_found"]);
      const taken = await d.copy(owner, today(), [{ sourceId: entry.id, id: theirs.id }]);
      expect([taken.status, taken.body.code]).toEqual([409, "entry_id_taken"]);
      const id = randomUUID();
      const twice = await d.copy(owner, today(), [
        { sourceId: entry.id, id },
        { sourceId: entry.id, id },
      ]);
      expect([twice.status, twice.body.code]).toEqual([400, "invalid_request"]);
      expect(await d.entryCount(owner.id)).toBe(1);
    });
  });
});
