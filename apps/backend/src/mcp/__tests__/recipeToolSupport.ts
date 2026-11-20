import { afterAll, beforeAll, beforeEach, jest } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { recipesApi } from "../../__tests__/support/recipesApi.js";
import type { DbSuite } from "../../db/__tests__/support/throwawayDb.js";
import { connect, freezeDate, listen } from "./harness.js";
import { newRequestKey, recordsOf, writerWithKey, written, type Writer } from "./writeSupport.js";

// What the recipe tool suites share: one frozen clock, a seeded catalogue of
// Fineli foods for the pasted shakshuka of the recipes design (d.6), a
// read-and-write key with a real MCP client, and the reads a test checks a
// tool's answer and record against. Call it inside describeWithDb: it
// registers the hooks, and `client` and `w` are set once beforeAll has run.

export const NOW = "2026-11-19T10:00:00.000Z"; // noon in Helsinki
export const RECORDED = "Recorded in the app under this connection's name.";
export const UNCHANGED = "Nothing changed. Nothing was recorded.";
export const REPLAYED = "An earlier call with this requestKey already made this change. Nothing new was written.";
/** Notes of a few hundred characters, as a long recipe has them. */
export const LONG_NOTES = `${"Serve hot with bread. ".repeat(25)}Keeps for two days.`;

let fineliIds = 900_000;

export function recipeToolSuite(suite: DbSuite) {
  const d = daysApi(suite);
  const r = recipesApi(d);
  let server: Awaited<ReturnType<typeof listen>>;
  let resetBrake: () => void;
  /** The seeded catalogue: a Fineli food per ingredient, with the portions an assistant would use. */
  const food: Record<"egg" | "tomato" | "feta" | "oil" | "onion", string> = {} as never;
  const portion: Record<"egg" | "oil" | "onion", string> = {} as never;
  const t = { d, r, food, portion, client: undefined as unknown as Client, w: undefined as unknown as Writer };

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
    t.w = await writerWithKey(suite, d.api);
    t.client = await connect(server.url, t.w.key);
  });
  beforeEach(() => resetBrake());
  afterAll(async () => {
    await t.client?.close();
    await server?.close();
    jest.useRealTimers();
  });

  const records = () => recordsOf(suite, t.w.user.id);
  const lastRecord = async () => (await records()).at(-1);
  const restRecipe = async (id: string) => (await r.get(t.w.user, id)).body;
  const recipeCount = async () =>
    (await suite.client.query("SELECT count(*)::int AS n FROM recipes WHERE user_id = $1", [t.w.user.id])).rows[0]
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
      await written(t.client, "create_recipe", {
        requestKey: newRequestKey(),
        name,
        servings: 2,
        lines: [{ counted: true, foodId: food.feta, amount: { grams: 100 } }],
        ...extra,
      })
    ).recipe as { id: string; name: string; lines: { id: string }[]; steps: string[] };

  return Object.assign(t, { records, lastRecord, restRecipe, recipeCount, shakshukaLines, createRecipe });
}
