import { beforeAll, describe, expect, it } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { randomUUID } from "node:crypto";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { quietConsole } from "./harness.js";
import { recipeToolSuite, RECORDED, REPLAYED } from "./recipeToolSupport.js";
import { call, newRequestKey, written, type Writer } from "./writeSupport.js";

// ---------------------------------------------------------------------------
// The cook tools on a real, migrated Postgres, through a real MCP client and
// a read-and-write key, on one frozen clock (recipeToolSupport.ts): today is
// 2026-11-19. get_cook answers what GET /cooks/:id answers. log_cook and
// save_cook_as_recipe write through the screen's services and leave one
// record row each, in the same transaction, with the cook's id and then its
// entries' ids. A retry with the same key replays. A refused call records
// nothing. log_recipe with a cookId takes the cook's figures, and the record
// reads its servings as made.
// ---------------------------------------------------------------------------

process.env.MCP_WRITES_ENABLED = "true";
quietConsole();

const TODAY = "2026-11-19";
const TOMORROW = "2026-11-20";

await describeWithDb("mcp cook tools", (suite) => {
  const t = recipeToolSuite(suite);
  const { d, food, portion, records, lastRecord, createRecipe } = t;
  let client: Client;
  let w: Writer;
  beforeAll(() => {
    client = t.client;
    w = t.w;
  });

  /** A recipe of feta and salt serving 2, and a plain planned entry of it today. */
  async function recipeWithEntry() {
    const recipe = await createRecipe(`Pasta ${randomUUID().slice(0, 6)}`, {
      lines: [
        { counted: true, foodId: food.feta, amount: { grams: 100 } },
        { counted: false, name: "Salt" },
      ],
    });
    const logged = await written(client, "log_recipe", {
      requestKey: newRequestKey(),
      recipeId: recipe.id,
      servings: 1,
      date: "today",
      status: "planned",
    });
    return { recipe, entryId: logged.entry.id as string };
  }

  const cookCount = async () =>
    (await suite.client.query("SELECT count(*)::int AS n FROM cooks WHERE user_id = $1", [w.user.id])).rows[0]
      .n as number;

  describe("log_cook", () => {
    it("logs the batch, attaches and adds, records it once with the cook then its entries, and replays a retry", async () => {
      const { recipe, entryId } = await recipeWithEntry();
      const [feta, salt] = recipe.lines;
      const requestKey = newRequestKey();
      const args = {
        requestKey,
        recipeId: recipe.id,
        date: "today",
        servings: 3,
        lines: [
          { counted: true, foodId: food.feta, amount: { grams: 150 }, fromLineId: feta!.id },
          { counted: false, name: "Salt", fromLineId: salt!.id },
          { counted: true, foodId: food.oil, amount: { grams: 15 }, fromLineId: null },
        ],
        attach: [entryId],
        attachStatus: [{ id: entryId, status: "eaten" }],
        add: [{ date: "2026-11-21", status: "planned", servings: 2 }],
      };
      const answer = await written(client, "log_cook", args);
      expect(answer).toMatchObject({ outcome: "created", note: RECORDED });
      const { cook, entries, days } = answer;
      expect(cook.diff).toMatchObject({ servings: { recipe: 2, cook: 3 }, leftOut: [], added: [cook.lines[2].id] });
      expect(entries.map((e: { id: string }) => e.id)).toEqual([entryId, expect.any(String)]);
      expect(entries[0]).toMatchObject({ status: "eaten", date: TODAY, basis: cook.basis, cook: { id: cook.id } });
      expect(entries[1]).toMatchObject({ date: "2026-11-21", servings: 2, basis: cook.basis });
      expect(days.map((day: { date: string }) => day.date)).toEqual([TODAY, "2026-11-21"]);
      expect(
        (
          await d
            .api()
            .get(d.v1(`/cooks/${cook.id}`))
            .set(w.user.auth)
        ).body,
      ).toEqual(cook);

      const record = await lastRecord();
      expect(record).toMatchObject({
        action: "cook.logged",
        requestKey,
        entityIds: [cook.id, entries[0].id, entries[1].id],
        summary: {
          entity: "cook",
          recipeName: recipe.name,
          date: TODAY,
          servings: 3,
          changes: [
            { field: "servings", from: 2, to: 3 },
            {
              field: "lines",
              added: [{ name: "Oliiviöljy", grams: 15 }],
              removed: [],
              changed: [{ name: "Fetajuusto", grams: { from: 100, to: 150 } }],
              reordered: false,
            },
          ],
          lineNotes: [],
          entries: [
            { kind: "recipe", date: TODAY, status: "eaten", amount: { servings: 1, asMade: true }, attached: true },
            {
              kind: "recipe",
              date: "2026-11-21",
              status: "planned",
              amount: { servings: 2, asMade: true },
              attached: false,
            },
          ],
        },
      });

      const before = (await records()).length;
      const again = await written(client, "log_cook", args);
      expect(again).toMatchObject({ outcome: "replayed", note: REPLAYED, cook: { id: cook.id } });
      expect(again.entries.map((e: { id: string }) => e.id)).toEqual([entries[0].id, entries[1].id]);
      expect((await records()).length).toBe(before);
    });

    it("records what the day's differs counts as a change, a line's own note apart, and which entries were attached", async () => {
      const recipe = await createRecipe(`Eggs ${randomUUID().slice(0, 6)}`, {
        lines: [
          { counted: true, foodId: food.egg, amount: { portionId: portion.egg, count: 4 } },
          { counted: true, foodId: food.feta, amount: { grams: 100 } },
        ],
      });
      const planned = await written(client, "log_recipe", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        servings: 1,
        date: TOMORROW,
        status: "planned",
      });
      const [egg, feta] = recipe.lines as { id: string; grams: number }[];
      const answer = await written(client, "log_cook", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        date: "today",
        servings: 2,
        lines: [
          // The same grams typed another way, and the same feta with a note of the batch's own.
          { counted: true, foodId: food.egg, amount: { grams: egg!.grams }, fromLineId: egg!.id },
          { counted: true, foodId: food.feta, amount: { grams: 100 }, note: "Crumbled", fromLineId: feta!.id },
        ],
        attach: [planned.entry.id],
        add: [{ date: "today", status: "eaten", servings: 1 }],
      });
      expect(answer.cook.diff).toEqual({ servings: null, changed: [], added: [], leftOut: [] });
      expect(answer.entries.map((e: { cook: { differs: boolean } }) => e.cook.differs)).toEqual([false, false]);
      const summary = (await lastRecord())!.summary as { entries: { date: string; attached: boolean }[] };
      expect(summary).toMatchObject({ changes: [], lineNotes: ["Fetajuusto"] });
      expect(summary.entries.map((e) => [e.date, e.attached])).toEqual([
        [TODAY, false],
        [TOMORROW, true],
      ]);
    });

    it("reads every line as added and every recipe line as left out when no line names its fromLineId", async () => {
      const { recipe } = await recipeWithEntry();
      const answer = await written(client, "log_cook", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        date: "today",
        servings: 2,
        lines: [
          { counted: true, foodId: food.feta, amount: { grams: 100 } },
          { counted: false, name: "Salt" },
        ],
        add: [{ date: "today", status: "eaten", servings: 1 }],
      });
      expect(answer.cook.diff.added).toHaveLength(2);
      expect(answer.cook.diff.leftOut).toEqual(recipe.lines.map((l) => l.id));
      expect(answer.entries[0].cook.differs).toBe(true);
    });

    it("refuses another recipe's entry, an eaten mark tomorrow and a batch with no entry, and records nothing", async () => {
      const { recipe } = await recipeWithEntry();
      const other = await recipeWithEntry();
      const lines = [{ counted: true, foodId: food.feta, amount: { grams: 100 }, fromLineId: recipe.lines[0]!.id }];
      const before = [await cookCount(), (await records()).length];
      const base = { recipeId: recipe.id, date: "today", servings: 2, lines };
      const tries: [Record<string, unknown>, string][] = [
        [{ attach: [other.entryId] }, "(cook_entry_invalid)"],
        [{ add: [{ date: TOMORROW, status: "eaten", servings: 1 }] }, "(entry_eaten_in_future)"],
        [{}, "(cook_entries_required)"],
      ];
      for (const [extra, code] of tries) {
        const refused = await call(client, "log_cook", { requestKey: newRequestKey(), ...base, ...extra });
        expect(refused).toMatchObject({ isError: true, text: expect.stringContaining(code) });
      }
      expect([await cookCount(), (await records()).length]).toEqual(before);
    });
  });

  describe("get_cook", () => {
    it("answers what GET /cooks/:id answers, and refuses an unknown id", async () => {
      const { recipe, entryId } = await recipeWithEntry();
      const made = await written(client, "log_cook", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        date: "today",
        servings: 2,
        lines: recipe.lines.map((l, i) =>
          i === 0
            ? { counted: true, foodId: food.feta, amount: { grams: 100 }, fromLineId: l.id }
            : { counted: false, name: "Salt", fromLineId: l.id },
        ),
        attach: [entryId],
      });
      const read = await written(client, "get_cook", { cookId: made.cook.id });
      const rest = await d
        .api()
        .get(d.v1(`/cooks/${made.cook.id}`))
        .set(w.user.auth);
      expect(read).toEqual(rest.body);
      expect(read.diff).toEqual({ servings: null, changed: [], added: [], leftOut: [] });
      const unknown = await call(client, "get_cook", { cookId: randomUUID() });
      expect(unknown).toMatchObject({ isError: true, text: expect.stringContaining("(cook_not_found)") });
    });
  });

  describe("log_recipe with a cookId", () => {
    it("takes the cook's figures and records the servings as made", async () => {
      const { recipe, entryId } = await recipeWithEntry();
      const made = await written(client, "log_cook", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        date: "today",
        servings: 4,
        lines: [{ counted: true, foodId: food.feta, amount: { grams: 300 }, fromLineId: recipe.lines[0]!.id }],
        attach: [entryId],
      });
      const logged = await written(client, "log_recipe", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        cookId: made.cook.id,
        servings: 1,
        date: TOMORROW,
        status: "planned",
      });
      expect(logged.entry).toMatchObject({ basis: made.cook.basis, cook: { id: made.cook.id, differs: true } });
      expect(await lastRecord()).toMatchObject({
        action: "entry.added",
        summary: { entry: { amount: { servings: 1, asMade: true } } },
      });
    });
  });

  describe("save_cook_as_recipe", () => {
    it("saves the batch as a new recipe, records recipe.created, and replays a retry", async () => {
      const { recipe, entryId } = await recipeWithEntry();
      const made = await written(client, "log_cook", {
        requestKey: newRequestKey(),
        recipeId: recipe.id,
        date: "today",
        servings: 3,
        lines: [{ counted: true, foodId: food.feta, amount: { grams: 250 }, fromLineId: recipe.lines[0]!.id }],
        attach: [entryId],
      });
      const requestKey = newRequestKey();
      const saved = await written(client, "save_cook_as_recipe", {
        requestKey,
        cookId: made.cook.id,
        name: "Feta pasta",
      });
      expect(saved).toMatchObject({ outcome: "created", recipe: { name: "Feta pasta", servings: 3 } });
      expect(saved.recipe.lines.map((l: { grams: number }) => l.grams)).toEqual([250]);
      expect(await lastRecord()).toMatchObject({
        action: "recipe.created",
        entityIds: [saved.recipe.id],
        summary: { entity: "recipe", name: "Feta pasta", fromCook: { recipeName: recipe.name, date: TODAY } },
      });
      const again = await written(client, "save_cook_as_recipe", {
        requestKey,
        cookId: made.cook.id,
        name: "Feta pasta",
      });
      expect(again).toMatchObject({ outcome: "replayed", recipe: { id: saved.recipe.id } });
    });
  });
});
