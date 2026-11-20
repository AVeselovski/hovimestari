import { filterRecipes } from "@hovimestari/types";
import { beforeAll, describe, expect, it } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { randomUUID } from "node:crypto";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { quietConsole } from "./harness.js";
import { recipeToolSuite, RECORDED } from "./recipeToolSupport.js";
import { call, CONNECTION_NAME, newRequestKey, written, type Writer } from "./writeSupport.js";

// ---------------------------------------------------------------------------
// The recipe tools on a real, migrated Postgres, through a real MCP client
// and a read-and-write key, on one frozen clock (recipeToolSupport.ts). The
// reads answer what the routes answer. The pasted shakshuka of the recipes
// design (d.6) runs end to end against a seeded catalogue, through to
// log_recipe. A recipe on a day: log_recipe, servings on update_entry,
// get_day's recipe entries, lastPutOn, and a replay of a recipe deleted since.
// The create, edit, archive and favourite tools are in recipeEditTools.db.test.ts.
// ---------------------------------------------------------------------------

process.env.MCP_WRITES_ENABLED = "true";
quietConsole();

await describeWithDb("mcp recipe tools", (suite) => {
  const t = recipeToolSuite(suite);
  const { d, r, food, portion, records, lastRecord, restRecipe, recipeCount, shakshukaLines, createRecipe } = t;
  let client: Client;
  let w: Writer;
  beforeAll(() => {
    client = t.client;
    w = t.w;
  });

  describe("the pasted shakshuka, end to end", () => {
    it("searches, previews with a portion mistake, previews again, creates, and the created recipe is the preview", async () => {
      const found = await written(client, "search_foods", { q: "kananmuna" });
      expect(found.foods.map((f: { id: string }) => f.id)).toContain(food.egg);
      const egg = await written(client, "get_food", { foodId: food.egg });
      expect(egg.portions).toEqual([expect.objectContaining({ id: portion.egg, unit: "KPL_M", grams: 60 })]);

      // The egg's portion sent with the onion: line 4 is refused, the others answer their grams.
      const mistaken = await written(client, "preview_recipe", { servings: 2, lines: shakshukaLines(portion.egg) });
      expect(mistaken.lines.map((l: { grams: number | null; refusal: string | null }) => [l.grams, l.refusal])).toEqual(
        [
          [240, null],
          [400, null],
          [60, null],
          [15, null],
          [null, "portion_not_found"],
          [null, null],
        ],
      );
      expect([mistaken.perServing, mistaken.whole, mistaken.refusal]).toEqual([null, null, null]);
      expect(await recipeCount()).toBe(0);

      const preview = await written(client, "preview_recipe", { servings: 2, lines: shakshukaLines() });
      expect(
        preview.lines.map((l: { foodName: string | null; grams: number | null }) => [l.foodName, l.grams]),
      ).toEqual([
        ["Kananmuna, keitetty", 240],
        ["Tomaattimurska", 400],
        ["Fetajuusto", 60],
        ["Oliiviöljy", 15],
        ["Sipuli", 100],
        [null, null],
      ]);
      // The worked example's 730.2 kcal and 43.56 g, with an onion's 36 kcal and 1 g, over 2 servings.
      expect(preview.perServing).toEqual({ energyKcal: 383, proteinG: 22.3, carbsG: 13.4, fatG: 25.8 });
      expect(preview.lines[0].portion).toEqual({ id: portion.egg, unit: "KPL_M", name: null, count: 4 });

      const requestKey = newRequestKey();
      const created = await written(client, "create_recipe", {
        requestKey,
        name: "Shakshuka",
        servings: 2,
        lines: shakshukaLines(),
        steps: ["Fry the onion in the oil.", "Add the tomatoes, then the eggs and the feta."],
      });
      expect(created).toMatchObject({ outcome: "created", note: RECORDED });
      expect(created.recipe).toEqual(await restRecipe(created.recipe.id));
      expect({
        perServing: created.recipe.perServing,
        whole: created.recipe.whole,
        basis: created.recipe.basis,
        grams: created.recipe.lines.map((l: { grams: number | null }) => l.grams),
      }).toEqual({
        perServing: preview.perServing,
        whole: preview.whole,
        basis: preview.basis,
        grams: preview.lines.map((l: { grams: number | null }) => l.grams),
      });
      expect(await lastRecord()).toEqual({
        action: "recipe.created",
        entityIds: [created.recipe.id],
        requestKey,
        connectionId: w.connectionId,
        connectionName: CONNECTION_NAME,
        summary: {
          entity: "recipe",
          name: "Shakshuka",
          changes: [
            { field: "servings", from: null, to: 2 },
            {
              field: "lines",
              added: [
                { name: "Kananmuna, keitetty", grams: 240 },
                { name: "Tomaattimurska", grams: 400 },
                { name: "Fetajuusto", grams: 60 },
                { name: "Oliiviöljy", grams: 15 },
                { name: "Sipuli", grams: 100 },
                { name: "Salt", grams: null },
              ],
              removed: [],
              changed: [],
              reordered: false,
            },
            { field: "steps", from: null, to: 2, added: 2, removed: 0, changed: [], reordered: false },
          ],
        },
      });

      // "Plan one for Saturday."
      const logKey = newRequestKey();
      const logged = await written(client, "log_recipe", {
        requestKey: logKey,
        recipeId: created.recipe.id,
        servings: 1,
        date: "2026-11-21",
        status: "planned",
      });
      expect(logged).toMatchObject({ outcome: "created", note: RECORDED });
      expect(logged.entry).toMatchObject({
        kind: "recipe",
        name: "Shakshuka",
        servings: 1,
        recipe: { id: created.recipe.id, archived: false, deleted: false },
        basis: created.recipe.basis,
        figures: created.recipe.perServing,
      });
      expect(logged.days).toEqual([(await d.day(w.user, "2026-11-21")).body]);
      expect(await lastRecord()).toEqual({
        action: "entry.added",
        entityIds: [logged.entry.id],
        requestKey: logKey,
        connectionId: w.connectionId,
        connectionName: CONNECTION_NAME,
        summary: {
          entity: "entry",
          entry: {
            name: "Shakshuka",
            date: "2026-11-21",
            status: "planned",
            kind: "recipe",
            amount: { servings: 1 },
            figures: created.recipe.perServing,
          },
          changes: [],
        },
      });
    });
  });

  describe("recipes on days", () => {
    const logRecipe = async (recipeId: string, extra: object = {}) =>
      written(client, "log_recipe", {
        requestKey: newRequestKey(),
        recipeId,
        servings: 1,
        date: "2026-11-20",
        status: "planned",
        ...extra,
      });

    it("log_recipe answers a retry as replayed with the entry as it is now, and a recipe not there records nothing", async () => {
      const recipe = await createRecipe("Uunipuuro");
      const requestKey = newRequestKey();
      const args = { requestKey, recipeId: recipe.id, servings: 2, date: "today", status: "eaten" };
      const first = await written(client, "log_recipe", args);
      expect(first.entry).toMatchObject({ date: "2026-11-19", status: "eaten", servings: 2 });
      const rows = (await records()).length;
      const again = await written(client, "log_recipe", args);
      expect(again).toMatchObject({ outcome: "replayed", entry: { id: first.entry.id, servings: 2 } });
      expect(await records()).toHaveLength(rows);

      const gone = await call(client, "log_recipe", { ...args, requestKey: newRequestKey(), recipeId: randomUUID() });
      expect(gone).toMatchObject({ isError: true, text: "This recipe is no longer available. (recipe_not_found)" });
      expect(await records()).toHaveLength(rows);
    });

    it("update_own_food refused for a planned recipe serving past the cap names the recipe, as the screen's refusal does, and records nothing", async () => {
      const kcal = (energyKcal: number) => ({ energyKcal, proteinG: 0, carbsG: 0, fatG: 0 });
      const own = await d.ownFood(w.user, kcal(100), "Oma puuro");
      const big = { counted: true, foodId: own, amount: { grams: 5000 } };
      const recipe = await createRecipe("Jättipuuro", { servings: 1, lines: [big, big] });
      await logRecipe(recipe.id);
      const rows = (await records()).length;

      const args = { name: "Oma puuro", per100g: kcal(101), barcode: null };
      const refused = await call(client, "update_own_food", { requestKey: newRequestKey(), foodId: own, ...args });
      const screen = await d
        .api()
        .put(d.v1(`/foods/${own}`))
        .set(w.user.auth)
        .send(args);
      expect(screen.body).toMatchObject({ code: "food_edit_recipe_too_large", details: { recipe: "Jättipuuro" } });
      expect(refused).toMatchObject({
        isError: true,
        text:
          "A planned serving of Jättipuuro would come to more than 10000 kcal or 1000 g of a macro. " +
          "Change the recipe or its planned entries first. (food_edit_recipe_too_large)",
      });
      expect(refused.text).toBe(`${screen.body.message} (food_edit_recipe_too_large)`);
      expect(await records()).toHaveLength(rows);
    });

    it("update_entry changes a recipe entry's servings, keeps its basis and records the amount", async () => {
      const recipe = await createRecipe("Kaurapuuro");
      const { entry } = await logRecipe(recipe.id);
      const changed = await written(client, "update_entry", {
        requestKey: newRequestKey(),
        entryId: entry.id,
        servings: 1.5,
      });
      expect(changed.entry).toMatchObject({ servings: 1.5, basis: entry.basis });
      expect((await lastRecord())?.summary).toMatchObject({
        entity: "entry",
        entry: { kind: "recipe", amount: { servings: 1.5 } },
        changes: [
          { field: "amount", from: { servings: 1 }, to: { servings: 1.5 } },
          { field: "figures", from: entry.figures, to: changed.entry.figures },
        ],
      });
      const refused = await call(client, "update_entry", {
        requestKey: newRequestKey(),
        entryId: entry.id,
        count: 2,
      });
      expect(refused).toMatchObject({ isError: true, text: expect.stringContaining("(entry_kind_mismatch)") });
    });

    it("get_day answers a recipe entry's servings and recipe as GET /days does", async () => {
      const recipe = await createRecipe("Linssikeitto");
      await logRecipe(recipe.id, { servings: 2.5, date: "2026-11-23" });
      const day = await written(client, "get_day", { date: "2026-11-23" });
      expect(day).toEqual((await d.day(w.user, "2026-11-23")).body);
      expect(day.entries[0]).toMatchObject({
        kind: "recipe",
        servings: 2.5,
        recipe: { id: recipe.id, archived: false, deleted: false },
      });
    });

    it("list_recipes and get_recipe answer lastPutOn, the latest date a recipe is on", async () => {
      const recipe = await createRecipe("Lohikiusaus");
      await logRecipe(recipe.id, { date: "2026-11-25" });
      await logRecipe(recipe.id, { date: "2026-11-18", status: "eaten" });
      expect((await written(client, "get_recipe", { recipeId: recipe.id })).lastPutOn).toBe("2026-11-25");
      const listed = await written(client, "list_recipes", { q: "Lohikiusaus" });
      expect(listed.recipes.map((x: { lastPutOn: string | null }) => x.lastPutOn)).toEqual(["2026-11-25"]);
    });

    it("a create_recipe retried after the recipe was deleted on screen reads it as gone, also while a day still uses it", async () => {
      const requestKey = newRequestKey();
      const args = { requestKey, name: "Poistettu", servings: 1, lines: [{ counted: false, name: "Water" }] };
      const { recipe } = await written(client, "create_recipe", args);
      await logRecipe(recipe.id);
      expect((await r.remove(w.user, recipe.id)).status).toBe(204);
      expect((await restRecipe(recipe.id)).deleted).toBe(true);
      const again = await written(client, "create_recipe", args);
      expect(again).toMatchObject({ outcome: "replayed", recipe: null });
    });
  });

  describe("the reads", () => {
    it("list_recipes with minProteinG answers what the web's filterRecipes keeps of the same list", async () => {
      await createRecipe("Proteiinipuuro", { lines: [{ counted: true, foodId: food.feta, amount: { grams: 300 } }] });
      await createRecipe("Kevyt", { lines: [{ counted: true, foodId: food.tomato, amount: { grams: 100 } }] });
      const all = (await r.list(w.user)).body.recipes;
      const listed = await written(client, "list_recipes", { minProteinG: 20 });
      expect(listed.recipes).toEqual(filterRecipes(all, { archived: false, minProteinG: 20 }));
      expect(listed.recipes.map((x: { name: string }) => x.name)).toContain("Proteiinipuuro");
      expect(listed.recipes.map((x: { name: string }) => x.name)).not.toContain("Kevyt");
      expect((await written(client, "list_recipes", {})).recipes).toEqual(all);
      expect((await written(client, "list_recipes", { limit: 1 })).recipes).toEqual(all.slice(0, 1));
    });

    it("get_recipe answers the route's recipe, and with servings the service's scaled recipe", async () => {
      const recipe = await createRecipe("Skaalattu");
      expect(await written(client, "get_recipe", { recipeId: recipe.id })).toEqual(await restRecipe(recipe.id));
      const scaled = await written(client, "get_recipe", { recipeId: recipe.id, servings: 5 });
      expect(scaled).toEqual((await r.get(w.user, recipe.id, { servings: 5 })).body);
      expect(scaled.scaled).toMatchObject({ servings: 5, lines: [{ grams: 250 }] });
      const gone = await call(client, "get_recipe", { recipeId: randomUUID() });
      expect(gone).toMatchObject({ isError: true, text: "This recipe is no longer available. (recipe_not_found)" });
    });

    it("preview_recipe answers what POST /recipes/preview answers", async () => {
      const body = { servings: 3, lines: shakshukaLines(portion.egg) };
      expect(await written(client, "preview_recipe", body)).toEqual((await r.preview(w.user, body)).body);
    });
  });
});
