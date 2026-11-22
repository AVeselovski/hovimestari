import { RecentListSchema } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { asMade, cookBody, cooksApi } from "../../__tests__/support/cooksApi.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { counted, recipeBody, recipeEntryBody, recipesApi } from "../../__tests__/support/recipesApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Recipes among the recent items, and a recipe's last servings, on a real
// Postgres. Both come from eaten entries only, as a food's last amount does.
// Dates are relative to the suite's Helsinki today, the zone of every test user.

const figures = (energyKcal: number) => ({ energyKcal, proteinG: 10, carbsG: 0, fatG: 0 });

await describeWithDb("recentRecipes", (suite) => {
  const d = daysApi(suite);
  const r = recipesApi(d);
  const c = cooksApi(d);
  const today = () => helsinkiToday();
  const recents = async (user: ApiUser, limit?: number) =>
    (
      await d
        .api()
        .get(d.v1("/log/recents"))
        .query(limit ? { limit } : {})
        .set(user.auth)
    ).body.items as { kind: string; recipe?: { id: string }; last: object }[];

  /** A recipe serving 2 with one line of 200 g of the user's own food. */
  async function recipe(user: ApiUser, name = "Shakshuka") {
    const food = await d.ownFood(user, figures(100));
    const body = recipeBody([counted(food, { grams: 200 })], { name });
    await r.created(user, body);
    return body;
  }
  const eat = (user: ApiUser, recipeId: string, servings = 1, date = today()) =>
    d.added(user, recipeEntryBody(recipeId, date, { servings, status: "eaten" }));
  const lastServings = async (user: ApiUser, id: string) => ({
    one: (await r.get(user, id)).body.lastServings,
    listed: (await r.list(user)).body.recipes.find((x: { id: string }) => x.id === id)?.lastServings,
  });

  describe("recent items", () => {
    it("hold recipes among foods and meals, newest first, each once, with the servings of the last time", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      const meal = await d.meal(user, figures(600));
      const shakshuka = await recipe(user);
      const soup = await recipe(user, "Lohikeitto");
      const planned = await recipe(user, "Planned only");

      await eat(user, shakshuka.id, 2);
      await d.added(user, d.foodBody(food.id, { grams: 150 }));
      await eat(user, soup.id, 1);
      await d.added(user, d.mealBody(meal, 1));
      await eat(user, shakshuka.id, 1.5);
      await d.added(user, recipeEntryBody(soup.id, today(), { servings: 4 })); // planned: not recent
      await d.added(user, recipeEntryBody(planned.id, today()));

      const items = await recents(user);
      expect(items).toEqual([
        {
          kind: "recipe",
          recipe: expect.objectContaining({ id: shakshuka.id, name: "Shakshuka", servings: 2, lastServings: 1.5 }),
          last: { servings: 1.5 },
        },
        { kind: "saved_meal", meal: expect.objectContaining({ id: meal }), last: { count: 1 } },
        { kind: "recipe", recipe: expect.objectContaining({ id: soup.id, lastServings: 1 }), last: { servings: 1 } },
        { kind: "food", food: expect.objectContaining({ id: food.id }), last: { grams: 150, portion: null } },
      ]);
      // The recipe is the summary the recipes list answers, whole.
      const listed = (await r.list(user)).body.recipes.find((x: { id: string }) => x.id === shakshuka.id);
      expect(items[0].recipe).toEqual(listed);
      expect(RecentListSchema.parse({ items })).toEqual({ items });
      expect((await recents(user, 2)).map((i) => i.kind)).toEqual(["recipe", "saved_meal"]);
    });

    it("leave out an archived recipe and a deleted one, and spend no place on them", async () => {
      const user = await signUp(suite.client);
      const [kept, archived, deleted] = [await recipe(user), await recipe(user, "A"), await recipe(user, "D")];
      await eat(user, kept.id);
      await eat(user, archived.id);
      await eat(user, deleted.id);
      expect((await r.flag(user, archived.id, "archived", true)).status).toBe(204);
      expect((await r.remove(user, deleted.id)).status).toBe(204);

      expect((await recents(user, 1)).map((i) => i.recipe?.id)).toEqual([kept.id]);
      expect(await recents(user)).toHaveLength(1);

      // Back from the archive, it is recent again.
      expect((await r.flag(user, archived.id, "archived", false)).status).toBe(204);
      expect((await recents(user)).map((i) => i.recipe?.id)).toEqual([archived.id, kept.id]);
    });

    it("count an entry from a batch as its recipe, with that entry's servings", async () => {
      const user = await signUp(suite.client);
      const body = await recipe(user);
      await eat(user, body.id, 1);
      await c.created(
        user,
        cookBody(body.id, today(), asMade(body.lines), {
          servings: 3,
          add: [{ date: today(), status: "eaten", servings: 2.5 }],
        }),
      );

      expect(await recents(user)).toEqual([
        { kind: "recipe", recipe: expect.objectContaining({ id: body.id, servings: 2 }), last: { servings: 2.5 } },
      ]);
    });

    it("are another user's never", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      await eat(other, (await recipe(other)).id);
      expect(await recents(user)).toEqual([]);
    });
  });

  describe("a recipe's last servings", () => {
    it("are null for a recipe never on a day and for one only planned", async () => {
      const user = await signUp(suite.client);
      const never = await recipe(user);
      const planned = await recipe(user, "Planned");
      await d.added(user, recipeEntryBody(planned.id, today(), { servings: 3 }));
      expect(await lastServings(user, never.id)).toEqual({ one: null, listed: null });
      expect(await lastServings(user, planned.id)).toEqual({ one: null, listed: null });
    });

    it("are the latest eaten entry's, whatever its date, and not another user's", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      const body = await recipe(user);
      await eat(other, (await recipe(other)).id, 9);
      await eat(user, body.id, 2);
      await eat(user, body.id, 0.5, addDays(today(), -3)); // logged later, for an earlier day
      await d.added(user, recipeEntryBody(body.id, addDays(today(), 1), { servings: 7 }));
      expect(await lastServings(user, body.id)).toEqual({ one: 0.5, listed: 0.5 });
    });

    it("remember an amount changed while marking eaten", async () => {
      const user = await signUp(suite.client);
      const body = await recipe(user);
      await eat(user, body.id, 1);
      const entry = await d.added(user, recipeEntryBody(body.id, today(), { servings: 2 }));
      expect(await lastServings(user, body.id)).toEqual({ one: 1, listed: 1 });

      const marked = await d.patch(user, entry.id, { servings: 1.25, status: "eaten" });
      expect(marked.status).toBe(200);
      expect(await lastServings(user, body.id)).toEqual({ one: 1.25, listed: 1.25 });
      expect((await recents(user))[0].last).toEqual({ servings: 1.25 });
    });
  });
});
