import { describe, expect, it } from "@jest/globals";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { counted, recipeBody, recipeEntryBody, recipesApi } from "../../__tests__/support/recipesApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// An own food's edit and the planned entries of the recipes on it. The edit
// rewrites the planned entries from today on of every recipe the person still
// has with a line on the food. A deleted recipe's entries keep their figures.
// One serving of a recipe holds at most 10000 kcal, or 1000 g of a macro. An
// edit that takes a planned serving past that, or raises a figure already
// past it, is refused with `food_edit_recipe_too_large`, naming the recipes.
// Dates are relative to the suite's Helsinki today, the zone of every test user.

type Figures = { energyKcal: number; proteinG: number; carbsG: number; fatG: number };

/** Energy only: 10000 g of it is one serving of 100 times `energyKcal`. */
const kcal = (energyKcal: number): Figures => ({ energyKcal, proteinG: 0, carbsG: 0, fatG: 0 });

await describeWithDb("recipeFoodEdits", (suite) => {
  const d = daysApi(suite);
  const r = recipesApi(d);
  const today = () => helsinkiToday();

  const basisOf = async (entryId: string) => {
    const { rows } = await suite.client.query(
      "SELECT basis_energy_kcal AS e, basis_carbs_g AS c FROM entries WHERE id = $1",
      [entryId],
    );
    return { energyKcal: Number(rows[0].e), carbsG: Number(rows[0].c) };
  };
  const foodEnergy = async (foodId: string) =>
    Number((await suite.client.query("SELECT energy_kcal FROM foods WHERE id = $1", [foodId])).rows[0].energy_kcal);
  const editFood = (user: ApiUser, food: string, per100g: Figures) =>
    d
      .api()
      .put(d.v1(`/foods/${food}`))
      .set(user.auth)
      .send({ name: "Oma ruoka", per100g, barcode: null });

  /** A recipe serving 1 named `name`, of 10000 g of `food` (two lines of 5000 g) and `extra` lines. */
  async function bigRecipe(user: ApiUser, food: string, name: string, extra: ReturnType<typeof counted>[] = []) {
    const body = recipeBody([counted(food, { grams: 5000 }), counted(food, { grams: 5000 }), ...extra], {
      servings: 1,
      name,
    });
    await r.created(user, body);
    return body.id;
  }

  describe("a deleted recipe", () => {
    it("keeps the figures of its planned entries when an own food on its lines is edited", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, kcal(50));
      const id = await bigRecipe(user, food, "Puuro");
      const planned = await d.added(user, recipeEntryBody(id, today()));
      const later = await d.added(user, recipeEntryBody(id, addDays(today(), 3)));
      expect((await r.remove(user, id)).status).toBe(204);
      expect((await r.get(user, id)).body.deleted).toBe(true);

      expect((await editFood(user, food, kcal(60))).status).toBe(200);
      expect((await basisOf(planned.id)).energyKcal).toBe(5000);
      expect((await basisOf(later.id)).energyKcal).toBe(5000);
    });

    it("does not refuse an edit that would take its serving past the cap", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, kcal(100));
      const id = await bigRecipe(user, food, "Puuro");
      const planned = await d.added(user, recipeEntryBody(id, addDays(today(), 1)));
      await r.remove(user, id);

      const res = await editFood(user, food, kcal(101));
      expect(res.status).toBe(200);
      expect(await foodEnergy(food)).toBe(101);
      expect((await basisOf(planned.id)).energyKcal).toBe(10000);
    });
  });

  describe("the refusal", () => {
    it("names the recipe whose planned serving the edit would take past the cap, and changes nothing", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, kcal(100));
      const id = await bigRecipe(user, food, "Shakshuka");
      const planned = await d.added(user, recipeEntryBody(id, addDays(today(), 1)));

      const res = await editFood(user, food, kcal(101));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        code: "food_edit_recipe_too_large",
        details: { recipe: "Shakshuka", others: 0, recipes: ["Shakshuka"] },
      });
      expect(res.body.message).toContain("Shakshuka");
      expect((await basisOf(planned.id)).energyKcal).toBe(10000);
      expect(await foodEnergy(food)).toBe(100);
    });

    it("names the first three recipes by name and counts the others", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, kcal(100));
      for (const name of ["Ohrapuuro", "Kaurapuuro", "Riisipuuro", "Mannapuuro", "Hirssipuuro"]) {
        await d.added(user, recipeEntryBody(await bigRecipe(user, food, name), today()));
      }
      // One more on the food, on no planned day: it is not named.
      await bigRecipe(user, food, "Aaltopuuro");

      const res = await editFood(user, food, kcal(101));
      expect(res.body).toMatchObject({
        code: "food_edit_recipe_too_large",
        details: { recipe: "Hirssipuuro", others: 4, recipes: ["Hirssipuuro", "Kaurapuuro", "Mannapuuro"] },
      });
    });
  });

  describe("a planned serving already past the cap", () => {
    /**
     * A planned entry today of a recipe whose serving is past the cap: the
     * food edit passes while the entry is eaten, and the entry is then
     * marked planned again. Its basis stays the 10000 kcal it was added with.
     */
    async function overCap() {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, kcal(100));
      const other = await d.ownFood(user, { energyKcal: 0, proteinG: 0, carbsG: 1, fatG: 0 });
      const id = await bigRecipe(user, food, "Shakshuka", [counted(other, { grams: 100 })]);
      const entry = await d.added(user, recipeEntryBody(id, today(), { status: "eaten" }));
      expect((await editFood(user, food, kcal(101))).status).toBe(200);
      expect((await d.setStatus(user, [entry.id], "planned")).status).toBe(200);
      expect(await basisOf(entry.id)).toEqual({ energyKcal: 10000, carbsG: 1 });
      return { user, food, other, entry };
    }

    it("lets an edit that lowers it pass, keeps the entry's basis while it stays past, and rewrites it once it fits", async () => {
      const { user, food, entry } = await overCap();
      expect((await editFood(user, food, kcal(100.5))).status).toBe(200);
      expect(await foodEnergy(food)).toBe(100.5);
      expect((await basisOf(entry.id)).energyKcal).toBe(10000);

      expect((await editFood(user, food, kcal(99))).status).toBe(200);
      expect((await basisOf(entry.id)).energyKcal).toBe(9900);
    });

    it("refuses an edit that raises it further", async () => {
      const { user, food, entry } = await overCap();
      const res = await editFood(user, food, kcal(102));
      expect([res.status, res.body.code]).toEqual([400, "food_edit_recipe_too_large"]);
      expect(await foodEnergy(food)).toBe(101);
      expect((await basisOf(entry.id)).energyKcal).toBe(10000);
    });

    it("lets an edit of another food on the recipe pass when it raises no figure past the cap, and refuses one that does", async () => {
      const { user, other, entry } = await overCap();
      expect((await editFood(user, other, { energyKcal: 0, proteinG: 0, carbsG: 2, fatG: 0 })).status).toBe(200);
      expect(await basisOf(entry.id)).toEqual({ energyKcal: 10000, carbsG: 1 });

      const res = await editFood(user, other, { energyKcal: 1, proteinG: 0, carbsG: 2, fatG: 0 });
      expect([res.status, res.body.code]).toEqual([400, "food_edit_recipe_too_large"]);
    });
  });
});
