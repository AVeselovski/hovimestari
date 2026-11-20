import {
  AddEntryBodySchema,
  OwnFoodUpdateBodySchema,
  RecipeBodySchema,
  RecipeEditBodySchema,
} from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { sql } from "drizzle-orm";
import type { Response } from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { serviceHolder, sqlHolder } from "../../__tests__/support/holder.js";
import {
  counted,
  editOf,
  idStarting,
  notCounted,
  recipeBody,
  recipeEntryBody,
  recipesApi,
} from "../../__tests__/support/recipesApi.js";
import { sessionApi } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import type { WriteContext } from "../writes/context.js";
import { addEntry } from "../writes/entries.js";
import { deleteOwnFood, updateOwnFood } from "../writes/foods.js";
import { createRecipe, updateRecipe } from "../writes/recipes.js";

// A recipe save racing a delete of an own food on one of its lines. A save
// holds the user's own foods among its lines FOR SHARE (readLineFoods), so
// either the delete waits for the save and then finds the food on a recipe
// and hides it, or the save waits for the delete and then finds no food and
// refuses that line. Never a foreign-key failure as a 500. The first
// transaction is held open by the real service (serviceHolder), and the
// second goes through the API and queues on its lock (pg_locks).
//
// Shared foods are not locked: a recipe save never waits on a Fineli row a
// transaction is updating, as the Fineli import does, while it waits on an
// own food being edited.
//
// Then the rewrite of planned recipe entries (design e.3): one rewriter
// locks every planned entry an edit reaches in one id-ordered statement,
// reads the figures after its lock, then writes. A recipe entry's add holds
// its recipe and own foods FOR SHARE, and a recipe save holds its own foods
// FOR SHARE. Each race below ends with entries that carry every committed
// change, in both orders, and never deadlocks.

const OWN = { energyKcal: 100, proteinG: 10, carbsG: 0, fatG: 0 };

await describeWithDb("recipeRaces", (suite) => {
  const d = daysApi(suite);
  const r = recipesApi(d);
  const sessions = sessionApi(suite);
  const hidden = async (foodId: string) =>
    (await suite.client.query("SELECT deleted_at IS NOT NULL AS hidden FROM foods WHERE id = $1", [foodId])).rows[0]
      ?.hidden as boolean | undefined;

  /** Holds a delete of `foodId` open, sends `save`, commits the delete, and answers the save's response. */
  async function deleteFirst(user: ApiUser, foodId: string, save: () => Promise<Response>) {
    const deletion = await serviceHolder(await d.contextAt(user.id), (ctx) => deleteOwnFood(ctx, foodId));
    const saving = save().then((res) => res);
    const waited = await sessions.queuedOnLock(1);
    await deletion.commit();
    return { waited, res: await saving };
  }

  describe("a delete of the food first", () => {
    it("a create with a line on it answers food_not_found naming the line", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, OWN);
      const body = recipeBody([notCounted(), counted(food, { grams: 100 })]);
      const { waited, res } = await deleteFirst(user, food, () => r.create(user, body));
      expect(waited).toBe(1);
      expect([res.status, res.body.code, res.body.line]).toEqual([404, "food_not_found", 1]);
      expect(await hidden(food)).toBeUndefined();
    });

    it("an edit adding a line on it answers food_not_found naming the line", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, OWN);
      const body = recipeBody([notCounted()]);
      await r.created(user, body);
      const edit = editOf({ ...body, lines: [...body.lines, counted(food, { grams: 100 })] });
      const { waited, res } = await deleteFirst(user, food, () => r.put(user, body.id, edit));
      expect(waited).toBe(1);
      expect([res.status, res.body.code, res.body.line]).toEqual([404, "food_not_found", 1]);
      expect((await r.get(user, body.id)).body.lines).toHaveLength(1);
    });
  });

  describe("a save of the recipe first", () => {
    /** Holds `save` open, sends the food's delete, commits the save, and answers the delete's response. */
    async function saveFirst(user: ApiUser, foodId: string, save: Parameters<typeof serviceHolder>[1]) {
      const saving = await serviceHolder(await d.contextAt(user.id), save);
      const deleting = d
        .api()
        .delete(d.v1(`/foods/${foodId}`))
        .set(user.auth)
        .then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      await saving.commit();
      return { waited, res: await deleting };
    }

    it("a create: the delete then hides the food and the line keeps it", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, OWN);
      const body = RecipeBodySchema.parse(recipeBody([counted(food, { grams: 100 })]));
      const { waited, res } = await saveFirst(user, food, (ctx) => createRecipe(ctx, body));
      expect(waited).toBe(1);
      expect(res.status).toBe(204);
      expect(await hidden(food)).toBe(true);
      expect((await r.get(user, body.id)).body.lines[0].food).toMatchObject({ id: food, deleted: true });
    });

    it("an edit adding a line: the delete then hides the food and the line keeps it", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, OWN);
      const body = recipeBody([notCounted()]);
      await r.created(user, body);
      const edit = RecipeEditBodySchema.parse({ ...body, lines: [...body.lines, counted(food, { grams: 100 })] });
      const { waited, res } = await saveFirst(user, food, (ctx) => updateRecipe(ctx, body.id, edit));
      expect(waited).toBe(1);
      expect(res.status).toBe(204);
      expect(await hidden(food)).toBe(true);
      expect((await r.get(user, body.id)).body.lines[1].food).toMatchObject({ id: food, deleted: true });
    });
  });

  describe("which foods a save waits on", () => {
    /** A connection of its own holding an uncommitted update of `foodId`, as the Fineli import or a food edit does. */
    async function updating(foodId: string) {
      const update = await sqlHolder(suite.url);
      await update.query("UPDATE foods SET energy_kcal = energy_kcal WHERE id = $1", [foodId]);
      return update;
    }

    /**
     * Runs `save` with a lock timeout, so a save that would wait on any row
     * lock fails at once with lock_not_available (55P03) and one that waits on
     * none is never touched by it, however slow the machine. No timer decides.
     */
    async function neverWaiting<T>(userId: string, save: (ctx: WriteContext) => Promise<T>): Promise<T> {
      const ctx = await d.contextAt(userId);
      return ctx.db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '50ms'`);
        return save({ ...ctx, db: tx });
      });
    }

    it("never waits on a Fineli food a transaction is updating", async () => {
      const user = await signUp(suite.client);
      const fineli = await d.fineliFood();
      const update = await updating(fineli.id);
      try {
        const body = RecipeBodySchema.parse(recipeBody([counted(fineli.id, { grams: 100 })]));
        expect((await neverWaiting(user.id, (ctx) => createRecipe(ctx, body))).outcome).toBe("created");
      } finally {
        await update.commit();
      }
    });

    it("waits on an own food a transaction is updating, then saves", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, OWN);
      const update = await updating(food);
      // The same save under the lock timeout fails on this food's lock: the check above can see a wait.
      const body = RecipeBodySchema.parse(recipeBody([counted(food, { grams: 100 })]));
      await expect(neverWaiting(user.id, (ctx) => createRecipe(ctx, body))).rejects.toMatchObject({
        cause: { code: "55P03" },
      });
      const saving = r.create(user, recipeBody([counted(food, { grams: 100 })])).then((res) => res);
      expect(await sessions.queuedOnLock(1)).toBe(1);
      await update.commit();
      expect((await saving).status).toBe(201);
    });
  });

  describe("the rewrite of planned recipe entries", () => {
    const tomorrow = () => addDays(helsinkiToday(), 1);
    const per100g = (energyKcal: number) => ({ energyKcal, proteinG: 10, carbsG: 0, fatG: 0 });
    const energyOf = async (entryId: string) =>
      Number(
        (await suite.client.query("SELECT basis_energy_kcal FROM entries WHERE id = $1", [entryId])).rows[0]
          ?.basis_energy_kcal,
      );
    const foodEdit = (energyKcal: number) =>
      OwnFoodUpdateBodySchema.parse({ name: "Oma ruoka", per100g: per100g(energyKcal), barcode: null });
    const editFood = (user: ApiUser, food: string, energyKcal: number) =>
      d
        .api()
        .put(d.v1(`/foods/${food}`))
        .set(user.auth)
        .send(foodEdit(energyKcal))
        .then((res) => res);

    /** A recipe serving 1 with `lines`, and its entry planned tomorrow. Answers both ids. */
    async function plannedRecipe(user: ApiUser, lines: object[], ids: { recipe?: string; entry?: string } = {}) {
      const body = recipeBody(lines as { id: string }[], { servings: 1, ...(ids.recipe ? { id: ids.recipe } : {}) });
      await r.created(user, body);
      const entry = await d.added(user, recipeEntryBody(body.id, tomorrow(), { id: ids.entry }));
      return { body, entry: entry.id };
    }

    /** Holds `first`, a real service call, open; sends `second` through the API; commits; answers both. */
    async function inOrder<T>(
      user: ApiUser,
      first: (ctx: WriteContext) => Promise<T>,
      second: () => Promise<Response>,
    ) {
      const holding = await serviceHolder(await d.contextAt(user.id), first);
      const sending = second().then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      await holding.commit();
      return { waited, res: await sending };
    }

    it("two own foods on one recipe, edited at once, both reach its planned entries", async () => {
      const user = await signUp(suite.client);
      const f = await d.ownFood(user, per100g(100));
      const g = await d.ownFood(user, per100g(100));
      const { entry } = await plannedRecipe(user, [counted(f, { grams: 100 }), counted(g, { grams: 100 })]);
      const { waited, res } = await inOrder(
        user,
        (ctx) => updateOwnFood(ctx, f, foodEdit(200)),
        () => editFood(user, g, 300),
      );
      expect([waited, res.status]).toEqual([1, 200]);
      expect(await energyOf(entry)).toBe(500);
    });

    it("a food edit and entry locks taken in id order, as removeEntries takes them, finish without a deadlock", async () => {
      const user = await signUp(suite.client);
      const food = await d.ownFood(user, per100g(100));
      // The food reaches two recipes. The lower recipe's entry has the higher id, so a rewrite that
      // locked recipe by recipe would take the higher id first.
      const low = await plannedRecipe(user, [counted(food, { grams: 100 })], {
        recipe: idStarting("00000000"),
        entry: idStarting("ffffffff"),
      });
      const high = await plannedRecipe(user, [counted(food, { grams: 100 })], {
        recipe: idStarting("ffffffff"),
        entry: idStarting("00000000"),
      });
      // Stands in for removeEntries, which locks its entries in id order, the lowest first, with
      // raw locks held across the edit, so the test pins that order rather than the service.
      const removal = await sqlHolder(suite.url);
      await removal.query("SELECT id FROM entries WHERE id = $1 FOR UPDATE", [high.entry]);
      const editing = editFood(user, food, 150);
      const waited = await sessions.queuedOnLock(1);
      const second = await removal.query("SELECT id FROM entries WHERE id = $1 FOR UPDATE", [low.entry]).then(
        () => "locked",
        (err: { code?: string }) => err.code,
      );
      await removal.commit().catch(() => {});
      const res = await editing;
      expect({ waited, second, status: res.status }).toEqual({ waited: 1, second: "locked", status: 200 });
      expect([await energyOf(low.entry), await energyOf(high.entry)]).toEqual([150, 150]);
    });

    describe("a recipe edit and an add of its entry leave the entry with the basis of the later commit", () => {
      async function recipeOnFood(user: ApiUser) {
        const food = await d.ownFood(user, per100g(100));
        const body = recipeBody([counted(food, { grams: 100 })], { servings: 1 });
        await r.created(user, body);
        const edit = { ...editOf(body), lines: [{ ...body.lines[0], amount: { grams: 200 } }] };
        return { body, edit };
      }

      it("the add first", async () => {
        const user = await signUp(suite.client);
        const { body, edit } = await recipeOnFood(user);
        const add = AddEntryBodySchema.parse(recipeEntryBody(body.id, tomorrow()));
        const { waited, res } = await inOrder(
          user,
          (ctx) => addEntry(ctx, add),
          () => r.put(user, body.id, edit),
        );
        expect([waited, res.status]).toEqual([1, 200]);
        expect(await energyOf(add.id)).toBe(200);
      });

      it("the edit first", async () => {
        const user = await signUp(suite.client);
        const { body, edit } = await recipeOnFood(user);
        const entry = recipeEntryBody(body.id, tomorrow());
        const { waited, res } = await inOrder(
          user,
          (ctx) => updateRecipe(ctx, body.id, RecipeEditBodySchema.parse(edit)),
          () => d.add(user, entry),
        );
        expect([waited, res.status]).toEqual([1, 201]);
        expect(await energyOf(entry.id)).toBe(200);
      });
    });

    describe("a food edit and a recipe edit leave entries with both changes", () => {
      async function setUp(user: ApiUser) {
        const food = await d.ownFood(user, per100g(100));
        const { body, entry } = await plannedRecipe(user, [counted(food, { grams: 100 })]);
        const edit = { ...editOf(body), lines: [{ ...body.lines[0], amount: { grams: 200 } }] };
        return { food, body, entry, edit };
      }

      it("the food edit first", async () => {
        const user = await signUp(suite.client);
        const { food, body, entry, edit } = await setUp(user);
        const { waited, res } = await inOrder(
          user,
          (ctx) => updateOwnFood(ctx, food, foodEdit(300)),
          () => r.put(user, body.id, edit),
        );
        expect([waited, res.status]).toEqual([1, 200]);
        expect(await energyOf(entry)).toBe(600);
      });

      it("the recipe edit first", async () => {
        const user = await signUp(suite.client);
        const { food, body, entry, edit } = await setUp(user);
        const { waited, res } = await inOrder(
          user,
          (ctx) => updateRecipe(ctx, body.id, RecipeEditBodySchema.parse(edit)),
          () => editFood(user, food, 300),
        );
        expect([waited, res.status]).toEqual([1, 200]);
        expect(await energyOf(entry)).toBe(600);
      });
    });

    describe("a recipe edit that adds a line on an own food, and an edit of that food: the entries end with the new values", () => {
      async function setUp(user: ApiUser) {
        const kept = await d.ownFood(user, per100g(100));
        const added = await d.ownFood(user, per100g(100));
        const { body, entry } = await plannedRecipe(user, [counted(kept, { grams: 100 })]);
        const edit = { ...editOf(body), lines: [...body.lines, counted(added, { grams: 100 })] };
        return { added, body, entry, edit };
      }

      it("the recipe edit first", async () => {
        const user = await signUp(suite.client);
        const { added, body, entry, edit } = await setUp(user);
        const { waited, res } = await inOrder(
          user,
          (ctx) => updateRecipe(ctx, body.id, RecipeEditBodySchema.parse(edit)),
          () => editFood(user, added, 300),
        );
        expect([waited, res.status]).toEqual([1, 200]);
        expect(await energyOf(entry)).toBe(400);
      });

      it("the food edit first", async () => {
        const user = await signUp(suite.client);
        const { added, body, entry, edit } = await setUp(user);
        const { waited, res } = await inOrder(
          user,
          (ctx) => updateOwnFood(ctx, added, foodEdit(300)),
          () => r.put(user, body.id, edit),
        );
        expect([waited, res.status]).toEqual([1, 200]);
        expect(await energyOf(entry)).toBe(400);
      });
    });
  });
});
