import { expect, it } from "@jest/globals";
import { signUp } from "../../__tests__/support/apiUser.js";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// An own food's protein, carbohydrates and fat together, on a real, migrated
// Postgres: create and edit refuse a sum above 101.5 g per 100 g and store
// nothing, and a food already stored with a larger sum still reads, lists,
// logs and totals.

const fits = { energyKcal: 400, proteinG: 33.5, carbsG: 33.5, fatG: 34.5 }; // 101.5 g
const over = { energyKcal: 400, proteinG: 33.5, carbsG: 33.5, fatG: 34.501 }; // 101.501 g

await describeWithDb("own food macro sum", (suite) => {
  const d = daysApi(suite);
  const ownFoodCount = async (userId: string) =>
    (await suite.client.query("SELECT count(*)::int AS n FROM foods WHERE user_id = $1", [userId])).rows[0].n as number;

  it("creates a food at 101.5 g, and refuses 101.501 g with 400 food_macro_sum_too_high, storing nothing", async () => {
    const user = await signUp(suite.client);
    const ok = await d.api().post(d.v1("/foods")).set(user.auth).send({ name: "Tasan", per100g: fits });
    expect(ok.status).toBe(201);
    expect(ok.body.per100g).toEqual(fits);
    const res = await d.api().post(d.v1("/foods")).set(user.auth).send({ name: "Liikaa", per100g: over });
    expect([res.status, res.body.code]).toEqual([400, "food_macro_sum_too_high"]);
    expect(await ownFoodCount(user.id)).toBe(1);
  });

  it("refuses an edit to 101.501 g and keeps the stored values", async () => {
    const user = await signUp(suite.client);
    const id = await d.ownFood(user, fits, "Tasan");
    const res = await d
      .api()
      .put(d.v1(`/foods/${id}`))
      .set(user.auth)
      .send({ name: "Tasan", per100g: over });
    expect([res.status, res.body.code]).toEqual([400, "food_macro_sum_too_high"]);
    const { rows } = await suite.client.query("SELECT fat_g::float8 AS fat FROM foods WHERE id = $1", [id]);
    expect(rows[0].fat).toBe(34.5);
  });

  it("reads, lists, searches, logs and totals a food already stored over the sum", async () => {
    const user = await signUp(suite.client);
    const id = await d.ownFood(user, { energyKcal: 400, proteinG: 10, carbsG: 10, fatG: 10 }, "Vanha herkku");
    // A food stored before the rule, planted past the API.
    await suite.client.query("UPDATE foods SET protein_g = 100, carbs_g = 100, fat_g = 100 WHERE id = $1", [id]);
    const stored = { energyKcal: 400, proteinG: 100, carbsG: 100, fatG: 100 };

    const detail = await d
      .api()
      .get(d.v1(`/foods/${id}`))
      .set(user.auth);
    expect([detail.status, detail.body.per100g]).toEqual([200, stored]);
    const own = await d.api().get(d.v1("/foods/own")).set(user.auth);
    expect(own.body.foods.map((f: { id: string }) => f.id)).toEqual([id]);
    const found = await d.api().get(d.v1("/foods/search")).query({ q: "herkku" }).set(user.auth);
    expect(found.body.foods.map((f: { id: string }) => f.id)).toEqual([id]);

    const entry = await d.added(user, d.foodBody(id, { grams: 50 }));
    expect(entry.figures).toEqual({ energyKcal: 200, proteinG: 50, carbsG: 50, fatG: 50 });
    const day = await d.day(user, entry.date);
    expect(day.status).toBe(200);
    expect(day.body.entries.map((e: { id: string }) => e.id)).toEqual([entry.id]);
    expect(day.body.eaten.figures).toEqual(entry.figures);

    // Saving it unchanged is an edit like any other, and is refused until the numbers are fixed.
    const resave = await d
      .api()
      .put(d.v1(`/foods/${id}`))
      .set(user.auth)
      .send({ name: "Vanha herkku", per100g: stored });
    expect([resave.status, resave.body.code]).toEqual([400, "food_macro_sum_too_high"]);
    const fixed = { ...stored, carbsG: 0, fatG: 0 };
    const res = await d
      .api()
      .put(d.v1(`/foods/${id}`))
      .set(user.auth)
      .send({ name: "Vanha herkku", per100g: fixed });
    expect([res.status, res.body.per100g]).toEqual([200, fixed]);
  });
});
