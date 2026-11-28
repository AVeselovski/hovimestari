import { describe, expect, it } from "@jest/globals";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// An entry keeps the values it was added with. Only an edit of its own food
// or saved meal rewrites it, and only while it is planned and dated today or
// later. Deleting a used source hides it and keeps every entry.

const per100 = (energyKcal: number) => ({ energyKcal, proteinG: 10, carbsG: 0, fatG: 0 });

await describeWithDb("figuresStay", (suite) => {
  const d = daysApi(suite);
  const today = () => helsinkiToday();
  const editFood = (user: ApiUser, id: string, energyKcal: number, barcode: string | null = null) =>
    d
      .api()
      .put(d.v1(`/foods/${id}`))
      .set(user.auth)
      .send({ name: "Oma ruoka", per100g: per100(energyKcal), barcode });
  const deleteFood = (user: ApiUser, id: string) =>
    d
      .api()
      .delete(d.v1(`/foods/${id}`))
      .set(user.auth);
  const kcalOf = async (user: ApiUser, date: string) =>
    (await d.day(user, date)).body.entries.map((e: { figures: { energyKcal: number } }) => e.figures.energyKcal);

  describe("the basis is written once", () => {
    it("corrects last week's 200 g to 210 g after the food changed from 100 to 120 kcal: 210 kcal, never 252", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100(100));
      const lastWeek = addDays(today(), -7);
      const entry = await d.added(user, d.foodBody(food, { grams: 200 }, { date: lastWeek }));
      expect((await editFood(user, food, 120)).status).toBe(200);
      const res = await d.patch(user, entry.id, { amount: { grams: 210 } });
      expect(res.body.entry.figures.energyKcal).toBe(210);
      expect(res.body.entry.figures.energyKcal).not.toBe(252);
    });

    it("keeps the figures through a move and its undo", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100(100));
      const entry = await d.added(user, d.foodBody(food, { grams: 200 }));
      await editFood(user, food, 120);
      const moved = await d.patch(user, entry.id, { date: addDays(today(), -1) });
      expect(moved.body.entry.figures).toEqual(entry.figures);
      const back = await d.patch(user, entry.id, { date: today(), status: "eaten" });
      expect(back.body.entry.figures).toEqual(entry.figures);
      expect(back.body.entry.position).toBe(entry.position);
    });
  });

  describe("editing an own food", () => {
    it("leaves a past day and an eaten entry today, and changes planned entries today and later", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100(100));
      const yesterday = addDays(today(), -1);
      const tomorrow = addDays(today(), 1);
      await d.added(user, d.foodBody(food, { grams: 100 }, { date: yesterday, status: "planned" }));
      await d.added(user, d.foodBody(food, { grams: 100 }, { date: yesterday }));
      await d.added(user, d.foodBody(food, { grams: 100 }));
      await d.added(user, d.foodBody(food, { grams: 100 }, { status: "planned" }));
      await d.added(user, d.foodBody(food, { grams: 100 }, { date: tomorrow, status: "planned" }));

      await editFood(user, food, 150);

      expect(await kcalOf(user, yesterday)).toEqual([100, 100]);
      expect(await kcalOf(user, today())).toEqual([100, 150]);
      expect(await kcalOf(user, tomorrow)).toEqual([150]);
    });
  });

  describe("deleting an own food", () => {
    it("hides a used food: entries stay, search, favourites and the food answer nothing, the barcode is cleared", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100(100), "Mustikkarahka", "6412345678907");
      await d
        .api()
        .put(d.v1(`/foods/${food}/favourite`))
        .set(user.auth);
      await d.added(user, d.foodBody(food, { grams: 200 }));
      await d.added(user, d.foodBody(food, { grams: 100 }, { date: addDays(today(), 3), status: "planned" }));

      expect((await deleteFood(user, food)).status).toBe(204);

      expect(await kcalOf(user, today())).toEqual([200]);
      const day = (await d.day(user, today())).body;
      expect(day.entries[0]).toMatchObject({ name: "Mustikkarahka", food: { deleted: true } });
      expect(await kcalOf(user, addDays(today(), 3))).toEqual([100]);
      const search = await d.api().get(d.v1("/foods/search")).query({ q: "mustikkarahka" }).set(user.auth);
      expect(search.body.foods).toEqual([]);
      expect((await d.api().get(d.v1("/foods/favourites")).set(user.auth)).body.foods).toEqual([]);
      expect((await d.api().get(d.v1("/foods/own")).set(user.auth)).body.foods).toEqual([]);
      const detail = await d
        .api()
        .get(d.v1(`/foods/${food}`))
        .set(user.auth);
      expect([detail.status, detail.body.code]).toEqual([404, "food_not_found"]);
      const row = await suite.client.query("SELECT barcode, deleted_at FROM foods WHERE id = $1", [food]);
      expect(row.rows[0].barcode).toBeNull();
      expect(row.rows[0].deleted_at).toBeInstanceOf(Date);
      // Hidden, it answers 404 to every write, and its barcode is free again.
      expect((await editFood(user, food, 1)).status).toBe(404);
      expect((await deleteFood(user, food)).status).toBe(404);
      expect((await d.add(user, d.foodBody(food, { grams: 1 }))).body.code).toBe("food_not_found");
      await d.ownFood(user, per100(1), "Uusi", "6412345678907");
    });

    it("deletes an unused food outright", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100(100));
      expect((await deleteFood(user, food)).status).toBe(204);
      const row = await suite.client.query("SELECT count(*)::int AS n FROM foods WHERE id = $1", [food]);
      expect(row.rows[0].n).toBe(0);
    });

    it("keeps a hidden food after its last entry is removed", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100(100));
      const entry = await d.added(user, d.foodBody(food, { grams: 100 }));
      await deleteFood(user, food);
      await d.remove(user, entry.id);
      const row = await suite.client.query("SELECT count(*)::int AS n FROM foods WHERE id = $1", [food]);
      expect(row.rows[0].n).toBe(1);
    });
  });

  describe("saved meals", () => {
    const figures = (energyKcal: number) => ({ energyKcal, proteinG: 40, carbsG: 60, fatG: 20 });
    const editMeal = (user: ApiUser, id: string, energyKcal: number) =>
      d
        .api()
        .put(d.v1(`/saved-meals/${id}`))
        .set(user.auth)
        .send({ name: "Lounas", source: "Foodie", figures: figures(energyKcal) });
    const deleteMeal = (user: ApiUser, id: string) =>
      d
        .api()
        .delete(d.v1(`/saved-meals/${id}`))
        .set(user.auth);

    it("an edit leaves a past day and an eaten entry today, and changes planned entries from today on", async () => {
      const user = await signUp(suite.client);
      const meal = await d.meal(user, figures(600));
      const yesterday = addDays(today(), -1);
      await d.added(user, d.mealBody(meal, 1, { date: yesterday, status: "planned" }));
      await d.added(user, d.mealBody(meal, 1));
      await d.added(user, d.mealBody(meal, 1, { status: "planned" }));
      await d.added(user, d.mealBody(meal, 2, { date: addDays(today(), 1), status: "planned" }));

      const res = await editMeal(user, meal, 700);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ source: "Foodie", figures: figures(700) });

      expect(await kcalOf(user, yesterday)).toEqual([600]);
      expect(await kcalOf(user, today())).toEqual([600, 700]);
      expect(await kcalOf(user, addDays(today(), 1))).toEqual([1400]);
    });

    it("deleting a used meal hides it and keeps its entries, an unused one is deleted outright", async () => {
      const user = await signUp(suite.client);
      const used = await d.meal(user, figures(600), "Used");
      const unused = await d.meal(user, figures(600), "Unused");
      await d.added(user, d.mealBody(used, 1));

      expect((await deleteMeal(user, used)).status).toBe(204);
      expect((await deleteMeal(user, unused)).status).toBe(204);

      expect(await kcalOf(user, today())).toEqual([600]);
      expect((await d.day(user, today())).body.entries[0]).toMatchObject({
        name: "Used",
        savedMeal: { deleted: true },
      });
      expect((await d.api().get(d.v1("/saved-meals")).set(user.auth)).body.meals).toEqual([]);
      const get = await d
        .api()
        .get(d.v1(`/saved-meals/${used}`))
        .set(user.auth);
      expect([get.status, get.body.code]).toEqual([404, "saved_meal_not_found"]);
      expect((await d.add(user, d.mealBody(used, 1))).body.code).toBe("saved_meal_not_found");
      expect((await editMeal(user, used, 1)).status).toBe(404);
      const rows = await suite.client.query("SELECT id FROM saved_meals WHERE user_id = $1", [user.id]);
      expect(rows.rows.map((r) => r.id)).toEqual([used]);
    });

    it("keeps a hidden meal after its last entry is removed", async () => {
      const user = await signUp(suite.client);
      const meal = await d.meal(user, figures(600));
      const entry = await d.added(user, d.mealBody(meal, 1));
      await deleteMeal(user, meal);
      await d.remove(user, entry.id);
      const rows = await suite.client.query("SELECT count(*)::int AS n FROM saved_meals WHERE id = $1", [meal]);
      expect(rows.rows[0].n).toBe(1);
    });
  });

  describe("the portion hint", () => {
    it("reads null for a portion of another food or another user's portion, and never changes the figures", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      const food = await d.fineliFood();
      const elsewhere = await d.fineliFood();
      const theirs = await d.ownPortion(other, food.id, 30);
      const entry = await d.added(user, d.foodBody(food.id, { portionId: food.portionId, count: 1 }));
      const portionOf = async () => (await d.day(user, today())).body.entries[0];

      for (const hint of [elsewhere.portionId, theirs]) {
        await suite.client.query("UPDATE entries SET portion_id = $2 WHERE id = $1", [entry.id, hint]);
        const read = await portionOf();
        expect(read.portion).toEqual({ id: null, unit: "PORTM", name: null, count: 1 });
        expect(read.figures).toEqual(entry.figures);
      }
    });

    it("survives removing the portion: the entry and its figures stay, and the last amount's portion id is null", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100(100));
      const portion = await d.ownPortion(user, food, 55, "Pala");
      const entry = await d.added(user, d.foodBody(food, { portionId: portion, count: 2 }));
      const del = await d
        .api()
        .delete(d.v1(`/foods/${food}/portions/${portion}`))
        .set(user.auth);
      expect(del.status).toBe(204);
      const read = (await d.day(user, today())).body.entries[0];
      expect(read).toMatchObject({ grams: 110, portion: { id: null, name: "Pala", count: 2 }, figures: entry.figures });
      const detail = await d
        .api()
        .get(d.v1(`/foods/${food}`))
        .set(user.auth);
      expect(detail.body.lastAmount).toEqual({ grams: 110, portion: { id: null, unit: null, name: "Pala", count: 2 } });
    });
  });
});
