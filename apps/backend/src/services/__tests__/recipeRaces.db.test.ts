import { RecipeBodySchema, RecipeEditBodySchema } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { sql } from "drizzle-orm";
import type { Response } from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { serviceHolder, sqlHolder } from "../../__tests__/support/holder.js";
import { counted, editOf, notCounted, recipeBody, recipesApi } from "../../__tests__/support/recipesApi.js";
import { sessionApi } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import type { WriteContext } from "../writes/context.js";
import { deleteOwnFood } from "../writes/foods.js";
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
});
