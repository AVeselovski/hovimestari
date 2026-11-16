import { SaveAndLogBodySchema, SavedMealBodySchema } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { signUp } from "../../__tests__/support/apiUser.js";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { serviceHolder, sqlHolder } from "../../__tests__/support/holder.js";
import { sessionApi } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import type { WriteContext } from "../writes/context.js";
import { createSavedMeal, saveAndLog } from "../writes/savedMeals.js";

// A saved meal create repeated while the first one is still running. The
// meal has two unique constraints, its id and (id, user_id), and a repeat
// must skip on either and answer the first meal as replayed, never 500.
//
// "held": the real service holds the first create open, the repeat queues
// on its row (pg_locks), the holder commits. A held repeat waits on the
// primary key and skips, so these pin the replay, not the fix.
//
// "released together": identical writes queue on the user's row, held FOR
// UPDATE on a connection of its own, and go at once when it is released.
// Two inserts then meet in flight: one passes the conflict check before the
// other has inserted, the other reaches the primary key first, and the
// (id, user_id) constraint, checked in full, raises. Only these fail
// against a conflict target of `id` alone.

const figures = { energyKcal: 500, proteinG: 30, carbsG: 50, fatG: 20 };
const mealBody = () => ({ id: randomUUID(), name: "Lounas", source: null, figures });
const logBody = () => ({
  meal: mealBody(),
  entry: { id: randomUUID(), date: "2026-01-05", status: "planned", count: 1 },
});

await describeWithDb("savedMealRaces", (suite) => {
  const d = daysApi(suite);
  const sessions = sessionApi(suite);
  const count = async (table: string, userId: string): Promise<number> =>
    (await suite.client.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [userId])).rows[0].n;

  describe("held", () => {
    it("a create repeated while the first is uncommitted answers 200 replayed, with one meal", async () => {
      const user = await signUp(suite.client);
      const body = mealBody();
      const first = await serviceHolder(await d.contextAt(user.id), (ctx) =>
        createSavedMeal(ctx, SavedMealBodySchema.parse(body)),
      );

      const repeat = d
        .api()
        .post(d.v1("/saved-meals"))
        .set(user.auth)
        .send(body)
        .then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      await first.commit();
      const res = await repeat;

      expect(first.value.outcome).toBe("created");
      expect(waited).toBe(1);
      expect([res.status, res.body.id]).toEqual([200, body.id]);
      expect(await count("saved_meals", user.id)).toBe(1);
    });

    it("a save and log repeated while the first is uncommitted answers 200 replayed, with one meal and one entry", async () => {
      const user = await signUp(suite.client);
      const body = logBody();
      const first = await serviceHolder(await d.contextAt(user.id), (ctx) =>
        saveAndLog(ctx, SaveAndLogBodySchema.parse(body)),
      );

      const repeat = d
        .api()
        .post(d.v1("/saved-meals/log"))
        .set(user.auth)
        .send(body)
        .then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      await first.commit();
      const res = await repeat;

      expect(first.value.outcome).toBe("created");
      expect(waited).toBe(1);
      expect([res.status, res.body.outcome, res.body.entry?.id]).toEqual([200, "replayed", body.entry.id]);
      expect([await count("saved_meals", user.id), await count("entries", user.id)]).toEqual([1, 1]);
    });
  });

  describe("released together", () => {
    // Node builds each query in turn on one thread, which staggers the
    // inserts, so two meet in the window only now and then: about one round
    // in a hundred against a target of `id` alone. ROUNDS makes a red run all
    // but certain against that code.
    const ROUNDS = 400;
    const SENDS = 4;

    /**
     * Per round, SENDS identical writes of a new body queue on the user's
     * row and go at once. Answers the user and every distinct failure.
     */
    async function released<B>(bodyOf: () => B, write: (ctx: WriteContext, body: B) => Promise<unknown>) {
      const user = await signUp(suite.client);
      const ctx = await d.contextAt(user.id);
      const failures = new Set<string>();
      for (let i = 0; i < ROUNDS; i++) {
        const body = bodyOf();
        const gate = await sqlHolder(suite.url);
        await gate.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [user.id]);
        const writes = Array.from({ length: SENDS }, () =>
          write(ctx, body).catch((err: { cause?: { message?: string }; message?: string }) => {
            failures.add(err.cause?.message ?? err.message ?? "unknown");
          }),
        );
        await sessions.queuedOnLock(SENDS);
        await gate.rollback();
        await Promise.all(writes);
      }
      return { user, failures: [...failures] };
    }

    it("identical creates answer the one meal, round after round", async () => {
      const { user, failures } = await released(mealBody, (ctx, body) =>
        createSavedMeal(ctx, SavedMealBodySchema.parse(body)),
      );
      expect(failures).toEqual([]);
      expect(await count("saved_meals", user.id)).toBe(ROUNDS);
    }, 120_000);

    it("identical save and logs answer the one meal and entry, round after round", async () => {
      const { user, failures } = await released(logBody, (ctx, body) =>
        saveAndLog(ctx, SaveAndLogBodySchema.parse(body)),
      );
      expect(failures).toEqual([]);
      expect([await count("saved_meals", user.id), await count("entries", user.id)]).toEqual([ROUNDS, ROUNDS]);
    }, 120_000);
  });
});
