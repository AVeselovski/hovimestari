import { AddEntryBodySchema, CookBodySchema } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { asMade, cookBody } from "../../__tests__/support/cooksApi.js";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { serviceHolder } from "../../__tests__/support/holder.js";
import { counted, recipeBody, recipesApi } from "../../__tests__/support/recipesApi.js";
import { sessionApi } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { AppError } from "../../lib/errors.js";
import { getEntry } from "../reads/days.js";
import { createCook } from "../writes/cooks.js";
import { addEntry, removeEntry } from "../writes/entries.js";

// A cook lives while an entry, or an entry removed in the last ten minutes,
// names it. A removal or a restore purges the user's expired removed rows,
// then the cooks nothing names any more. An add with a cookId holds the cook
// FOR SHARE, and the purge locks its cooks FOR UPDATE SKIP LOCKED and checks
// their use again before it deletes, so an add and a purge racing over one
// cook end with the entry added and the cook kept, or with the add answering
// cook_not_found. Never an add that answered 201 whose entry the cook's
// cascade took away. Every write runs on a fixed instant: the purge sees the
// cook's last removal expired eleven minutes later.

const OWN = { energyKcal: 200, proteinG: 10, carbsG: 20, fatG: 5 };
const NOON = new Date("2026-11-19T10:00:00.000Z");
const LATER = new Date(NOON.getTime() + 11 * 60 * 1000);
const DAY = "2026-11-19";

await describeWithDb("cookPurge", (suite) => {
  const d = daysApi(suite);
  const r = recipesApi(d);
  const sessions = sessionApi(suite);

  const cookExists = async (id: string) =>
    (await suite.client.query("SELECT 1 FROM cooks WHERE id = $1", [id])).rows.length === 1;

  /**
   * A recipe, a cook of it whose one entry was removed at NOON, so at LATER
   * the next purge finds it orphaned, and a plain entry whose removal at
   * LATER is that purge.
   */
  async function orphanedCook(user: ApiUser) {
    const food = await d.ownFood(user, OWN);
    const recipe = recipeBody([counted(food, { grams: 300 })]);
    await r.created(user, recipe);
    const ctx = await d.contextAt(user.id, NOON);
    const body = CookBodySchema.parse(
      cookBody(recipe.id, DAY, asMade(recipe.lines), { servings: 3, add: [{ date: DAY, status: "eaten" }] }),
    );
    const { value } = await createCook(ctx, body);
    await removeEntry(ctx, value.entries[0]!.id);
    const other = AddEntryBodySchema.parse({
      kind: "recipe",
      id: randomUUID(),
      recipeId: recipe.id,
      servings: 1,
      date: DAY,
      status: "planned",
    });
    await addEntry(ctx, other);
    const late = await d.contextAt(user.id, LATER);
    const fromCook = AddEntryBodySchema.parse({
      kind: "recipe",
      id: randomUUID(),
      recipeId: recipe.id,
      cookId: body.id,
      servings: 1,
      date: DAY,
      status: "eaten",
    });
    return { cookId: body.id, otherId: other.id, late, fromCook };
  }

  it("purges a cook nothing names once its last removal has expired", async () => {
    const user = await signUp(suite.client);
    const { cookId, otherId, late } = await orphanedCook(user);
    expect(await cookExists(cookId)).toBe(true);
    await removeEntry(late, otherId);
    expect(await cookExists(cookId)).toBe(false);
  });

  it("keeps a cook a removal of the last ten minutes still names", async () => {
    const user = await signUp(suite.client);
    const { cookId, otherId } = await orphanedCook(user);
    await removeEntry(await d.contextAt(user.id, new Date(NOON.getTime() + 60_000)), otherId);
    expect(await cookExists(cookId)).toBe(true);
  });

  describe("an add from the cook and a removal that purges it", () => {
    it("the add first: the purge skips the cook it holds, and the entry stays with its cook", async () => {
      const user = await signUp(suite.client);
      const { cookId, otherId, late, fromCook } = await orphanedCook(user);
      const adding = await serviceHolder(late, (ctx) => addEntry(ctx, fromCook));
      expect(adding.value.outcome).toBe("created");
      const purging = removeEntry(late, otherId).then(() => "done" as const);
      // A purge that waits for the add, then deletes, would cascade the new entry away.
      const first = await Promise.race([
        purging,
        sessions.queuedOnLock(1).then((n) => (n > 0 ? ("queued" as const) : ("timeout" as const))),
      ]);
      await adding.commit();
      await purging;
      expect(await getEntry(late, fromCook.id)).toMatchObject({ id: fromCook.id, cook: { id: cookId } });
      expect(await cookExists(cookId)).toBe(true);
      expect(first).toBe("done");
    });

    it("the removal first: the add waits for the purge and answers cook_not_found", async () => {
      const user = await signUp(suite.client);
      const { cookId, otherId, late, fromCook } = await orphanedCook(user);
      const purging = await serviceHolder(late, (ctx) => removeEntry(ctx, otherId));
      const adding = addEntry(late, fromCook).then(
        (result) => result,
        (err: unknown) => err,
      );
      expect(await sessions.queuedOnLock(1)).toBe(1);
      await purging.commit();
      const result = await adding;
      expect(result).toBeInstanceOf(AppError);
      expect([(result as AppError).status, (result as AppError).code]).toEqual([404, "cook_not_found"]);
      expect(await getEntry(late, fromCook.id)).toBeNull();
      expect(await cookExists(cookId)).toBe(false);
    });
  });
});
