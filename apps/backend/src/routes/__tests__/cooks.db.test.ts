import { CookBodySchema } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
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
import { createCook } from "../../services/writes/cooks.js";
import { removeEntry } from "../../services/writes/entries.js";
import { deleteOwnFood } from "../../services/writes/foods.js";
import { deleteRecipe } from "../../services/writes/recipes.js";

// A cook is a batch logged as made: its own lines and the servings it gave.
// The entries it attaches and adds take its basis, one serving of its lines
// from their foods when it is made, and nothing else rewrites them: not an
// edit of the recipe, nor of an own food on its lines. The recipe stays as
// written. Dates are relative to the suite's Helsinki today, the zone of
// every test user, except where a fixed instant pins the ten minutes a
// removed entry is kept.

/** The worked example of the recipes design, values per 100 g, and spinach. */
const EGG = { energyKcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 };
const TOMATOES = { energyKcal: 24, proteinG: 1.2, carbsG: 3.9, fatG: 0.2 };
const FETA = { energyKcal: 264, proteinG: 14.2, carbsG: 4.1, fatG: 21.3 };
const OIL = { energyKcal: 884, proteinG: 0, carbsG: 0, fatG: 100 };
const SPINACH = { energyKcal: 23, proteinG: 2.9, carbsG: 3.6, fatG: 0.4 };
const OWN = { energyKcal: 100, proteinG: 10, carbsG: 0, fatG: 0 };

const NOON = new Date("2026-11-19T10:00:00.000Z");
const LATER = new Date(NOON.getTime() + 11 * 60 * 1000);
const NOON_DAY = "2026-11-19";

await describeWithDb("cooks", (suite) => {
  const d = daysApi(suite);
  const r = recipesApi(d);
  const c = cooksApi(d);
  const today = () => helsinkiToday();

  /** The worked example's shakshuka serving 2, on the user's own foods, and spinach. */
  async function shakshuka(user: ApiUser) {
    const foods = {
      egg: await d.ownFood(user, EGG, "Kananmuna"),
      tomatoes: await d.ownFood(user, TOMATOES, "Tomaattimurska"),
      feta: await d.ownFood(user, FETA, "Fetajuusto"),
      oil: await d.ownFood(user, OIL, "Oliiviöljy"),
      spinach: await d.ownFood(user, SPINACH, "Pinaatti"),
    };
    const body = recipeBody([
      counted(foods.egg, { grams: 240 }),
      counted(foods.tomatoes, { grams: 400 }),
      counted(foods.feta, { grams: 60 }),
      counted(foods.oil, { grams: 15 }),
      notCounted("Salt"),
    ]);
    await r.created(user, body);
    return { foods, body };
  }

  /** A recipe serving 1 with one line of 100 g of the user's own food. */
  async function simpleRecipe(user: ApiUser, per100g = OWN) {
    const food = await d.ownFood(user, per100g);
    const body = recipeBody([counted(food, { grams: 100 })], { servings: 1 });
    await r.created(user, body);
    return { food, body };
  }

  const basisOf = async (entryId: string) => {
    const { rows } = await suite.client.query(
      "SELECT basis_energy_kcal, basis_protein_g, basis_carbs_g, basis_fat_g, cook_id FROM entries WHERE id = $1",
      [entryId],
    );
    return rows[0] as Record<string, string | null> | undefined;
  };
  const cookCount = async (userId: string) =>
    (await suite.client.query("SELECT count(*)::int AS n FROM cooks WHERE user_id = $1", [userId])).rows[0].n;

  describe("logging as made", () => {
    it("feta changed, oil left out, spinach added, gave 3: both entries take the cook's figures, the recipe stays", async () => {
      const user = await signUp(suite.client);
      const { foods, body } = await shakshuka(user);
      const recipeBefore = (await r.get(user, body.id)).body;
      const saturday = await d.added(user, recipeEntryBody(body.id, today()));
      const sunday = await d.added(user, recipeEntryBody(body.id, addDays(today(), 1)));

      const [egg, tomatoes, feta, oil, salt] = asMade(body.lines);
      void oil;
      const lines = [
        egg,
        tomatoes,
        { ...feta, amount: { grams: 100 } },
        salt,
        { ...counted(foods.spinach, { grams: 80 }), fromLineId: null },
      ];
      const res = await c.create(
        user,
        cookBody(body.id, today(), lines, {
          servings: 3,
          attach: [saturday.id, sunday.id],
          attachStatus: [{ id: saturday.id, status: "eaten" }],
        }),
      );
      expect(res.status).toBe(201);
      const { cook, entries, days } = res.body;
      // 721.6 kcal, 51.56 g protein, 24.26 g carbohydrates, 45.22 g fat over 3 servings.
      expect(cook.basis).toEqual({ energyKcal: 240.53, proteinG: 17.187, carbsG: 8.087, fatG: 15.073 });
      expect(cook.perServing).toEqual({ energyKcal: 241, proteinG: 17.2, carbsG: 8.1, fatG: 15.1 });
      expect(cook.diff).toEqual({
        servings: { recipe: 2, cook: 3 },
        changed: [{ lineId: feta!.id, fromLineId: feta!.fromLineId, fields: ["amount"] }],
        added: [lines[4]!.id],
        leftOut: [body.lines[3]!.id],
      });
      expect(entries.map((e: { id: string }) => e.id)).toEqual([saturday.id, sunday.id]);
      for (const entry of entries) {
        expect(entry).toMatchObject({
          kind: "recipe",
          servings: 1,
          basis: cook.basis,
          figures: cook.perServing,
          cook: { id: cook.id, date: today(), servings: 3, differs: true },
        });
      }
      expect(entries[0].status).toBe("eaten");
      expect(entries[1].status).toBe("planned");
      expect(days.map((day: { date: string }) => day.date)).toEqual([today(), addDays(today(), 1)]);
      const recipeAfter = (await r.get(user, body.id)).body;
      expect({ ...recipeAfter, lastPutOn: null }).toEqual({ ...recipeBefore, lastPutOn: null });
    });

    it("adds new servings from the batch, and a later add from it takes the same basis after its food changed", async () => {
      const user = await signUp(suite.client);
      const { food, body } = await simpleRecipe(user);
      const made = await c.created(
        user,
        cookBody(body.id, today(), asMade(body.lines), {
          servings: 2,
          add: [{ date: today(), status: "eaten", servings: 1.5 }],
        }),
      );
      expect(made.entries[0]).toMatchObject({ servings: 1.5, status: "eaten", basis: made.cook.basis });
      const edited = await d
        .api()
        .put(d.v1(`/foods/${food}`))
        .set(user.auth)
        .send({ name: "Oma ruoka", per100g: { ...OWN, energyKcal: 300 }, barcode: null });
      expect(edited.status).toBe(200);
      const later = await d.add(user, { ...recipeEntryBody(body.id, addDays(today(), 2)), cookId: made.cook.id });
      expect(later.status).toBe(201);
      expect(later.body.entry).toMatchObject({ basis: made.cook.basis, cook: { id: made.cook.id } });
    });

    it("answers a repeat with 200 and the same cook, and another user's id with 409", async () => {
      const user = await signUp(suite.client);
      const { body } = await simpleRecipe(user);
      const cook = cookBody(body.id, today(), asMade(body.lines), { add: [{ date: today(), status: "planned" }] });
      expect((await c.create(user, cook)).status).toBe(201);
      const again = await c.create(user, cook);
      expect([again.status, again.body.outcome, again.body.cook.id]).toEqual([200, "replayed", cook.id]);
      expect(await d.entryCount(user.id)).toBe(1);
      const other = await signUp(suite.client);
      const theirs = await simpleRecipe(other);
      const taken = await c.create(other, { ...cook, recipeId: theirs.body.id });
      expect([taken.status, taken.body.code]).toEqual([409, "cook_id_taken"]);
    });

    it("refuses a cook with no entry, a line on another user's food naming its line, and a serving past the cap", async () => {
      const user = await signUp(suite.client);
      const { body } = await simpleRecipe(user);
      const none = await c.create(user, cookBody(body.id, today(), asMade(body.lines)));
      expect([none.status, none.body.code]).toEqual([400, "cook_entries_required"]);
      const other = await signUp(suite.client);
      const theirs = await d.ownFood(other, OWN);
      const add = [{ date: today(), status: "planned" as const }];
      const foreign = await c.create(
        user,
        cookBody(body.id, today(), [...asMade(body.lines), counted(theirs, { grams: 10 })], { add }),
      );
      expect([foreign.status, foreign.body.code, foreign.body.line]).toEqual([404, "food_not_found", 1]);
      const heavy = await d.ownFood(user, { energyKcal: 900, proteinG: 0, carbsG: 0, fatG: 100 });
      const tooMuch = await c.create(
        user,
        cookBody(body.id, today(), [counted(heavy, { grams: 5000 }), counted(heavy, { grams: 5000 })], {
          servings: 1,
          add,
        }),
      );
      expect([tooMuch.status, tooMuch.body.code]).toEqual([400, "recipe_serving_too_large"]);
      expect(await cookCount(user.id)).toBe(0);
    });

    it("an add naming the cook of another recipe answers cook_not_found", async () => {
      const user = await signUp(suite.client);
      const one = await simpleRecipe(user);
      const two = await simpleRecipe(user);
      const made = await c.created(
        user,
        cookBody(one.body.id, today(), asMade(one.body.lines), { add: [{ date: today(), status: "planned" }] }),
      );
      const res = await d.add(user, { ...recipeEntryBody(two.body.id, today()), cookId: made.cook.id });
      expect([res.status, res.body.code]).toEqual([404, "cook_not_found"]);
    });
  });

  describe("attaching", () => {
    it("refuses another recipe's entry, a cook's entry and another user's entry, and writes nothing", async () => {
      const user = await signUp(suite.client);
      const { body } = await simpleRecipe(user);
      const other = await simpleRecipe(user);
      const plain = await d.added(user, recipeEntryBody(body.id, today()));
      const ofOther = await d.added(user, recipeEntryBody(other.body.id, today()));
      const made = await c.created(
        user,
        cookBody(body.id, today(), asMade(body.lines), { add: [{ date: today(), status: "planned" }] }),
      );
      const fromCook = made.entries[0].id;
      const stranger = await signUp(suite.client);
      const theirs = await simpleRecipe(stranger);
      const notMine = await d.added(stranger, recipeEntryBody(theirs.body.id, today()));
      const before = await basisOf(plain.id);
      for (const wrong of [ofOther.id, fromCook, notMine.id, randomUUID()]) {
        const res = await c.create(user, cookBody(body.id, today(), asMade(body.lines), { attach: [plain.id, wrong] }));
        expect([res.status, res.body.code]).toEqual([400, "cook_entry_invalid"]);
      }
      expect(await cookCount(user.id)).toBe(1);
      expect(await basisOf(plain.id)).toEqual(before);
    });

    it("refuses an eaten mark on a future date, and a status for an entry it does not attach", async () => {
      const user = await signUp(suite.client);
      const { body } = await simpleRecipe(user);
      const tomorrow = await d.added(user, recipeEntryBody(body.id, addDays(today(), 1)));
      const future = await c.create(
        user,
        cookBody(body.id, today(), asMade(body.lines), {
          attach: [tomorrow.id],
          attachStatus: [{ id: tomorrow.id, status: "eaten" }],
        }),
      );
      expect([future.status, future.body.code]).toEqual([400, "entry_eaten_in_future"]);
      const stray = await c.create(
        user,
        cookBody(body.id, today(), asMade(body.lines), {
          add: [{ date: today(), status: "planned" }],
          attachStatus: [{ id: tomorrow.id, status: "planned" }],
        }),
      );
      expect([stray.status, stray.body.code]).toEqual([400, "cook_entry_invalid"]);
      expect(await cookCount(user.id)).toBe(0);
    });

    it("an eaten entry on a past day takes the cook's basis, and no other entry of that day changes", async () => {
      const user = await signUp(suite.client);
      const { body } = await simpleRecipe(user);
      const yesterday = addDays(today(), -1);
      const eaten = await d.added(user, recipeEntryBody(body.id, yesterday, { status: "eaten" }));
      const neighbour = await d.added(user, recipeEntryBody(body.id, yesterday, { status: "eaten" }));
      const food = await d.ownFood(user, OWN);
      const lunch = await d.added(user, d.foodBody(food, { grams: 150 }, { date: yesterday }));
      const before = [await basisOf(neighbour.id), await basisOf(lunch.id)];
      const lines = [{ ...asMade(body.lines)[0]!, amount: { grams: 160 } }];
      const made = await c.created(user, cookBody(body.id, yesterday, lines, { servings: 1, attach: [eaten.id] }));
      expect(made.cook.basis).toEqual({ energyKcal: 160, proteinG: 16, carbsG: 0, fatG: 0 });
      expect(made.entries[0]).toMatchObject({ id: eaten.id, status: "eaten", basis: made.cook.basis });
      expect([await basisOf(neighbour.id), await basisOf(lunch.id)]).toEqual(before);
      const day = (await d.day(user, yesterday)).body;
      expect(day.entries.map((e: { cook: unknown }) => e.cook !== null)).toEqual([true, false, false]);
    });
  });

  describe("figures that stay", () => {
    it("an own food on the cook's line edited after the cook changes none of its entries, and still reaches plain ones", async () => {
      const user = await signUp(suite.client);
      const { food, body } = await simpleRecipe(user);
      const plain = await d.added(user, recipeEntryBody(body.id, addDays(today(), 3)));
      const made = await c.created(
        user,
        cookBody(body.id, today(), asMade(body.lines), {
          servings: 1,
          add: [
            { date: today(), status: "planned" },
            { date: addDays(today(), 3), status: "planned" },
          ],
        }),
      );
      const fromCook = made.entries.map((e: { id: string }) => e.id);
      const before = await Promise.all(fromCook.map(basisOf));
      const edited = await d
        .api()
        .put(d.v1(`/foods/${food}`))
        .set(user.auth)
        .send({ name: "Oma ruoka", per100g: { ...OWN, energyKcal: 250 }, barcode: null });
      expect(edited.status).toBe(200);
      expect(Number((await basisOf(plain.id))!.basis_energy_kcal)).toBe(250);
      expect(await Promise.all(fromCook.map(basisOf))).toEqual(before);
    });

    it("a recipe edit leaves the cook's planned entries as they are", async () => {
      const user = await signUp(suite.client);
      const { body } = await simpleRecipe(user);
      const made = await c.created(
        user,
        cookBody(body.id, today(), asMade(body.lines), {
          servings: 1,
          add: [{ date: addDays(today(), 2), status: "planned" }],
        }),
      );
      const before = await basisOf(made.entries[0].id);
      const edit = await r.put(user, body.id, {
        ...editOf(body),
        lines: [{ ...body.lines[0], amount: { grams: 300 } }],
      });
      expect(edit.status).toBe(200);
      expect(await basisOf(made.entries[0].id)).toEqual(before);
    });
  });

  describe("copy, remove and restore", () => {
    it("a copy of a cook's entry is a plain planned entry with the recipe's figures now, also when the recipe was deleted since", async () => {
      const user = await signUp(suite.client);
      const { body } = await simpleRecipe(user);
      const made = await c.created(
        user,
        cookBody(body.id, today(), [{ ...asMade(body.lines)[0]!, amount: { grams: 400 } }], {
          servings: 1,
          add: [{ date: today(), status: "eaten" }],
        }),
      );
      const source = made.entries[0].id;
      const copy = await d.copy(user, addDays(today(), 7), [{ sourceId: source, id: randomUUID() }]);
      expect(copy.status).toBe(201);
      const recipeNow = (await r.get(user, body.id)).body;
      expect(copy.body.entries[0]).toMatchObject({ status: "planned", cook: null, basis: recipeNow.basis });
      expect(copy.body.entries[0].basis).not.toEqual(made.cook.basis);

      expect((await r.remove(user, body.id)).status).toBe(204);
      expect((await r.get(user, body.id)).body.deleted).toBe(true);
      const again = await d.copy(user, addDays(today(), 8), [{ sourceId: source, id: randomUUID() }]);
      expect(again.status).toBe(201);
      expect(again.body.entries[0]).toMatchObject({ cook: null, basis: recipeNow.basis, recipe: { deleted: true } });
    });

    it("the last entry removed and restored within ten minutes comes back with its cook", async () => {
      const user = await signUp(suite.client);
      const { body } = await simpleRecipe(user);
      const made = await c.created(
        user,
        cookBody(body.id, today(), asMade(body.lines), { add: [{ date: today(), status: "planned" }] }),
      );
      const only = made.entries[0].id;
      expect((await d.remove(user, only)).status).toBe(200);
      // A second removal runs the purge: the cook is kept while the removed row names it.
      const other = await d.added(user, recipeEntryBody(body.id, today()));
      expect((await d.remove(user, other.id)).status).toBe(200);
      const back = await d.restore(user, only);
      expect(back.status).toBe(201);
      expect(back.body.entry).toMatchObject({ id: only, cook: { id: made.cook.id }, basis: made.cook.basis });
      expect((await c.get(user, made.cook.id)).status).toBe(200);
    });
  });

  describe("an orphan cook", () => {
    it("does not keep its recipe: the recipe is deleted outright and the cook with it", async () => {
      const user = await signUp(suite.client);
      const { body } = await simpleRecipe(user);
      const ctx = await d.contextAt(user.id, NOON);
      const cook = CookBodySchema.parse(
        cookBody(body.id, NOON_DAY, asMade(body.lines), { add: [{ date: NOON_DAY, status: "eaten" }] }),
      );
      const { value } = await createCook(ctx, cook);
      await removeEntry(ctx, value.entries[0]!.id);
      await deleteRecipe(await d.contextAt(user.id, LATER), body.id);
      const left = await suite.client.query("SELECT id FROM recipes WHERE id = $1", [body.id]);
      expect(left.rows).toEqual([]);
      expect(await cookCount(user.id)).toBe(0);
    });

    it("keeps an own food on its line hidden, not deleted", async () => {
      const user = await signUp(suite.client);
      const { body } = await simpleRecipe(user);
      const extra = await d.ownFood(user, OWN, "Vain kokkauksessa");
      const ctx = await d.contextAt(user.id, NOON);
      const cook = CookBodySchema.parse(
        cookBody(body.id, NOON_DAY, [...asMade(body.lines), counted(extra, { grams: 20 })], {
          add: [{ date: NOON_DAY, status: "eaten" }],
        }),
      );
      const { value } = await createCook(ctx, cook);
      await removeEntry(ctx, value.entries[0]!.id);
      await deleteOwnFood(await d.contextAt(user.id, LATER), extra);
      const { rows } = await suite.client.query("SELECT deleted_at IS NOT NULL AS hidden FROM foods WHERE id = $1", [
        extra,
      ]);
      expect(rows).toEqual([{ hidden: true }]);
    });
  });
});
