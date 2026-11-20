import { AddEntryBodySchema, entryFigures, RecipeEditBodySchema } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { serviceHolder } from "../../__tests__/support/holder.js";
import {
  counted,
  editOf,
  notCounted,
  recipeBody,
  recipeEntryBody,
  recipesApi,
} from "../../__tests__/support/recipesApi.js";
import { sessionApi } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { getDay } from "../../services/reads/days.js";
import { addEntry } from "../../services/writes/entries.js";
import { deleteRecipe, updateRecipe } from "../../services/writes/recipes.js";

// A recipe on a day: an entry of kind recipe with a number of servings. Its
// basis is one serving of the recipe, written once when it is added, and its
// figures are entryFigures(basis, { per: "serving", count: servings }). An
// edit of the recipe, or of an own food on its lines, rewrites only planned
// entries dated today or later. Dates are relative to the suite's Helsinki
// today, the zone of every test user.

type Figures = { energyKcal: number; proteinG: number; carbsG: number; fatG: number };

/** The worked example of the recipes design, values per 100 g. */
const EGG = { energyKcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 };
const TOMATOES = { energyKcal: 24, proteinG: 1.2, carbsG: 3.9, fatG: 0.2 };
const FETA = { energyKcal: 264, proteinG: 14.2, carbsG: 4.1, fatG: 21.3 };
const OIL = { energyKcal: 884, proteinG: 0, carbsG: 0, fatG: 100 };

/** A fixed instant, noon in Helsinki, and its date, for the tests that run on services. */
const NOON = new Date("2026-11-19T10:00:00.000Z");
const NOON_DAY = "2026-11-19";

const per100g = (energyKcal: number): Figures => ({ energyKcal, proteinG: 10, carbsG: 0, fatG: 0 });

await describeWithDb("recipeEntries", (suite) => {
  const d = daysApi(suite);
  const r = recipesApi(d);
  const sessions = sessionApi(suite);
  const today = () => helsinkiToday();

  /** The worked example's shakshuka, serving `servings`, on the user's own foods. Answers its id. */
  async function shakshuka(user: ApiUser, servings: number): Promise<string> {
    const [egg, tomatoes, feta, oil] = [
      await d.ownFood(user, EGG, "Kananmuna"),
      await d.ownFood(user, TOMATOES, "Tomaattimurska"),
      await d.ownFood(user, FETA, "Fetajuusto"),
      await d.ownFood(user, OIL, "Oliiviöljy"),
    ];
    const body = recipeBody(
      [
        counted(egg, { grams: 240 }),
        counted(tomatoes, { grams: 400 }),
        counted(feta, { grams: 60 }),
        counted(oil, { grams: 15 }),
        notCounted("Salt"),
      ],
      { servings },
    );
    await r.created(user, body);
    return body.id;
  }

  /** A recipe serving 1 with one line of 100 g of the user's own food at `energyKcal`. */
  async function simpleRecipe(user: ApiUser, energyKcal = 100) {
    const food = await d.ownFood(user, per100g(energyKcal));
    const body = recipeBody([counted(food, { grams: 100 })], { servings: 1 });
    await r.created(user, body);
    return { food, body };
  }

  const log = (user: ApiUser, recipeId: string, date: string, opts: Parameters<typeof recipeEntryBody>[2] = {}) =>
    d.added(user, recipeEntryBody(recipeId, date, opts));
  const energyOf = async (entryId: string) =>
    Number(
      (await suite.client.query("SELECT basis_energy_kcal FROM entries WHERE id = $1", [entryId])).rows[0]
        ?.basis_energy_kcal,
    );
  const editGrams = (user: ApiUser, body: ReturnType<typeof recipeBody>, grams: number) =>
    r.put(user, body.id, { ...editOf(body), lines: [{ ...body.lines[0], amount: { grams } }] });
  const editFood = (user: ApiUser, food: string, energyKcal: number) =>
    d
      .api()
      .put(d.v1(`/foods/${food}`))
      .set(user.auth)
      .send({ name: "Oma ruoka", per100g: per100g(energyKcal), barcode: null });

  describe("figures", () => {
    it("one serving shows the recipe's per serving, N servings entryFigures of its basis, all of them its whole", async () => {
      const user = await signUp(suite.client);
      const id = await shakshuka(user, 2);
      const recipe = (await r.get(user, id)).body;

      const one = await d.add(user, recipeEntryBody(id, today()));
      expect(one.status).toBe(201);
      expect(one.body.entry).toMatchObject({
        kind: "recipe",
        name: "Shakshuka",
        servings: 1,
        recipe: { id, archived: false, deleted: false },
        food: null,
        savedMeal: null,
        basis: recipe.basis,
        figures: { energyKcal: 365, proteinG: 21.8, carbsG: 9.9, fatG: 25.7 },
      });
      expect(one.body.entry.figures).toEqual(recipe.perServing);

      const three = (await d.add(user, recipeEntryBody(id, today(), { servings: 3 }))).body.entry;
      expect(three.figures).toEqual(entryFigures(recipe.basis, { per: "serving", count: 3 }));
      expect(three.figures).toEqual({ energyKcal: 1095, proteinG: 65.3, carbsG: 29.6, fatG: 77.1 });

      const whole = (await d.add(user, recipeEntryBody(id, today(), { servings: 2 }))).body.entry;
      expect(whole.figures).toEqual(recipe.whole);
      expect(whole.figures).toEqual({ energyKcal: 730, proteinG: 43.6, carbsG: 19.7, fatG: 51.4 });
    });

    it("three one-serving entries of the recipe served 3 add up to 43.5 g of protein, its whole to 43.6 g", async () => {
      const user = await signUp(suite.client);
      const id = await shakshuka(user, 3);
      const date = addDays(today(), 1);
      for (let i = 0; i < 3; i++) expect((await log(user, id, date)).figures.proteinG).toBe(14.5);
      const day = (await d.day(user, date)).body;
      expect(day.withPlan.figures.proteinG).toBe(43.5);
      expect((await r.get(user, id)).body.whole.proteinG).toBe(43.6);
    });
  });

  describe("figures that stay", () => {
    it("a recipe edit leaves an eaten entry today and a planned one yesterday, and rewrites planned ones today and next week", async () => {
      // On one fixed instant: the adds, the edit and the read share one today.
      const user = await signUp(suite.client);
      const ctx = await d.contextAt(user.id, NOON);
      const { body } = await simpleRecipe(user);
      const at = async (date: string, status: "planned" | "eaten" = "planned") =>
        (await addEntry(ctx, AddEntryBodySchema.parse(recipeEntryBody(body.id, date, { status })))).value.entry!;
      const eatenToday = await at(NOON_DAY, "eaten");
      const plannedYesterday = await at(addDays(NOON_DAY, -1));
      const plannedToday = await at(NOON_DAY);
      const nextWeek = await at(addDays(NOON_DAY, 7));

      const edit = { ...editOf(body), lines: [{ ...body.lines[0], amount: { grams: 200 } }] };
      expect((await updateRecipe(ctx, body.id, RecipeEditBodySchema.parse(edit))).outcome).toBe("changed");
      expect(await energyOf(eatenToday.id)).toBe(100);
      expect(await energyOf(plannedYesterday.id)).toBe(100);
      expect(await energyOf(plannedToday.id)).toBe(200);
      expect(await energyOf(nextWeek.id)).toBe(200);
      const day = await getDay(ctx, NOON_DAY);
      expect(day.entries.map((e) => e.figures.energyKcal)).toEqual([100, 200]);
    });

    it("an own food edit rewrites a planned entry of a recipe on it, and not an eaten one", async () => {
      const user = await signUp(suite.client);
      const { food, body } = await simpleRecipe(user);
      const eaten = await log(user, body.id, today(), { status: "eaten" });
      const planned = await log(user, body.id, addDays(today(), 2));
      expect((await editFood(user, food, 250)).status).toBe(200);
      expect(await energyOf(eaten.id)).toBe(100);
      expect(await energyOf(planned.id)).toBe(250);
    });

    it("a copy keeps its basis after the recipe changed, and a move and a status change keep theirs", async () => {
      const user = await signUp(suite.client);
      const { body } = await simpleRecipe(user);
      const eaten = await log(user, body.id, today(), { status: "eaten" });
      await editGrams(user, body, 300);
      const copyId = randomUUID();
      const copied = await d.copy(user, addDays(today(), 3), [{ sourceId: eaten.id, id: copyId }]);
      expect(copied.status).toBe(201);
      expect(await energyOf(copyId)).toBe(100);

      expect((await d.patch(user, eaten.id, { date: addDays(today(), -2) })).status).toBe(200);
      expect((await d.setStatus(user, [eaten.id], "planned")).status).toBe(200);
      expect(await energyOf(eaten.id)).toBe(100);
    });

    it("a change of servings keeps the basis, and a servings field on another kind is refused", async () => {
      const user = await signUp(suite.client);
      const id = await shakshuka(user, 2);
      const entry = await log(user, id, today());
      const res = await d.patch(user, entry.id, { servings: 1.5 });
      expect(res.status).toBe(200);
      expect(res.body.entry).toMatchObject({ servings: 1.5, basis: (await r.get(user, id)).body.basis });
      expect(res.body.entry.figures).toEqual(entryFigures(res.body.entry.basis, { per: "serving", count: 1.5 }));

      const quark = await d.fineliFood();
      const food = await d.added(user, d.foodBody(quark.id, { grams: 100 }));
      expect((await d.patch(user, food.id, { servings: 2 })).body.code).toBe("entry_kind_mismatch");
      expect((await d.patch(user, entry.id, { count: 2 })).body.code).toBe("entry_kind_mismatch");
    });

    it("remove then restore brings the exact row back", async () => {
      const user = await signUp(suite.client);
      const id = await shakshuka(user, 2);
      const entry = await log(user, id, today(), { servings: 1.5 });
      const rowOf = async () =>
        (await suite.client.query("SELECT to_jsonb(e) AS row FROM entries e WHERE id = $1", [entry.id])).rows[0]?.row;
      const before = await rowOf();
      expect((await d.remove(user, entry.id)).status).toBe(200);
      expect(await rowOf()).toBeUndefined();
      expect((await d.restore(user, entry.id)).status).toBe(201);
      expect(await rowOf()).toEqual(before);
    });
  });

  describe("a deleted recipe", () => {
    it("is hidden while an entry uses it: readable by id, out of the list, and its entry keeps name and figures and copies", async () => {
      const user = await signUp(suite.client);
      const id = await shakshuka(user, 2);
      await r.flag(user, id, "favourite", true);
      const entry = await log(user, id, today());
      expect((await r.remove(user, id)).status).toBe(204);

      const read = await r.get(user, id);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({ deleted: true, favourite: false, name: "Shakshuka" });
      expect((await r.list(user)).body.recipes.map((x: { id: string }) => x.id)).not.toContain(id);
      expect((await r.list(user, { favourites: "true" })).body.recipes).toEqual([]);

      const day = (await d.day(user, today())).body;
      expect(day.entries[0]).toMatchObject({
        name: "Shakshuka",
        figures: entry.figures,
        recipe: { id, deleted: true },
      });
      const copyId = randomUUID();
      const copied = await d.copy(user, addDays(today(), 1), [{ sourceId: entry.id, id: copyId }]);
      expect(copied.status).toBe(201);
      expect(copied.body.entries[0]).toMatchObject({ id: copyId, name: "Shakshuka", figures: entry.figures });
    });

    it("gains no new entry: an add answers recipe_not_found", async () => {
      const user = await signUp(suite.client);
      const id = await shakshuka(user, 2);
      await log(user, id, today());
      await r.remove(user, id);
      const res = await d.add(user, recipeEntryBody(id, today()));
      expect([res.status, res.body.code]).toEqual([404, "recipe_not_found"]);
    });

    it("is kept while an entry removed in the last ten minutes names it, and deleted outright once nothing does", async () => {
      const user = await signUp(suite.client);
      const id = await shakshuka(user, 2);
      const entry = await log(user, id, today());
      await d.remove(user, entry.id);
      await r.remove(user, id);
      expect((await r.get(user, id)).body.deleted).toBe(true);
      expect((await d.restore(user, entry.id)).status).toBe(201);

      const unused = await shakshuka(user, 2);
      await r.remove(user, unused);
      expect((await r.get(user, unused)).status).toBe(404);
      const { rows } = await suite.client.query(
        "SELECT count(*)::int AS n FROM recipe_ingredients WHERE recipe_id = $1",
        [unused],
      );
      expect(rows[0].n).toBe(0);
    });

    it("an add waiting behind a delete of the unused recipe answers recipe_not_found, not a 500", async () => {
      const user = await signUp(suite.client);
      const id = await shakshuka(user, 2);
      const deletion = await serviceHolder(await d.contextAt(user.id), (ctx) => deleteRecipe(ctx, id));
      const adding = d.add(user, recipeEntryBody(id, today())).then((res) => res);
      expect(await sessions.queuedOnLock(1)).toBe(1);
      await deletion.commit();
      const res = await adding;
      expect([res.status, res.body.code]).toEqual([404, "recipe_not_found"]);
    });
  });

  describe("who and what an add takes", () => {
    it("another user's recipe answers recipe_not_found, an archived one logs", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      const id = await shakshuka(user, 2);
      const theirs = await d.add(other, recipeEntryBody(id, today()));
      expect([theirs.status, theirs.body.code]).toEqual([404, "recipe_not_found"]);
      await r.flag(user, id, "archived", true);
      const res = await d.add(user, recipeEntryBody(id, today()));
      expect(res.status).toBe(201);
      expect(res.body.entry.recipe).toEqual({ id, archived: true, deleted: false });
    });

    it("servings of 100.01 answer entry_count_invalid, and a row with them fails entries_amounts", async () => {
      const user = await signUp(suite.client);
      const id = await shakshuka(user, 2);
      const res = await d.add(user, recipeEntryBody(id, today(), { servings: 100.01 }));
      expect([res.status, res.body.code]).toEqual([400, "entry_count_invalid"]);
      expect((await d.add(user, recipeEntryBody(id, today(), { servings: 100 }))).status).toBe(201);
      await expect(
        suite.client.query(
          `INSERT INTO entries (user_id, date, status, kind, recipe_id, servings,
             basis_energy_kcal, basis_protein_g, basis_carbs_g, basis_fat_g)
           VALUES ($1, $2, 'planned', 'recipe', $3, 100.01, 1, 1, 1, 1)`,
          [user.id, today(), id],
        ),
      ).rejects.toMatchObject({ constraint: "entries_amounts" });
    });

    it("a serving an own food edited since takes past an entry's cap answers recipe_serving_too_large", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100g(100));
      const body = recipeBody([counted(food, { grams: 5000 }), counted(food, { grams: 5000 })], { servings: 1 });
      await r.created(user, body);
      // Eaten, so the food edit rewrites nothing and passes.
      expect((await d.add(user, recipeEntryBody(body.id, today(), { status: "eaten" }))).status).toBe(201);
      expect((await editFood(user, food, 101)).status).toBe(200);
      const res = await d.add(user, recipeEntryBody(body.id, today()));
      expect([res.status, res.body.code]).toEqual([400, "recipe_serving_too_large"]);
    });
  });

  describe("lastPutOn", () => {
    it("moves with an add, back with its removal, and forward with a move to a later date", async () => {
      const user = await signUp(suite.client);
      const id = await shakshuka(user, 2);
      const last = async () => (await r.get(user, id)).body.lastPutOn;
      expect(await last()).toBeNull();
      await log(user, id, addDays(today(), -3), { status: "eaten" });
      expect(await last()).toBe(addDays(today(), -3));
      const later = await log(user, id, addDays(today(), 2));
      expect(await last()).toBe(addDays(today(), 2));
      expect((await r.list(user)).body.recipes[0].lastPutOn).toBe(addDays(today(), 2));
      await d.remove(user, later.id);
      expect(await last()).toBe(addDays(today(), -3));
      await d.restore(user, later.id);
      await d.patch(user, later.id, { date: addDays(today(), 9) });
      expect(await last()).toBe(addDays(today(), 9));
    });
  });
});
