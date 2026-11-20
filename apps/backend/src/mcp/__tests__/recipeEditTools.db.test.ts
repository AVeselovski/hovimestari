import { beforeAll, describe, expect, it } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { randomUUID } from "node:crypto";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { quietConsole } from "./harness.js";
import { LONG_NOTES, recipeToolSuite, RECORDED, REPLAYED, UNCHANGED } from "./recipeToolSupport.js";
import { call, newRequestKey, writerWithKey, written, type Writer } from "./writeSupport.js";

// ---------------------------------------------------------------------------
// The recipe write tools that keep the library, on a real, migrated Postgres
// through a real MCP client (recipeToolSupport.ts). Each write makes the
// screen's change, records it with its ids and summary in the same
// transaction, answers a retry with the same request key as replayed with the
// recipe as it is now, and records nothing for a change that changed nothing
// or was refused.
// ---------------------------------------------------------------------------

process.env.MCP_WRITES_ENABLED = "true";
quietConsole();

await describeWithDb("mcp recipe edit tools", (suite) => {
  const t = recipeToolSuite(suite);
  const { d, r, food, portion, records, lastRecord, restRecipe, recipeCount, createRecipe } = t;
  let client: Client;
  let w: Writer;
  beforeAll(() => {
    client = t.client;
    w = t.w;
  });

  describe("create_recipe", () => {
    it("answers a retry with the same request key as replayed, with the recipe as it is now, and creates nothing", async () => {
      const requestKey = newRequestKey();
      const args = { requestKey, name: "Lohikeitto", servings: 4, lines: [{ counted: false, name: "Water" }] };
      await call(client, "create_recipe", args);
      const [rows, recipes] = [(await records()).length, await recipeCount()];
      const again = await written(client, "create_recipe", args);
      expect(again).toMatchObject({ outcome: "replayed", note: REPLAYED, firstCallAt: expect.any(String) });
      expect(again.recipe).toEqual(await restRecipe(again.recipe.id));
      expect(again.recorded).toEqual((await lastRecord())?.summary);
      expect([(await records()).length, await recipeCount()]).toEqual([rows, recipes]);
    });

    it("answers a create refused after a clean preview, its food deleted in between, with the line it names, and records nothing", async () => {
      const own = await d.ownFood(w.user, { energyKcal: 100, proteinG: 10, carbsG: 0, fatG: 0 }, "Oma rahka");
      const lines = [
        { counted: false, name: "Salt" },
        { counted: true, foodId: food.feta, amount: { grams: 50 } },
        { counted: true, foodId: own, amount: { grams: 200 } },
      ];
      const preview = await written(client, "preview_recipe", { servings: 2, lines });
      expect(preview.lines.map((l: { refusal: string | null }) => l.refusal)).toEqual([null, null, null]);
      const deleted = await d
        .api()
        .delete(d.v1(`/foods/${own}`))
        .set(w.user.auth);
      expect(deleted.status).toBe(204);
      const [rows, recipes] = [(await records()).length, await recipeCount()];
      const refused = await call(client, "create_recipe", {
        requestKey: newRequestKey(),
        name: "Rahka",
        servings: 2,
        lines,
      });
      expect(refused).toEqual({
        isError: true,
        text: "This food is no longer available. (food_not_found, line: 2)",
        data: undefined,
      });
      expect([(await records()).length, await recipeCount()]).toEqual([rows, recipes]);
    });
  });

  describe("update_recipe", () => {
    it("keeps a line that keeps its id, adds one without, and records each field it changed", async () => {
      const recipe = await createRecipe("Fetasalaatti", { tags: ["Lunch"] });
      const requestKey = newRequestKey();
      const data = await written(client, "update_recipe", {
        requestKey,
        recipeId: recipe.id,
        name: "Fetasalaatti",
        servings: 1,
        lines: [
          { id: recipe.lines[0].id, counted: true, foodId: food.feta, amount: { grams: 100 } },
          { counted: true, foodId: food.tomato, amount: { grams: 200 } },
        ],
        tags: ["Lunch", "Quick"],
      });
      expect(data).toMatchObject({ outcome: "changed", note: RECORDED });
      expect(data.recipe).toEqual(await restRecipe(recipe.id));
      expect(data.recipe.lines[0].id).toBe(recipe.lines[0].id);
      expect(await lastRecord()).toMatchObject({
        action: "recipe.changed",
        entityIds: [recipe.id],
        requestKey,
        summary: {
          entity: "recipe",
          name: "Fetasalaatti",
          changes: [
            { field: "servings", from: 2, to: 1 },
            {
              field: "lines",
              added: [{ name: "Tomaattimurska", grams: 200 }],
              removed: [],
              changed: [],
              reordered: false,
            },
            { field: "tags", from: ["Lunch"], to: ["Lunch", "Quick"] },
          ],
        },
      });
    });

    /** A recipe of four lines and four steps, with notes, through create_recipe. */
    const fourLinesBody = () => [
      { counted: true, foodId: food.egg, amount: { portionId: portion.egg, count: 4 } },
      { counted: true, foodId: food.feta, amount: { grams: 100 } },
      { counted: true, foodId: food.oil, amount: { grams: 15 }, written: { amount: 1, unit: "tbsp" } },
      { counted: false, name: "Salt", note: "flaky" },
    ];
    async function fourLines() {
      const recipe = await createRecipe("Shakshuka", {
        servings: 3,
        lines: fourLinesBody(),
        steps: ["Fry the onion.", "Add the tomatoes.", "Crack in the eggs.", "Crumble the feta."],
        notes: LONG_NOTES,
      });
      const [eggLine, feta, oil, salt] = recipe.lines.map((l) => l.id);
      return { recipe, eggLine, feta, oil, salt };
    }
    const update = (recipeId: string, body: object) =>
      written(client, "update_recipe", { requestKey: newRequestKey(), recipeId, name: "Shakshuka", ...body });
    const changesOf = async () => ((await lastRecord())?.summary as { changes: unknown[] }).changes;

    it("records only the lines that differ: each change by what a person would call it, never the whole list", async () => {
      const { recipe, eggLine, feta, oil } = await fourLines();
      await update(recipe.id, {
        servings: 3,
        lines: [
          { id: eggLine, counted: true, foodId: food.egg, amount: { portionId: portion.egg, count: 5 } },
          { id: feta, counted: true, foodId: food.feta, amount: { grams: 100 }, note: "crumbled" },
          { id: oil, counted: true, foodId: food.oil, amount: { grams: 15 }, written: { amount: 2, unit: "tbsp" } },
          { counted: true, foodId: food.onion, amount: { grams: 80 } },
        ],
        steps: ["Fry the onion.", "Add the tomatoes.", "Crack in the eggs.", "Crumble the feta."],
        notes: LONG_NOTES,
      });
      expect(await changesOf()).toEqual([
        {
          field: "lines",
          added: [{ name: "Sipuli", grams: 80 }],
          removed: [{ name: "Salt", grams: null }],
          changed: [
            {
              name: "Kananmuna, keitetty",
              grams: { from: 240, to: 300 },
              portion: { from: { count: 4, unit: "KPL_M", name: null }, to: { count: 5, unit: "KPL_M", name: null } },
            },
            { name: "Fetajuusto", note: "added" },
            { name: "Oliiviöljy", written: { from: { amount: 1, unit: "tbsp" }, to: { amount: 2, unit: "tbsp" } } },
          ],
          reordered: false,
        },
      ]);
    });

    it("records a line's food swapped, and lines that only moved as the order changed", async () => {
      const { recipe, eggLine, feta, oil, salt } = await fourLines();
      const same = { servings: 3, steps: recipe.steps, notes: LONG_NOTES };
      const eggs = { id: eggLine, counted: true, foodId: food.egg, amount: { portionId: portion.egg, count: 4 } };
      const oils = {
        id: oil,
        counted: true,
        foodId: food.oil,
        amount: { grams: 15 },
        written: { amount: 1, unit: "tbsp" },
      };
      const salts = { id: salt, counted: false, name: "Salt", note: "flaky" };
      await update(recipe.id, {
        ...same,
        lines: [eggs, { id: feta, counted: true, foodId: food.tomato, amount: { grams: 100 } }, oils, salts],
      });
      expect(await changesOf()).toEqual([
        {
          field: "lines",
          added: [],
          removed: [],
          changed: [{ name: "Tomaattimurska", food: { from: "Fetajuusto" } }],
          reordered: false,
        },
      ]);
      await update(recipe.id, {
        ...same,
        lines: [salts, eggs, { id: feta, counted: true, foodId: food.tomato, amount: { grams: 100 } }, oils],
      });
      expect(await changesOf()).toEqual([{ field: "lines", added: [], removed: [], changed: [], reordered: true }]);
    });

    it("records the method by its counts and the steps that changed, the notes by how, the servings as numbers", async () => {
      const { recipe } = await fourLines();
      const lines = recipe.lines.map(({ id }, i) => ({ ...fourLinesBody()[i], id }));
      await update(recipe.id, {
        servings: 2,
        lines,
        steps: ["Fry the onion.", "Add the crushed tomatoes.", "Crack in the eggs.", "Crumble the feta."],
        notes: LONG_NOTES.replace("bread", "toast"),
      });
      expect(await changesOf()).toEqual([
        { field: "servings", from: 3, to: 2 },
        { field: "steps", from: 4, to: 4, added: 0, removed: 0, changed: [2], reordered: false },
        { field: "notes", change: "changed" },
      ]);
      await update(recipe.id, { servings: 2, lines, steps: ["Fry the onion."], notes: null });
      expect(await changesOf()).toEqual([
        { field: "steps", from: 4, to: 1, added: 0, removed: 3, changed: [], reordered: false },
        { field: "notes", change: "removed" },
      ]);
      await update(recipe.id, { servings: 2, lines, steps: ["Fry it all."], notes: "Hot." });
      expect(await changesOf()).toEqual([
        { field: "steps", from: 1, to: 1, added: 0, removed: 0, changed: [1], reordered: false },
        { field: "notes", change: "added" },
      ]);
    });

    it("records a step added at the top as one added, never the steps after it as changed", async () => {
      const { recipe } = await fourLines();
      const lines = recipe.lines.map(({ id }, i) => ({ ...fourLinesBody()[i], id }));
      await update(recipe.id, { servings: 3, lines, steps: ["Warm the pan.", ...recipe.steps], notes: LONG_NOTES });
      expect(await changesOf()).toEqual([
        { field: "steps", from: 4, to: 5, added: 1, removed: 0, changed: [], reordered: false },
      ]);
    });

    describe("a line sent again without its id", () => {
      const same = (recipe: { steps: string[] }) => ({ servings: 3, steps: recipe.steps, notes: LONG_NOTES });
      const idsOf = async (id: string) => (await restRecipe(id)).lines.map(({ id }: { id: string }) => id);

      it("keeps the line it equals: a whole recipe sent again so answers unchanged, records nothing, and a retry the same", async () => {
        const { recipe } = await fourLines();
        const rows = (await records()).length;
        const requestKey = newRequestKey();
        const args = { requestKey, recipeId: recipe.id, name: "Shakshuka", ...same(recipe), lines: fourLinesBody() };
        const data = await written(client, "update_recipe", args);
        expect(data).toMatchObject({ outcome: "unchanged", note: UNCHANGED, recipe: await restRecipe(recipe.id) });
        expect(await records()).toHaveLength(rows);
        expect(await written(client, "update_recipe", args)).toMatchObject({ outcome: "unchanged", note: UNCHANGED });
        expect(await records()).toHaveLength(rows);
        expect(await idsOf(recipe.id)).toEqual(recipe.lines.map(({ id }) => id));
      });

      it("keeps each line's id in a new order, and records the order changed", async () => {
        const { recipe, eggLine, feta, oil, salt } = await fourLines();
        const [e, f, o, s] = fourLinesBody();
        await update(recipe.id, { ...same(recipe), lines: [s, e, f, o] });
        expect(await changesOf()).toEqual([{ field: "lines", added: [], removed: [], changed: [], reordered: true }]);
        expect(await idsOf(recipe.id)).toEqual([salt, eggLine, feta, oil]);
      });

      it("keeps the lines it equals beside real changes, and records only those", async () => {
        const { recipe, eggLine, feta, oil, salt } = await fourLines();
        const [e, f, , s] = fourLinesBody();
        await update(recipe.id, {
          ...same(recipe),
          lines: [e, { ...f, amount: { grams: 120 } }, s, { counted: true, foodId: food.onion, amount: { grams: 80 } }],
        });
        expect(await changesOf()).toEqual([
          {
            field: "lines",
            added: [
              { name: "Fetajuusto", grams: 120 },
              { name: "Sipuli", grams: 80 },
            ],
            removed: [
              { name: "Fetajuusto", grams: 100 },
              { name: "Oliiviöljy", grams: 15 },
            ],
            changed: [],
            reordered: false,
          },
        ]);
        const ids = await idsOf(recipe.id);
        expect([ids[0], ids[2]]).toEqual([eggLine, salt]);
        expect(ids).not.toContain(feta);
        expect(ids).not.toContain(oil);
      });

      it("pairs two identical lines one to one", async () => {
        const salt = { counted: false, name: "Salt" };
        const recipe = await createRecipe("Suolattu", {
          lines: [salt, { counted: true, foodId: food.feta, amount: { grams: 100 } }, salt],
        });
        const [s1, f] = recipe.lines.map((l) => l.id);
        const lines = [salt, { id: f, counted: true, foodId: food.feta, amount: { grams: 100 } }, salt];
        const rows = (await records()).length;
        const again = await written(client, "update_recipe", {
          requestKey: newRequestKey(),
          recipeId: recipe.id,
          name: "Suolattu",
          servings: 2,
          lines,
        });
        expect(again).toMatchObject({ outcome: "unchanged" });
        expect(await records()).toHaveLength(rows);
        await written(client, "update_recipe", {
          requestKey: newRequestKey(),
          recipeId: recipe.id,
          name: "Suolattu",
          servings: 2,
          lines: lines.slice(0, 2),
        });
        expect((await lastRecord())?.summary).toMatchObject({
          changes: [{ field: "lines", added: [], removed: [{ name: "Salt", grams: null }], changed: [] }],
        });
        expect(await idsOf(recipe.id)).toEqual([s1, f]);
      });
    });

    it("answers unchanged for the recipe as it is, and records nothing", async () => {
      const recipe = await createRecipe("Same");
      const rows = (await records()).length;
      const data = await written(client, "update_recipe", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        name: "Same",
        servings: 2,
        lines: [{ id: recipe.lines[0].id, counted: true, foodId: food.feta, amount: { grams: 100 } }],
      });
      expect(data).toMatchObject({ outcome: "unchanged", note: UNCHANGED, recipe: { id: recipe.id } });
      expect(await records()).toHaveLength(rows);
    });

    it("answers another person's recipe as one that does not exist, and records nothing", async () => {
      const other = await writerWithKey(suite, d.api);
      const theirs = (await r.created(other.user, {
        id: randomUUID(),
        name: "Theirs",
        servings: 2,
        lines: [{ id: randomUUID(), counted: false, name: "Salt" }],
      })) as { id: string };
      const rows = (await records()).length;
      const args = (recipeId: string) => ({
        requestKey: newRequestKey(),
        recipeId,
        name: "Mine",
        servings: 1,
        lines: [{ counted: false, name: "Salt" }],
      });
      const withTheirs = await call(client, "update_recipe", args(theirs.id));
      const withMissing = await call(client, "update_recipe", args(randomUUID()));
      expect(withTheirs).toEqual(withMissing);
      expect(withTheirs).toMatchObject({ isError: true, text: expect.stringContaining("(recipe_not_found)") });
      for (const tool of ["set_recipe_archived", "set_recipe_favourite"]) {
        const flag = tool === "set_recipe_archived" ? { archived: true } : { favourite: true };
        const a = await call(client, tool, { requestKey: newRequestKey(), recipeId: theirs.id, ...flag });
        const b = await call(client, tool, { requestKey: newRequestKey(), recipeId: randomUUID(), ...flag });
        expect({ tool, ...a }).toEqual({ tool, ...b });
      }
      expect(await records()).toHaveLength(rows);
      expect((await r.get(other.user, theirs.id)).body).toMatchObject({
        name: "Theirs",
        archived: false,
        favourite: false,
      });
    });
  });

  describe("set_recipe_archived and set_recipe_favourite", () => {
    it("archive, restore, mark and unmark, each recorded once, unchanged for the state it has, and replayed with the recipe", async () => {
      const recipe = await createRecipe("Puuro");
      const archiveKey = newRequestKey();
      const archived = await written(client, "set_recipe_archived", {
        requestKey: archiveKey,
        recipeId: recipe.id,
        archived: true,
      });
      expect(archived).toMatchObject({ outcome: "changed", note: RECORDED });
      expect(await lastRecord()).toMatchObject({
        action: "recipe.archived",
        entityIds: [recipe.id],
        summary: { entity: "recipe", name: "Puuro", changes: [] },
      });
      const rows = (await records()).length;
      const twice = await written(client, "set_recipe_archived", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        archived: true,
      });
      expect(twice).toMatchObject({ outcome: "unchanged", note: UNCHANGED });
      expect(await records()).toHaveLength(rows);
      const replayed = await written(client, "set_recipe_archived", {
        requestKey: archiveKey,
        recipeId: recipe.id,
        archived: true,
      });
      expect(replayed).toMatchObject({ outcome: "replayed", recipe: { id: recipe.id, archived: true } });

      await written(client, "set_recipe_archived", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        archived: false,
      });
      expect((await lastRecord())?.action).toBe("recipe.restored");
      await written(client, "set_recipe_favourite", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        favourite: true,
      });
      expect((await lastRecord())?.action).toBe("recipe.favourite_set");
      expect((await restRecipe(recipe.id)).favourite).toBe(true);
      const again = await written(client, "set_recipe_favourite", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        favourite: true,
      });
      expect(again.outcome).toBe("unchanged");
      await written(client, "set_recipe_favourite", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        favourite: false,
      });
      expect((await lastRecord())?.action).toBe("recipe.favourite_unset");
    });
  });
});
