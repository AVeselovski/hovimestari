import { describe, expect, it, jest } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { asMade, cookBody, cooksApi } from "../../__tests__/support/cooksApi.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import {
  counted,
  editOf,
  notCounted,
  recipeBody,
  recipeEntryBody,
  recipesApi,
} from "../../__tests__/support/recipesApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Reading cooks: GET /cooks/:id, an entry's cook on a day, whether a cook
// differs from its recipe as the recipe is now, and saving a cook as a new
// recipe. A day read answers every cook's differs with one more query, and
// a week read, which answers no entry, with none.

const OWN = { energyKcal: 100, proteinG: 10, carbsG: 0, fatG: 0 };

await describeWithDb("cookReads", (suite) => {
  const d = daysApi(suite);
  const r = recipesApi(d);
  const c = cooksApi(d);
  const today = () => helsinkiToday();

  /** A recipe serving 2 with a counted line and salt, its own steps and tags. */
  async function recipe(user: ApiUser) {
    const food = await d.ownFood(user, OWN);
    const body = recipeBody([counted(food, { grams: 200 }, { written: { amount: 2, unit: "piece" } }), notCounted()], {
      steps: ["Chop.", "Fry."],
      tags: ["Brunch"],
      timeMinutes: 20,
      notes: "Hot.",
    });
    await r.created(user, body);
    return { food, body };
  }

  /** A cook of `body` on today with `lines` and `servings`, feeding one planned serving. */
  const cookOf = (user: ApiUser, body: { id: string }, lines: object[], servings = 2) =>
    c.created(user, cookBody(body.id, today(), lines, { servings, add: [{ date: today(), status: "planned" }] }));

  const differsOn = async (user: ApiUser, date: string) =>
    (await d.day(user, date)).body.entries.map((e: { cook: { differs: boolean } | null }) => e.cook?.differs ?? null);

  describe("differs", () => {
    it("is false for a cook made as written, true for a changed yield alone, and false again once the recipe matches", async () => {
      const user = await signUp(suite.client);
      const { body } = await recipe(user);
      const same = await cookOf(user, body, asMade(body.lines));
      expect(same.cook.diff).toEqual({ servings: null, changed: [], added: [], leftOut: [] });
      expect(same.entries[0].cook.differs).toBe(false);

      const date = addDays(today(), 1);
      const yieldOnly = await c.created(
        user,
        cookBody(body.id, date, asMade(body.lines), { servings: 3, add: [{ date, status: "planned" }] }),
      );
      expect(yieldOnly.cook.diff.servings).toEqual({ recipe: 2, cook: 3 });
      expect(await differsOn(user, date)).toEqual([true]);

      expect((await r.put(user, body.id, { ...editOf(body), servings: 3 })).status).toBe(200);
      expect(await differsOn(user, date)).toEqual([false]);
      expect(await differsOn(user, today())).toEqual([true]);
    });

    it("names a note change as no difference, and a line naming no line of the recipe as added", async () => {
      const user = await signUp(suite.client);
      const { body } = await recipe(user);
      const lines = asMade(body.lines);
      const noted = await cookOf(user, body, [{ ...lines[0]!, note: "Halved" }, lines[1]!]);
      expect(noted.cook.diff).toEqual({ servings: null, changed: [], added: [], leftOut: [] });
      const loose = await cookOf(
        user,
        body,
        asMade(body.lines).map((l) => ({ ...l, fromLineId: null })),
      );
      expect(loose.cook.diff.added).toEqual(loose.cook.lines.map((l: { id: string }) => l.id));
      expect(loose.cook.diff.leftOut).toEqual(body.lines.map((l) => l.id));
    });
  });

  describe("the queries a read runs", () => {
    it("a day with two cooks' entries reads whether they differ in one query, a week read and a day without cooks in none", async () => {
      const user = await signUp(suite.client);
      const { body } = await recipe(user);
      const date = addDays(today(), 2);
      for (const servings of [2, 3]) {
        await c.created(
          user,
          cookBody(body.id, today(), asMade(body.lines), { servings, add: [{ date, status: "planned" }] }),
        );
      }
      await d.added(user, recipeEntryBody(body.id, addDays(today(), 3)));
      const spy = jest.spyOn(suite.pool, "query");
      const differsQueries = () =>
        spy.mock.calls.filter(([query]) => {
          const text = typeof query === "string" ? query : (query as { text?: string }).text;
          return text?.includes("cook_ingredients") ?? false;
        }).length;
      try {
        const day = await d.day(user, date);
        expect(day.body.entries.map((e: { cook: { differs: boolean } }) => e.cook.differs)).toEqual([false, true]);
        expect(differsQueries()).toBe(1);
        spy.mockClear();
        expect((await d.range(user, today(), addDays(today(), 6))).status).toBe(200);
        expect(differsQueries()).toBe(0);
        expect((await d.day(user, addDays(today(), 3))).status).toBe(200);
        expect(differsQueries()).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("GET /cooks/:id", () => {
    it("answers the cook with its lines, figures and entries, and 404 for another user's or an unknown id", async () => {
      const user = await signUp(suite.client);
      const { body } = await recipe(user);
      const made = await cookOf(user, body, asMade(body.lines));
      const res = await c.get(user, made.cook.id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(made.cook);
      expect(res.body.recipe).toEqual({ id: body.id, name: "Shakshuka", servings: 2, deleted: false });
      expect(res.body.lines.map((l: { fromLineId: string }) => l.fromLineId)).toEqual(body.lines.map((l) => l.id));
      expect(res.body.whole).toEqual({ energyKcal: 200, proteinG: 20, carbsG: 0, fatG: 0 });
      expect(res.body.entries).toHaveLength(1);
      const stranger = await signUp(suite.client);
      for (const [who, id] of [
        [stranger, made.cook.id],
        [user, randomUUID()],
        [user, "not-a-uuid"],
      ] as const) {
        const missing = await c.get(who, id);
        expect([missing.status, missing.body.code]).toEqual([404, "cook_not_found"]);
      }
    });
  });

  describe("saving a cook as a new recipe", () => {
    it("makes a recipe of the cook's lines and yield with the recipe's time, steps, notes and tags, and leaves the cook be", async () => {
      const user = await signUp(suite.client);
      const { food, body } = await recipe(user);
      const extra = await d.ownFood(user, { ...OWN, energyKcal: 50 });
      const lines = [{ ...asMade(body.lines)[0]!, amount: { grams: 300 } }, counted(extra, { grams: 100 })];
      const made = await cookOf(user, body, lines, 4);
      const id = randomUUID();
      const res = await c.saveAsRecipe(user, made.cook.id, { id, name: "Shakshuka, spicy" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id,
        name: "Shakshuka, spicy",
        servings: 4,
        timeMinutes: 20,
        steps: ["Chop.", "Fry."],
        notes: "Hot.",
        tags: ["Brunch"],
        deleted: false,
      });
      expect(
        res.body.lines.map((l: { food: { id: string }; grams: number; written: unknown }) => [
          l.food.id,
          l.grams,
          l.written,
        ]),
      ).toEqual([
        [food, 300, { amount: 2, unit: "piece" }],
        [extra, 100, null],
      ]);
      expect(res.body.lines.map((l: { id: string }) => l.id)).not.toContain(lines[0]!.id);
      expect(res.body.perServing).toEqual(made.cook.perServing);

      const again = await c.saveAsRecipe(user, made.cook.id, { id, name: "Shakshuka, spicy" });
      expect([again.status, again.body.id]).toEqual([200, id]);
      expect((await c.get(user, made.cook.id)).body).toEqual(made.cook);

      const stranger = await signUp(suite.client);
      const theirs = await recipe(stranger);
      const theirCook = await cookOf(stranger, theirs.body, asMade(theirs.body.lines));
      const taken = await c.saveAsRecipe(stranger, theirCook.cook.id, { id, name: "Mine" });
      expect([taken.status, taken.body.code]).toEqual([409, "recipe_id_taken"]);
      const notTheirs = await c.saveAsRecipe(stranger, made.cook.id, { id: randomUUID(), name: "Mine" });
      expect([notTheirs.status, notTheirs.body.code]).toEqual([404, "cook_not_found"]);
      const blank = await c.saveAsRecipe(user, made.cook.id, { id: randomUUID(), name: " " });
      expect([blank.status, blank.body.code]).toEqual([400, "name_required"]);
    });

    it("refuses a cook whose serving an own food edited since takes past an entry's cap, as a recipe save does", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, OWN);
      const body = recipeBody([counted(food, { grams: 5000 }), counted(food, { grams: 5000 })], { servings: 1 });
      await r.created(user, body);
      const made = await cookOf(user, body, asMade(body.lines), 1);
      const edit = await d
        .api()
        .put(d.v1(`/foods/${food}`))
        .set(user.auth)
        .send({ name: "Oma ruoka", per100g: { ...OWN, energyKcal: OWN.energyKcal + 1 }, barcode: null });
      expect(edit.status).toBe(200);
      const id = randomUUID();
      const res = await c.saveAsRecipe(user, made.cook.id, { id, name: "Too much" });
      expect([res.status, res.body.code]).toEqual([400, "recipe_serving_too_large"]);
      expect((await r.get(user, id)).status).toBe(404);
    });

    it("copies a line whose own food was deleted since, the food kept hidden on it, as a recipe line keeps its food", async () => {
      const user = await signUp(suite.client);
      const { food, body } = await recipe(user);
      const made = await cookOf(user, body, asMade(body.lines));
      expect(
        (
          await d
            .api()
            .delete(d.v1(`/foods/${food}`))
            .set(user.auth)
        ).status,
      ).toBe(204);
      const res = await c.saveAsRecipe(user, made.cook.id, { id: randomUUID(), name: "Shakshuka again" });
      expect(res.status).toBe(201);
      expect(res.body.lines[0].food).toMatchObject({ id: food, deleted: true });
      expect(res.body.perServing).toEqual(made.cook.perServing);
    });

    it("works for a cook whose recipe was deleted since", async () => {
      const user = await signUp(suite.client);
      const { body } = await recipe(user);
      const made = await cookOf(user, body, asMade(body.lines));
      expect((await r.remove(user, body.id)).status).toBe(204);
      expect((await c.get(user, made.cook.id)).body.recipe.deleted).toBe(true);
      const res = await c.saveAsRecipe(user, made.cook.id, { id: randomUUID(), name: "Shakshuka" });
      expect([res.status, res.body.deleted, res.body.tags]).toEqual([201, false, ["Brunch"]]);
    });
  });
});
