import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { randomUUID } from "node:crypto";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { connect, freezeDate, listen, quietConsole } from "./harness.js";
import {
  call,
  CONNECTION_NAME,
  newRequestKey,
  recordsOf,
  writerWithKey,
  written,
  type Writer,
} from "./writeSupport.js";

// The food and saved-meal write tools on a real, migrated Postgres, through
// a real MCP client and a read-and-write key made by POST /connections, on
// one frozen clock: each makes the screen's change (its answer equals the
// REST read), records it with its ids and summary, answers a retry with the
// same request key as `replayed` with the thing as it is now, records
// nothing for a change that changed nothing or was refused, and answers
// another person's ids exactly as ids that do not exist. targetWrites.db.test.ts
// holds the targets tools, and writeReplays.db.test.ts the request key's races.

process.env.MCP_WRITES_ENABLED = "true";
quietConsole();
const NOW = "2026-11-19T10:00:00.000Z"; // noon in Helsinki
const LABEL = { energyKcal: 120, proteinG: 10, carbsG: 4.5, fatG: 7 };
const MEAL = { energyKcal: 650, proteinG: 42, carbsG: 70, fatG: 20 };
const RECORDED = "Recorded in the app under this connection's name.";
const UNCHANGED = "Nothing changed. Nothing was recorded.";
const REPLAYED = "An earlier call with this requestKey already made this change. Nothing new was written.";

await describeWithDb("mcp food and saved-meal writes", (suite) => {
  const d = daysApi(suite);
  const api = d.api;

  describe("on a frozen clock", () => {
    let server: Awaited<ReturnType<typeof listen>>;
    let w: Writer;
    let client: Client;
    let resetBrake: () => void;

    beforeAll(async () => {
      freezeDate(NOW);
      const { writesPerMinute } = await import("../writeBrake.js");
      resetBrake = () => writesPerMinute.reset();
      server = await listen(suite.app);
      w = await writerWithKey(suite, api);
      client = await connect(server.url, w.key);
    });
    // Every test here writes on one frozen minute: the brake has its own suite.
    beforeEach(() => resetBrake());
    afterAll(async () => {
      await client?.close();
      await server?.close();
      jest.useRealTimers();
    });

    const records = () => recordsOf(suite, w.user.id);
    const lastRecord = async () => (await records()).at(-1);
    const restFood = async (id: string) =>
      (
        await api()
          .get(d.v1(`/foods/${id}`))
          .set(w.user.auth)
      ).body;
    const restMeal = async (id: string) =>
      (
        await api()
          .get(d.v1(`/saved-meals/${id}`))
          .set(w.user.auth)
      ).body;
    const foodCount = async () =>
      (await suite.client.query("SELECT count(*)::int AS n FROM foods WHERE user_id = $1", [w.user.id])).rows[0]
        .n as number;
    const createFood = async (name = "Rahka", barcode?: string) =>
      (
        await written(client, "create_own_food", {
          requestKey: newRequestKey(),
          name,
          per100g: LABEL,
          ...(barcode ? { barcode } : {}),
        })
      ).food as { id: string; name: string };

    describe("create_own_food", () => {
      it("adds an own food as the screen does, records it, and the food is found and logged at once", async () => {
        const requestKey = newRequestKey();
        const data = await written(client, "create_own_food", {
          requestKey,
          name: "Skyr vanilja",
          per100g: LABEL,
          barcode: "6 411 300 000 123",
        });
        expect(data).toMatchObject({ outcome: "created", note: RECORDED });
        expect(data.food).toEqual(await restFood(data.food.id));
        expect(data.food).toMatchObject({ source: "user", isOwn: true, barcode: "6411300000123", per100g: LABEL });
        expect(await lastRecord()).toEqual({
          action: "food.created",
          entityIds: [data.food.id],
          requestKey,
          connectionId: w.connectionId,
          connectionName: CONNECTION_NAME,
          summary: {
            entity: "food",
            name: "Skyr vanilja",
            changes: [
              { field: "per100g", from: null, to: LABEL },
              { field: "barcode", from: null, to: "6411300000123" },
            ],
          },
        });

        const found = await written(client, "search_foods", { q: "skyr vanilja" });
        expect(found.foods.map((f: { id: string }) => f.id)).toContain(data.food.id);
        const logged = await written(client, "log_food", {
          requestKey: newRequestKey(),
          foodId: data.food.id,
          amount: { grams: 150 },
          date: "today",
          status: "eaten",
        });
        expect(logged.entry).toMatchObject({ name: "Skyr vanilja", grams: 150, figures: { energyKcal: 180 } });
      });

      it("answers a retry whose first answer was lost as replayed, with the food and its id, and creates nothing", async () => {
        const requestKey = newRequestKey();
        const args = { requestKey, name: "Kaurajuoma", per100g: LABEL };
        // The first answer never reaches the model: it only learns of the food from the retry.
        await call(client, "create_own_food", args);
        const foods = await foodCount();
        const rows = (await records()).length;

        const again = await written(client, "create_own_food", args);
        expect(again).toMatchObject({ outcome: "replayed", note: REPLAYED, firstCallAt: expect.any(String) });
        expect(again.food).toMatchObject({ id: expect.any(String), name: "Kaurajuoma" });
        expect(again.food).toEqual(await restFood(again.food.id));
        expect(again.recorded).toEqual((await lastRecord())?.summary);
        expect((await lastRecord())?.entityIds).toEqual([again.food.id]);
        expect(await foodCount()).toBe(foods);
        expect(await records()).toHaveLength(rows);
      });

      it("records nothing for a refused create, and leaves its key free for the corrected call", async () => {
        await createFood("Taken barcode", "64113000001");
        const requestKey = newRequestKey();
        const foods = await foodCount();
        const rows = (await records()).length;
        const refused = await call(client, "create_own_food", {
          requestKey,
          name: "Second",
          per100g: LABEL,
          barcode: "64113000001",
        });
        expect(refused).toMatchObject({ isError: true, text: expect.stringContaining("(barcode_taken)") });
        expect(await foodCount()).toBe(foods);
        expect(await records()).toHaveLength(rows);
        const corrected = await call(client, "create_own_food", { requestKey, name: "Second", per100g: LABEL });
        expect(corrected.data).toMatchObject({ outcome: "created" });
      });
    });

    describe("update_own_food", () => {
      it("changes an own food and records each field it changed, from what to what", async () => {
        const food = await createFood("Raejuusto", "64113000002");
        const requestKey = newRequestKey();
        const next = { ...LABEL, proteinG: 12.5 };
        const data = await written(client, "update_own_food", {
          requestKey,
          foodId: food.id,
          name: "Raejuusto light",
          per100g: next,
        });
        expect(data).toMatchObject({ outcome: "changed", note: RECORDED });
        expect(data.food).toEqual(await restFood(food.id));
        expect(data.food).toMatchObject({ name: "Raejuusto light", per100g: next, barcode: null });
        expect(await lastRecord()).toMatchObject({
          action: "food.changed",
          entityIds: [food.id],
          requestKey,
          summary: {
            entity: "food",
            name: "Raejuusto light",
            changes: [
              { field: "name", from: "Raejuusto", to: "Raejuusto light" },
              { field: "per100g", from: LABEL, to: next },
              { field: "barcode", from: "64113000002", to: null },
            ],
          },
        });
      });

      it("answers unchanged for the food as it is, and records nothing", async () => {
        const food = await createFood("Same food");
        const rows = (await records()).length;
        const { data } = await call(client, "update_own_food", {
          requestKey: newRequestKey(),
          foodId: food.id,
          name: "Same food",
          per100g: LABEL,
          barcode: null,
        });
        expect(data).toMatchObject({ outcome: "unchanged", note: UNCHANGED, food: { id: food.id } });
        expect(await records()).toHaveLength(rows);
      });

      it("refuses a Fineli food and a kept Open Food Facts product as read-only, as the screen does", async () => {
        const fineli = await d.fineliFood();
        const { rows: off } = await suite.client.query(
          `INSERT INTO foods (source, name, energy_kcal, protein_g, carbs_g, fat_g, barcode)
           VALUES ('open_food_facts', 'Kept product', 100, 5, 5, 5, '4000000000017') RETURNING id`,
        );
        await suite.client.query("INSERT INTO food_lookups (user_id, food_id) VALUES ($1, $2)", [w.user.id, off[0].id]);
        const rows = (await records()).length;
        for (const foodId of [fineli.id, off[0].id as string]) {
          const body = { name: "Mine now", per100g: LABEL, barcode: null };
          const refused = await call(client, "update_own_food", { requestKey: newRequestKey(), foodId, ...body });
          expect(refused).toMatchObject({ isError: true, text: expect.stringContaining("(food_read_only)") });
          expect(
            (
              await api()
                .put(d.v1(`/foods/${foodId}`))
                .set(w.user.auth)
                .send(body)
            ).body.code,
          ).toBe("food_read_only");
        }
        expect(await records()).toHaveLength(rows);
      });

      it("answers a retry with food null once the food is deleted, or hidden because days use it", async () => {
        const unused = await createFood("Deleted later");
        const used = await createFood("Hidden later");
        await d.added(w.user, d.foodBody(used.id, { grams: 100 }));
        const retries = [];
        for (const food of [unused, used]) {
          const args = { requestKey: newRequestKey(), foodId: food.id, name: `${food.name}!`, per100g: LABEL };
          expect((await written(client, "update_own_food", args)).outcome).toBe("changed");
          expect(
            (
              await api()
                .delete(d.v1(`/foods/${food.id}`))
                .set(w.user.auth)
            ).status,
          ).toBe(204);
          retries.push(await written(client, "update_own_food", args));
        }
        // A hidden food reads as gone on screen too: GET /foods/:id answers 404.
        expect(
          (
            await api()
              .get(d.v1(`/foods/${used.id}`))
              .set(w.user.auth)
          ).status,
        ).toBe(404);
        for (const retry of retries) {
          expect(retry).toMatchObject({ outcome: "replayed", food: null, recorded: { entity: "food" } });
        }
      });
    });

    describe("add_portion and update_portion", () => {
      it("adds a portion to a Fineli food, records the food and the portion, and replays the portion", async () => {
        const fineli = await d.fineliFood();
        const requestKey = newRequestKey();
        const args = { requestKey, foodId: fineli.id, name: "Purkki", grams: 250 };
        const data = await written(client, "add_portion", args);
        expect(data).toMatchObject({ outcome: "created", note: RECORDED });
        expect(data.portion).toEqual({ id: expect.any(String), unit: null, name: "Purkki", grams: 250, isOwn: true });
        expect((await restFood(fineli.id)).portions).toContainEqual(data.portion);
        const foodName = (await restFood(fineli.id)).name;
        expect(await lastRecord()).toMatchObject({
          action: "portion.added",
          entityIds: [fineli.id, data.portion.id],
          summary: {
            entity: "food",
            name: foodName,
            changes: [
              { field: "name", from: null, to: "Purkki" },
              { field: "grams", from: null, to: 250 },
            ],
          },
        });
        const again = await written(client, "add_portion", args);
        expect(again).toMatchObject({ outcome: "replayed", portion: data.portion });
      });

      it("changes an own portion, answers unchanged for the same values, and refuses Fineli's own portion", async () => {
        const food = await createFood("Leipä");
        const portionId = await d.ownPortion(w.user, food.id, 30, "viipale");
        const changed = await written(client, "update_portion", {
          requestKey: newRequestKey(),
          foodId: food.id,
          portionId,
          name: "viipale",
          grams: 35,
        });
        expect(changed).toMatchObject({ outcome: "changed", portion: { id: portionId, grams: 35 } });
        expect(await lastRecord()).toMatchObject({
          action: "portion.changed",
          entityIds: [food.id, portionId],
          summary: { entity: "food", name: "Leipä", changes: [{ field: "grams", from: 30, to: 35 }] },
        });

        const rows = (await records()).length;
        const same = { requestKey: newRequestKey(), foodId: food.id, portionId, name: "viipale", grams: 35 };
        expect((await written(client, "update_portion", same)).outcome).toBe("unchanged");
        const fineli = await d.fineliFood();
        const refused = await call(client, "update_portion", {
          requestKey: newRequestKey(),
          foodId: fineli.id,
          portionId: fineli.portionId,
          name: "Mine",
          grams: 1,
        });
        expect(refused).toMatchObject({ isError: true, text: expect.stringContaining("(portion_read_only)") });
        expect(await records()).toHaveLength(rows);
      });
    });

    describe("set_favourite", () => {
      it("marks and unmarks a food, records each way, answers unchanged for the state it has, and replays the food", async () => {
        const fineli = await d.fineliFood();
        const name = (await restFood(fineli.id)).name;
        const markKey = newRequestKey();
        const marked = await written(client, "set_favourite", {
          requestKey: markKey,
          foodId: fineli.id,
          favourite: true,
        });
        expect(marked).toMatchObject({ outcome: "created", note: RECORDED });
        expect(await lastRecord()).toMatchObject({
          action: "favourite.set",
          entityIds: [fineli.id],
          summary: { entity: "food", name, changes: [] },
        });
        const rows = (await records()).length;
        const twice = await written(client, "set_favourite", {
          requestKey: newRequestKey(),
          foodId: fineli.id,
          favourite: true,
        });
        expect(twice).toMatchObject({ outcome: "unchanged", note: UNCHANGED });
        expect(await records()).toHaveLength(rows);

        const unmarked = await written(client, "set_favourite", {
          requestKey: newRequestKey(),
          foodId: fineli.id,
          favourite: false,
        });
        expect(unmarked.outcome).toBe("deleted");
        expect((await lastRecord())?.action).toBe("favourite.unset");
        // A retry of the first mark answers the food as it is now: no longer a favourite.
        const retried = await written(client, "set_favourite", {
          requestKey: markKey,
          foodId: fineli.id,
          favourite: true,
        });
        expect(retried).toMatchObject({ outcome: "replayed", food: { id: fineli.id, isFavourite: false } });
      });
    });

    describe("create_saved_meal, update_saved_meal and set_saved_meal_archived", () => {
      it("saves a meal with an id the app makes, records it, and replays it", async () => {
        const requestKey = newRequestKey();
        const args = { requestKey, name: "Kanasalaatti", source: " Wolt ", figures: MEAL };
        const data = await written(client, "create_saved_meal", args);
        expect(data).toMatchObject({ outcome: "created", note: RECORDED });
        expect(data.meal).toEqual(await restMeal(data.meal.id));
        expect(data.meal).toMatchObject({ name: "Kanasalaatti", source: "Wolt", figures: MEAL, archived: false });
        expect(await lastRecord()).toMatchObject({
          action: "saved_meal.created",
          entityIds: [data.meal.id],
          summary: {
            entity: "saved_meal",
            name: "Kanasalaatti",
            changes: [
              { field: "source", from: null, to: "Wolt" },
              { field: "figures", from: null, to: MEAL },
            ],
          },
        });
        expect(await written(client, "create_saved_meal", args)).toMatchObject({
          outcome: "replayed",
          meal: data.meal,
        });
      });

      it("edits a meal and records what it changed, and an edit to the same values records nothing", async () => {
        const mealId = await d.meal(w.user, MEAL, "Lounas", "Wolt");
        const next = { ...MEAL, proteinG: 45 };
        const edit = { savedMealId: mealId, name: "Lounas", figures: next };
        const changed = await written(client, "update_saved_meal", { requestKey: newRequestKey(), ...edit });
        expect(changed).toMatchObject({ outcome: "changed", meal: { id: mealId, source: null, figures: next } });
        expect(changed.meal).toEqual(await restMeal(mealId));
        expect(await lastRecord()).toMatchObject({
          action: "saved_meal.changed",
          entityIds: [mealId],
          summary: {
            entity: "saved_meal",
            name: "Lounas",
            changes: [
              { field: "source", from: "Wolt", to: null },
              { field: "figures", from: MEAL, to: next },
            ],
          },
        });
        const rows = (await records()).length;
        const same = await written(client, "update_saved_meal", { requestKey: newRequestKey(), ...edit });
        expect(same).toMatchObject({ outcome: "unchanged", note: UNCHANGED, meal: changed.meal });
        expect(await records()).toHaveLength(rows);
      });

      it("archives and restores a meal, records each, and records nothing for the state it already has", async () => {
        const mealId = await d.meal(w.user, MEAL, "Aamiainen");
        const archiveKey = newRequestKey();
        const archived = await written(client, "set_saved_meal_archived", {
          requestKey: archiveKey,
          savedMealId: mealId,
          archived: true,
        });
        expect(archived).toMatchObject({ outcome: "changed", note: RECORDED });
        expect(await lastRecord()).toMatchObject({
          action: "saved_meal.archived",
          entityIds: [mealId],
          summary: { entity: "saved_meal", name: "Aamiainen", changes: [] },
        });
        expect((await restMeal(mealId)).archived).toBe(true);

        const rows = (await records()).length;
        const again = await written(client, "set_saved_meal_archived", {
          requestKey: newRequestKey(),
          savedMealId: mealId,
          archived: true,
        });
        expect(again).toMatchObject({ outcome: "unchanged", note: UNCHANGED });
        expect(await records()).toHaveLength(rows);

        await written(client, "set_saved_meal_archived", {
          requestKey: newRequestKey(),
          savedMealId: mealId,
          archived: false,
        });
        expect((await lastRecord())?.action).toBe("saved_meal.restored");
        const retried = await written(client, "set_saved_meal_archived", {
          requestKey: archiveKey,
          savedMealId: mealId,
          archived: true,
        });
        expect(retried).toMatchObject({ outcome: "replayed", meal: { id: mealId, archived: false } });
      });

      it("answers a retry with meal null once the meal is deleted", async () => {
        const mealId = await d.meal(w.user, MEAL, "Poistuva");
        const args = { requestKey: newRequestKey(), savedMealId: mealId, name: "Poistuva 2", figures: MEAL };
        await written(client, "update_saved_meal", args);
        expect(
          (
            await api()
              .delete(d.v1(`/saved-meals/${mealId}`))
              .set(w.user.auth)
          ).status,
        ).toBe(204);
        expect(await written(client, "update_saved_meal", args)).toMatchObject({ outcome: "replayed", meal: null });
      });
    });

    describe("another person's ids", () => {
      it("are answered exactly as ids that do not exist, change nothing and record nothing", async () => {
        const other = await writerWithKey(suite, api);
        const theirFood = await d.ownFood(other.user, LABEL, "Their food");
        const theirPortion = await d.ownPortion(other.user, theirFood, 40, "theirs");
        const theirMeal = await d.meal(other.user, MEAL, "Their lunch");
        const read = async () => ({
          food: (
            await api()
              .get(d.v1(`/foods/${theirFood}`))
              .set(other.user.auth)
          ).body,
          meal: (
            await api()
              .get(d.v1(`/saved-meals/${theirMeal}`))
              .set(other.user.auth)
          ).body,
        });
        const before = await read();
        const mine = (await records()).length;

        const calls: [string, (id: string) => Record<string, unknown>, string][] = [
          ["update_own_food", (id) => ({ foodId: id, name: "Taken", per100g: LABEL }), theirFood],
          ["add_portion", (id) => ({ foodId: id, name: "Taken", grams: 10 }), theirFood],
          ["set_favourite", (id) => ({ foodId: id, favourite: true }), theirFood],
          ["update_portion", (id) => ({ foodId: theirFood, portionId: id, name: "Taken", grams: 10 }), theirPortion],
          ["update_saved_meal", (id) => ({ savedMealId: id, name: "Taken", figures: MEAL }), theirMeal],
          ["set_saved_meal_archived", (id) => ({ savedMealId: id, archived: true }), theirMeal],
        ];
        for (const [tool, args, id] of calls) {
          const withTheirs = await call(client, tool, { requestKey: newRequestKey(), ...args(id) });
          const withMissing = await call(client, tool, { requestKey: newRequestKey(), ...args(randomUUID()) });
          expect(withTheirs.isError).toBe(true);
          expect({ tool, ...withTheirs }).toEqual({ tool, ...withMissing });
        }

        expect(await read()).toEqual(before);
        expect(await records()).toHaveLength(mine);
        expect(await recordsOf(suite, other.user.id)).toEqual([]);
      });
    });

    describe("a write from the screen", () => {
      it("records nothing, whichever food or meal route it takes", async () => {
        const rows = (await records()).length;
        const foodId = await d.ownFood(w.user, LABEL, "From the screen");
        expect(
          (
            await api()
              .put(d.v1(`/foods/${foodId}`))
              .set(w.user.auth)
              .send({ name: "Edited", per100g: LABEL })
          ).status,
        ).toBe(200);
        const portionId = await d.ownPortion(w.user, foodId, 20);
        expect(
          (
            await api()
              .put(d.v1(`/foods/${foodId}/portions/${portionId}`))
              .set(w.user.auth)
              .send({ name: "x", grams: 21 })
          ).status,
        ).toBe(200);
        expect(
          (
            await api()
              .put(d.v1(`/foods/${foodId}/favourite`))
              .set(w.user.auth)
          ).status,
        ).toBe(204);
        const mealId = await d.meal(w.user, MEAL, "Screen meal");
        expect(
          (
            await api()
              .put(d.v1(`/saved-meals/${mealId}`))
              .set(w.user.auth)
              .send({ name: "Edited", figures: MEAL })
          ).status,
        ).toBe(200);
        expect(
          (
            await api()
              .put(d.v1(`/saved-meals/${mealId}/archived`))
              .set(w.user.auth)
          ).status,
        ).toBe(204);
        expect(await records()).toHaveLength(rows);
      });
    });
  });
});
