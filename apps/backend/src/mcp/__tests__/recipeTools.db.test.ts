import { filterRecipes } from "@hovimestari/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { randomUUID } from "node:crypto";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { recipesApi } from "../../__tests__/support/recipesApi.js";
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

// The recipe tools on a real, migrated Postgres, through a real MCP client
// and a read-and-write key, on one frozen clock. The reads answer what the
// routes answer. Each write makes the screen's change, records it with its
// ids and summary in the same transaction, answers a retry with the same
// request key as replayed with the recipe as it is now, and records nothing
// for a change that changed nothing or was refused. The pasted shakshuka of
// the recipes design (d.6) runs end to end against a seeded catalogue.

process.env.MCP_WRITES_ENABLED = "true";
quietConsole();
const NOW = "2026-11-19T10:00:00.000Z"; // noon in Helsinki
const RECORDED = "Recorded in the app under this connection's name.";
const UNCHANGED = "Nothing changed. Nothing was recorded.";
const REPLAYED = "An earlier call with this requestKey already made this change. Nothing new was written.";

let fineliIds = 900_000;
/** Notes of a few hundred characters, as a long recipe has them. */
const LONG_NOTES = `${"Serve hot with bread. ".repeat(25)}Keeps for two days.`;

await describeWithDb("mcp recipe tools", (suite) => {
  const d = daysApi(suite);
  const r = recipesApi(d);
  let server: Awaited<ReturnType<typeof listen>>;
  let w: Writer;
  let client: Client;
  let resetBrake: () => void;
  /** The seeded catalogue: a Fineli food per ingredient, with the portions an assistant would use. */
  const food: Record<"egg" | "tomato" | "feta" | "oil" | "onion", string> = {} as never;
  const portion: Record<"egg" | "oil" | "onion", string> = {} as never;

  async function fineli(name: string, values: [number, number, number, number], unit?: [string, number]) {
    const { rows } = await suite.client.query(
      `INSERT INTO foods (source, fineli_id, name, name_en, energy_kcal, protein_g, carbs_g, fat_g, fineli_type, fineli_process)
       VALUES ('fineli', $1, $2, NULL, $3, $4, $5, $6, 'FOOD', 'RAW') RETURNING id`,
      [++fineliIds, name, ...values],
    );
    const id = rows[0].id as string;
    if (!unit) return { id, portionId: "" };
    const p = await suite.client.query(
      "INSERT INTO food_portions (food_id, fineli_unit, grams) VALUES ($1, $2, $3) RETURNING id",
      [id, ...unit],
    );
    return { id, portionId: p.rows[0].id as string };
  }

  beforeAll(async () => {
    freezeDate(NOW);
    const { writesPerMinute } = await import("../writeBrake.js");
    resetBrake = () => writesPerMinute.reset();
    // The worked example's values per 100 g, and an onion.
    const egg = await fineli("Kananmuna, keitetty", [143, 12.6, 0.7, 9.5], ["KPL_M", 60]);
    const tomato = await fineli("Tomaattimurska", [24, 1.2, 3.9, 0.2]);
    const feta = await fineli("Fetajuusto", [264, 14.2, 4.1, 21.3]);
    const oil = await fineli("Oliiviöljy", [884, 0, 0, 100], ["RKL", 15]);
    const onion = await fineli("Sipuli", [36, 1, 7, 0.2], ["KPL_M", 100]);
    Object.assign(food, { egg: egg.id, tomato: tomato.id, feta: feta.id, oil: oil.id, onion: onion.id });
    Object.assign(portion, { egg: egg.portionId, oil: oil.portionId, onion: onion.portionId });
    server = await listen(suite.app);
    w = await writerWithKey(suite, d.api);
    client = await connect(server.url, w.key);
  });
  beforeEach(() => resetBrake());
  afterAll(async () => {
    await client?.close();
    await server?.close();
    jest.useRealTimers();
  });

  const records = () => recordsOf(suite, w.user.id);
  const lastRecord = async () => (await records()).at(-1);
  const restRecipe = async (id: string) => (await r.get(w.user, id)).body;
  const recipeCount = async () =>
    (await suite.client.query("SELECT count(*)::int AS n FROM recipes WHERE user_id = $1", [w.user.id])).rows[0]
      .n as number;

  /** The pasted shakshuka's lines, as the assistant builds them from search_foods and get_food. */
  const shakshukaLines = (onionPortion = portion.onion) => [
    {
      counted: true,
      foodId: food.egg,
      amount: { portionId: portion.egg, count: 4 },
      written: { amount: 4, unit: "piece" },
    },
    { counted: true, foodId: food.tomato, amount: { grams: 400 }, written: { amount: 1, unit: "can" } },
    { counted: true, foodId: food.feta, amount: { grams: 60 } },
    {
      counted: true,
      foodId: food.oil,
      amount: { portionId: portion.oil, count: 1 },
      written: { amount: 1, unit: "tbsp" },
    },
    {
      counted: true,
      foodId: food.onion,
      amount: { portionId: onionPortion, count: 1 },
      written: { amount: 1, unit: "piece" },
    },
    { counted: false, name: "Salt" },
  ];

  const createRecipe = async (name: string, extra: object = {}) =>
    (
      await written(client, "create_recipe", {
        requestKey: newRequestKey(),
        name,
        servings: 2,
        lines: [{ counted: true, foodId: food.feta, amount: { grams: 100 } }],
        ...extra,
      })
    ).recipe as { id: string; name: string; lines: { id: string }[]; steps: string[] };

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
    });
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
