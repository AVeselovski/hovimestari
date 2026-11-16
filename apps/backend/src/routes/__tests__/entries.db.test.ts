import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Entry writes on a real, migrated Postgres: adds of each kind, amounts in
// grams and portions, replays, the future rule, moves, batch status changes,
// kind mismatches, validation codes, and another user's rows answering 404.

const quark = { energyKcal: 59.31, proteinG: 10.5, carbsG: 3.6, fatG: 0.2 };

await describeWithDb("entries", (suite) => {
  const d = daysApi(suite);
  const today = () => helsinkiToday();

  describe("adding", () => {
    it("adds a food by grams, figured from its values per 100 g, and answers its day", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const res = await d.add(user, d.foodBody(food.id, { grams: 250 }));
      expect(res.status).toBe(201);
      expect(res.body.outcome).toBe("created");
      expect(res.body.entry).toMatchObject({
        kind: "food",
        status: "eaten",
        grams: 250,
        portion: null,
        food: { id: food.id, source: "fineli", retired: false, deleted: false },
        figures: { energyKcal: 148, proteinG: 26.3, carbsG: 9, fatG: 0.5 },
        isEstimate: false,
      });
      expect(res.body.days).toHaveLength(1);
      expect(res.body.days[0].date).toBe(today());
      expect(res.body.days[0].entries.map((e: { id: string }) => e.id)).toEqual([res.body.entry.id]);
    });

    it("adds a food by a count of a portion: 2.5 x 55 g is 137.5 g", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, { energyKcal: 100, proteinG: 10, carbsG: 0, fatG: 0 });
      const portionId = await d.ownPortion(user, food, 55, "Medium piece");
      const res = await d.add(user, d.foodBody(food, { portionId, count: 2.5 }));
      expect(res.status).toBe(201);
      expect(res.body.entry).toMatchObject({
        grams: 137.5,
        portion: { id: portionId, unit: null, name: "Medium piece", count: 2.5 },
        figures: { energyKcal: 138, proteinG: 13.8 },
      });
    });

    it("refuses a portion of another food, and another user's portion, with portion_not_found", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      const food = await d.fineliFood();
      const elsewhere = await d.fineliFood();
      const theirs = await d.ownPortion(other, food.id, 30);
      for (const portionId of [elsewhere.portionId, theirs]) {
        const res = await d.add(user, d.foodBody(food.id, { portionId, count: 1 }));
        expect(res.status).toBe(404);
        expect(res.body.code).toBe("portion_not_found");
      }
      expect(await d.entryCount(user.id)).toBe(0);
    });

    it("refuses a portion count whose weight the entry cannot hold", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const res = await d.add(user, d.foodBody(food.id, { portionId: food.portionId, count: 26 })); // 5200 g
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("entry_grams_invalid");
    });

    it("adds an estimate with its own figures and note, marked as one", async () => {
      const user = await signUp(suite.client);
      const res = await d.add(
        user,
        d.estimateBody({ energyKcal: 850.5, proteinG: 42.3, carbsG: 90, fatG: 30.1 }, { note: "  Pasta  " }),
      );
      expect(res.status).toBe(201);
      expect(res.body.entry).toMatchObject({
        kind: "estimate",
        name: "Ravintola",
        note: "Pasta",
        isEstimate: true,
        figures: { energyKcal: 851, proteinG: 42.3, carbsG: 90, fatG: 30.1 },
      });
    });

    it("answers a repeated id with 200, the first entry and one row", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const body = d.foodBody(food.id, { grams: 100 });
      const first = await d.add(user, body);
      const again = await d.add(user, { ...body, amount: { grams: 300 } });
      expect(first.status).toBe(201);
      expect(again.status).toBe(200);
      expect(again.body.outcome).toBe("replayed");
      expect(again.body.entry).toEqual(first.body.entry);
      expect(await d.entryCount(user.id)).toBe(1);
    });

    it("refuses another user's entry id with 409 entry_id_taken", async () => {
      const owner = await signUp(suite.client);
      const other = await signUp(suite.client);
      const food = await d.fineliFood();
      const body = d.foodBody(food.id, { grams: 100 });
      await d.added(owner, body);
      const res = await d.add(other, body);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("entry_id_taken");
      expect(await d.entryCount(other.id)).toBe(0);
    });

    it("refuses eaten on a future date with 400, and adds it planned", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const tomorrow = addDays(today(), 1);
      const eaten = await d.add(user, d.foodBody(food.id, { grams: 100 }, { date: tomorrow, status: "eaten" }));
      expect(eaten.status).toBe(400);
      expect(eaten.body.code).toBe("entry_eaten_in_future");
      const planned = await d.add(user, d.foodBody(food.id, { grams: 100 }, { date: tomorrow, status: "planned" }));
      expect(planned.status).toBe(201);
      expect(planned.body.days[0].relation).toBe("future");
    });

    it("logs a retired Fineli food, and its entries keep working", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const before = await d.added(user, d.foodBody(food.id, { grams: 100 }));
      await suite.client.query("UPDATE foods SET retired_at = now() WHERE id = $1", [food.id]);
      const after = await d.add(user, d.foodBody(food.id, { grams: 100 }));
      expect(after.status).toBe(201);
      const day = (await d.day(user, today())).body;
      expect(day.entries.map((e: { id: string }) => e.id)).toEqual([before.id, after.body.entry.id]);
      expect(day.entries[0].food.retired).toBe(true);
      expect(day.eaten.figures.energyKcal).toBe(118);
    });

    it.each([
      [{ kind: "food", amount: { grams: 0 } }, "entry_grams_invalid"],
      [{ kind: "food", amount: { grams: 5000.1 } }, "entry_grams_invalid"],
      [{ kind: "food", amount: { grams: 1.25 } }, "entry_grams_invalid"],
      [{ kind: "food", amount: { portionId: randomUUID(), count: 0 } }, "entry_count_invalid"],
      [{ kind: "food", amount: { portionId: randomUUID(), count: 100.01 } }, "entry_count_invalid"],
      [{ kind: "food", amount: { portionId: randomUUID(), count: 1.234 } }, "entry_count_invalid"],
      [{ kind: "food", amount: { grams: 10, portionId: randomUUID(), count: 1 } }, "invalid_request"],
      [{ kind: "food", amount: {} }, "invalid_request"],
      [{ kind: "saved_meal", count: 0 }, "entry_count_invalid"],
      [{ kind: "estimate", figures: { proteinG: 1, carbsG: 1, fatG: 1 } }, "figure_required"],
      [{ kind: "estimate", figures: { energyKcal: 10000.1, proteinG: 1, carbsG: 1, fatG: 1 } }, "figure_invalid"],
      [{ kind: "estimate", figures: { energyKcal: 1, proteinG: 1000.5, carbsG: 1, fatG: 1 } }, "figure_invalid"],
      [{ kind: "estimate", name: "  " }, "name_required"],
      [{ kind: "estimate", name: "x".repeat(121) }, "name_too_long"],
      [{ kind: "estimate", note: "x".repeat(501) }, "note_too_long"],
      [{ kind: "estimate", date: "2026-02-30" }, "invalid_date"],
      [{ kind: "nonsense" }, "invalid_request"],
    ])("refuses %j with %p", async (overrides, code) => {
      const user = await signUp(suite.client);
      const base = {
        food: d.foodBody(randomUUID(), { grams: 100 }),
        saved_meal: d.mealBody(randomUUID(), 1),
        estimate: d.estimateBody({ energyKcal: 1, proteinG: 1, carbsG: 1, fatG: 1 }),
        nonsense: d.estimateBody({ energyKcal: 1, proteinG: 1, carbsG: 1, fatG: 1 }),
      }[overrides.kind as "food"];
      const res = await d.add(user, { ...base, ...overrides });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
      expect(await d.entryCount(user.id)).toBe(0);
    });
  });

  describe("another user's rows", () => {
    it("answers 404 for another user's own food, saved meal and entry, everywhere", async () => {
      const owner = await signUp(suite.client);
      const other = await signUp(suite.client);
      const food = await d.ownFood(owner, quark);
      const meal = await d.meal(owner, { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 });
      const entry = await d.added(owner, d.foodBody(food, { grams: 100 }));

      const viaFood = await d.add(other, d.foodBody(food, { grams: 100 }));
      expect([viaFood.status, viaFood.body.code]).toEqual([404, "food_not_found"]);
      const viaMeal = await d.add(other, d.mealBody(meal, 1));
      expect([viaMeal.status, viaMeal.body.code]).toEqual([404, "saved_meal_not_found"]);
      for (const res of [
        await d.patch(other, entry.id, { amount: { grams: 1 } }),
        await d.patch(other, entry.id, { status: "planned" }),
        await d.remove(other, entry.id),
        await d.restore(other, entry.id),
      ]) {
        expect([res.status, res.body.code]).toEqual([404, "entry_not_found"]);
      }
      const copied = await d.copy(other, today(), [{ sourceId: entry.id, id: randomUUID() }]);
      expect([copied.status, copied.body.code]).toEqual([404, "entry_not_found"]);
      const marked = await d.setStatus(other, [entry.id], "planned");
      expect(marked.body).toEqual({ changedIds: [], days: [] });
      expect((await d.day(other, today())).body.entries).toEqual([]);
      expect((await d.day(owner, today())).body.entries[0].status).toBe("eaten");
    });

    it("answers 404 for a malformed entry id", async () => {
      const user = await signUp(suite.client);
      expect((await d.patch(user, "not-a-uuid", { status: "planned" })).body.code).toBe("entry_not_found");
      expect((await d.remove(user, "not-a-uuid")).body.code).toBe("entry_not_found");
      expect((await d.restore(user, "not-a-uuid")).body.code).toBe("entry_not_found");
    });
  });

  describe("editing and moving", () => {
    it("moves an eaten entry to a future date without a status and turns it planned, answering both days", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const entry = await d.added(user, d.foodBody(food.id, { grams: 100 }));
      const tomorrow = addDays(today(), 1);
      const res = await d.patch(user, entry.id, { date: tomorrow });
      expect(res.status).toBe(200);
      expect(res.body.outcome).toBe("changed");
      expect(res.body.entry).toMatchObject({ date: tomorrow, status: "planned", position: entry.position });
      expect(res.body.days.map((day: { date: string }) => day.date)).toEqual([today(), tomorrow]);
      expect(res.body.days[0].entries).toEqual([]);
    });

    it("refuses setting eaten on a future date, also as part of a move", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const entry = await d.added(user, d.foodBody(food.id, { grams: 100 }));
      const res = await d.patch(user, entry.id, { date: addDays(today(), 1), status: "eaten" });
      expect([res.status, res.body.code]).toEqual([400, "entry_eaten_in_future"]);
      expect((await d.day(user, today())).body.entries[0].status).toBe("eaten");
    });

    it("edits the amount of an eaten entry whose date a time-zone change made future", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const entry = await d.added(user, d.foodBody(food.id, { grams: 100 }));
      // The state a move west leaves: an eaten entry dated after the user's today.
      await suite.client.query("UPDATE entries SET date = $2 WHERE id = $1", [entry.id, addDays(today(), 1)]);
      const res = await d.patch(user, entry.id, { amount: { grams: 200 } });
      expect(res.status).toBe(200);
      expect(res.body.entry).toMatchObject({ status: "eaten", grams: 200 });
    });

    it("marks eaten and back to planned, setting and clearing when it was eaten", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const entry = await d.added(user, d.foodBody(food.id, { grams: 100 }, { status: "planned" }));
      const eatenAt = async () =>
        (await suite.client.query("SELECT eaten_at FROM entries WHERE id = $1", [entry.id])).rows[0].eaten_at;
      expect(await eatenAt()).toBeNull();
      expect((await d.patch(user, entry.id, { status: "eaten", amount: { grams: 150 } })).body.entry).toMatchObject({
        status: "eaten",
        grams: 150,
      });
      const marked = await eatenAt();
      expect(marked).toBeInstanceOf(Date);
      await d.patch(user, entry.id, { amount: { grams: 160 } });
      expect(await eatenAt()).toEqual(marked);
      await d.patch(user, entry.id, { status: "planned" });
      expect(await eatenAt()).toBeNull();
    });

    it("refuses a change that does not fit the entry's kind with entry_kind_mismatch", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const meal = await d.meal(user, { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 });
      const foodEntry = await d.added(user, d.foodBody(food.id, { grams: 100 }));
      const mealEntry = await d.added(user, d.mealBody(meal, 1));
      const estimate = await d.added(user, d.estimateBody({ energyKcal: 1, proteinG: 1, carbsG: 1, fatG: 1 }));
      for (const [id, body] of [
        [foodEntry.id, { count: 2 }],
        [foodEntry.id, { name: "Rename" }],
        [mealEntry.id, { amount: { grams: 10 } }],
        [mealEntry.id, { note: "x" }],
        [estimate.id, { count: 2 }],
        [estimate.id, { amount: { grams: 10 } }],
      ] as const) {
        const res = await d.patch(user, id, body);
        expect([res.status, res.body.code]).toEqual([400, "entry_kind_mismatch"]);
      }
    });

    it("edits an estimate's name, figures and note", async () => {
      const user = await signUp(suite.client);
      const estimate = await d.added(user, d.estimateBody({ energyKcal: 500, proteinG: 20, carbsG: 50, fatG: 20 }));
      const res = await d.patch(user, estimate.id, {
        name: "Pizza",
        figures: { energyKcal: 900, proteinG: 35, carbsG: 100, fatG: 30 },
        note: "",
      });
      expect(res.body.entry).toMatchObject({ name: "Pizza", note: null, figures: { energyKcal: 900, proteinG: 35 } });
    });

    it("refuses an empty change", async () => {
      const user = await signUp(suite.client);
      const res = await d.patch(user, randomUUID(), {});
      expect([res.status, res.body.code]).toEqual([400, "invalid_request"]);
    });
  });

  describe("marking several entries", () => {
    it("changes the listed entries that exist, and skips a removed one, a future one and one already eaten", async () => {
      const user: ApiUser = await signUp(suite.client);
      const food = await d.fineliFood();
      const planned = (date = today()) => d.foodBody(food.id, { grams: 100 }, { status: "planned", date });
      const a = await d.added(user, planned());
      const b = await d.added(user, planned());
      const gone = await d.added(user, planned());
      const future = await d.added(user, planned(addDays(today(), 1)));
      const eaten = await d.added(user, d.foodBody(food.id, { grams: 100 }));
      await d.remove(user, gone.id);

      const res = await d.setStatus(user, [b.id, gone.id, a.id, future.id, eaten.id], "eaten");
      expect(res.status).toBe(200);
      expect(res.body.changedIds).toEqual([a.id, b.id]);
      expect(res.body.days.map((day: { date: string }) => day.date)).toEqual([today()]);
      expect(res.body.days[0].plannedCount).toBe(0);

      const undo = await d.setStatus(user, res.body.changedIds, "planned");
      expect(undo.body.changedIds).toEqual([a.id, b.id]);
      expect(undo.body.days[0].eaten.figures.energyKcal).toBe(59);
    });

    it("refuses an empty list and more than 100 ids", async () => {
      const user = await signUp(suite.client);
      for (const entryIds of [[], Array.from({ length: 101 }, () => randomUUID())]) {
        const res = await d.setStatus(user, entryIds, "eaten");
        expect([res.status, res.body.code]).toEqual([400, "invalid_request"]);
      }
    });
  });

  it("refuses an unauthenticated request", async () => {
    expect((await d.api().post(d.v1("/entries")).send({})).status).toBe(401);
    expect((await d.api().get(d.v1("/days/today"))).status).toBe(401);
  });
});
