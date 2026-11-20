// ---------------------------------------------------------------------------
// The MCP smoke check (design g.1), lifted as a pattern from finanssiappisV2's
// scripts/mcpSmoke.
//
//   pnpm --filter @hovimestari/backend mcp:smoke
//
// Runs against a local, migrated database: the one DATABASE_URL names, which
// must be on localhost and have a name ending in _smoke (localOnly.ts).
// MCP_SMOKE_ANY_DATABASE=true lifts the name rule for one run, and only with
// MCP_SMOKE_CONFIRM_DATABASE repeating the name it prints. It boots the app in
// this process on a free port, signs up a user of its own through the API
// with a password made at run time, gives it a day of data through the REST
// routes, makes a read key and a writing key through
// POST /connections, and calls every read tool through the real MCP client,
// comparing each answer with the REST route the screens read. The
// comparisons are written out here, not shared with the tools' code, so they
// cannot agree with the code by construction. The write leg (writeLeg.ts)
// logs a food through the tool and through POST /entries and reads the
// record, then makes a food through create_own_food and logs it. At the end it revokes both keys, checks the next call is refused,
// and deletes the user, which takes every row it made with it.
//
// It reaches nothing outside this machine: every secret it needs and lacks
// is made at start-up, and barcode lookups are pointed at a closed local
// port, so a lookup that would reach Open Food Facts fails instead. Its one
// lookup finds the user's own food first. Exits 1 on any mismatch.
// ---------------------------------------------------------------------------

import "dotenv/config";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { READ_TOOL_NAMES, same, tally, withoutRouting, type Json } from "./checks.js";
import { smokeTarget } from "./localOnly.js";

const optOut = {
  anyDatabase: process.env.MCP_SMOKE_ANY_DATABASE === "true",
  confirmDatabase: process.env.MCP_SMOKE_CONFIRM_DATABASE,
};
if (optOut.anyDatabase) {
  // Printed before the check, so the name to confirm is on screen.
  const url = URL.canParse(process.env.DATABASE_URL ?? "") ? new URL(process.env.DATABASE_URL!) : null;
  console.log(`mcp:smoke will write to database "${url?.pathname.slice(1) ?? ""}" on host "${url?.hostname ?? ""}".`);
}
const target = smokeTarget(process.env.DATABASE_URL, optOut);
if ("refusal" in target) {
  console.error(`mcp:smoke runs against a local database made for it only. ${target.refusal}`);
  process.exit(1);
}

// Before the app loads its env: the secrets it lacks, writing on, and no outside network.
const secret = () => randomBytes(32).toString("hex");
for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "BFF_SECRET"]) process.env[key] ||= secret();
process.env.CORS_ORIGIN ||= "http://localhost:3000";
process.env.FRONTEND_URL ||= "http://localhost:3000";
process.env.MCP_ENABLED = "true";
process.env.MCP_WRITES_ENABLED = "true";
process.env.OFF_BASE_URL = "http://127.0.0.1:9";

const { app } = await import("../../app.js");
const { pool } = await import("../../db/index.js");
const { writeLeg } = await import("./writeLeg.js");

const MAX_RESULT_CHARS = 60_000;
const TIME_ZONE = "Europe/Helsinki";
const LABEL = { energyKcal: 120, proteinG: 10, carbsG: 4.5, fatG: 7 };
const MEAL = { energyKcal: 650, proteinG: 42, carbsG: 70, fatG: 20 };
const BARCODE = "6411300000123";

async function main(): Promise<void> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const email = `mcp-smoke-${randomUUID()}@example.com`;
  // Made at run time, like every secret here. Nothing in this file is a credential.
  const password = secret();
  let jwt = "";
  let userId = "";

  async function rest(method: string, path: string, body?: unknown): Promise<Json> {
    const res = await fetch(`${origin}/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  async function connect(key: string): Promise<Client> {
    const client = new Client({ name: "mcp-smoke", version: "0.0.1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${key}` } },
      }),
    );
    return client;
  }

  async function callOn(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Json> {
    const result = (await client.callTool({ name, arguments: args })) as Json;
    const text: string = result.content?.[0]?.text ?? "";
    if (result.isError) throw new Error(`${name} returned an error: ${text}`);
    console.log(`  ${name}: ${text.length} chars`);
    if (text.length > MAX_RESULT_CHARS)
      tally.failures.push(`${name}: ${text.length} chars is over ${MAX_RESULT_CHARS}`);
    const envelope = JSON.parse(text);
    same(`${name} envelope.timeZone`, envelope.timeZone, TIME_ZONE);
    return envelope.data;
  }

  async function recordRows(): Promise<{ action: string; entityIds: string[] }[]> {
    const { rows } = await pool.query(
      `SELECT action, entity_ids::text[] AS "entityIds" FROM assistant_changes WHERE user_id = $1 ORDER BY created_at, id`,
      [userId],
    );
    return rows;
  }

  try {
    // --- the user and a day of data, all through the API --------------------
    const signedUp = await fetch(`${origin}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bff-secret": process.env.BFF_SECRET! },
      body: JSON.stringify({ email, password }),
    });
    if (signedUp.status !== 201) throw new Error(`Sign-up failed (${signedUp.status}): ${await signedUp.text()}`);
    const grant = await signedUp.json();
    jwt = grant.accessToken;
    userId = grant.user.id;
    await rest("PATCH", "/users/me/settings", { timeZone: TIME_ZONE });
    const { today } = await rest("GET", "/targets");
    await rest("PUT", `/targets/${today}`, {
      ranges: { energyKcal: { lower: 1800, upper: 2200 }, proteinG: { lower: 120, upper: 160 } },
    });
    const food = await rest("POST", "/foods", { name: "Smoke rahka", per100g: LABEL, barcode: BARCODE });
    const portion = await rest("POST", `/foods/${food.id}/portions`, { name: "purkki", grams: 250 });
    await rest("PUT", `/foods/${food.id}/favourite`);
    const mealId = randomUUID();
    await rest("POST", "/saved-meals", { id: mealId, name: "Smoke lounas", source: "Wolt", figures: MEAL });
    const entry = (kind: string, fields: object) => ({ id: randomUUID(), date: today, kind, ...fields });
    await rest("POST", "/entries", entry("food", { foodId: food.id, amount: { grams: 200 }, status: "eaten" }));
    await rest(
      "POST",
      "/entries",
      entry("food", { foodId: food.id, amount: { portionId: portion.id, count: 1 }, status: "planned" }),
    );
    await rest("POST", "/entries", entry("saved_meal", { savedMealId: mealId, count: 1, status: "planned" }));
    await rest("POST", "/entries", entry("estimate", { name: "Smoke kahvila", figures: MEAL, status: "eaten" }));
    const recipeLines = [
      { id: randomUUID(), counted: true, foodId: food.id, amount: { portionId: portion.id, count: 1 } },
      { id: randomUUID(), counted: true, foodId: food.id, amount: { grams: 50 }, written: { amount: 2, unit: "tbsp" } },
      { id: randomUUID(), counted: false, name: "Salt" },
    ];
    const recipe = await rest("POST", "/recipes", {
      id: randomUUID(),
      name: "Smoke shakshuka",
      servings: 2,
      lines: recipeLines,
      tags: ["Brunch"],
    });

    // --- the read leg --------------------------------------------------------
    console.log("\n== read leg");
    const readKey = await rest("POST", "/connections", { name: "MCP smoke", access: "read", expiresInDays: 7 });
    const client = await connect(readKey.key);
    same(
      "read key tools",
      (await client.listTools()).tools.map((t) => t.name),
      READ_TOOL_NAMES,
    );
    same(
      "resources",
      (await client.listResources()).resources.map((r) => r.uri),
      ["hovimestari://app-rules"],
    );
    const call = (name: string, args: Record<string, unknown> = {}) => callOn(client, name, args);
    const targets = withoutRouting(await rest("GET", "/targets"));

    const context = await call("get_context");
    same("get_context.today", context.today, today);
    same("get_context.access.canWrite", context.access.canWrite, false);
    same("get_context.targets", context.targets, { inForce: targets.inForce, changes: targets.changes });
    same("get_context.rules is the text", typeof context.rules === "string" && context.rules.length > 1000, true);

    same("get_targets", await call("get_targets"), targets);
    same("get_day", await call("get_day", { date: "today" }), await rest("GET", `/days/${today}`));
    const range = await rest("GET", `/days?from=${today}&to=${today}`);
    same("get_days from to", await call("get_days", { from: today, to: today }), range);
    const week = await call("get_days", { weekOf: today });
    same("get_days weekOf holds 7 days", week.days.length, 7);
    same(
      "get_days weekOf = GET /days for its dates",
      week,
      await rest("GET", `/days?from=${week.days[0].date}&to=${week.days[6].date}`),
    );
    same(
      "search_foods",
      await call("search_foods", { q: "smoke rahka" }),
      await rest("GET", "/foods/search?q=smoke%20rahka"),
    );
    same("get_food", await call("get_food", { foodId: food.id }), await rest("GET", `/foods/${food.id}`));
    same("list_favourite_foods", await call("list_favourite_foods"), await rest("GET", "/foods/favourites"));
    same("list_own_foods", await call("list_own_foods"), await rest("GET", "/foods/own"));
    same("list_recent_items", await call("list_recent_items"), await rest("GET", "/log/recents"));
    same("list_saved_meals", await call("list_saved_meals"), await rest("GET", "/saved-meals"));
    same(
      "get_saved_meal",
      await call("get_saved_meal", { savedMealId: mealId }),
      await rest("GET", `/saved-meals/${mealId}`),
    );
    same("list_recipes", await call("list_recipes"), await rest("GET", "/recipes"));
    same(
      "list_recipes with a filter",
      await call("list_recipes", { tags: ["brunch"], minProteinG: 1, sort: "protein" }),
      await rest("GET", "/recipes?tags=brunch&minProteinG=1&sort=protein"),
    );
    same("list_recipes finds the recipe", (await call("list_recipes", { q: "smoke" })).recipes[0]?.id, recipe.id);
    same("get_recipe", await call("get_recipe", { recipeId: recipe.id }), await rest("GET", `/recipes/${recipe.id}`));
    same(
      "get_recipe with servings",
      await call("get_recipe", { recipeId: recipe.id, servings: 3 }),
      await rest("GET", `/recipes/${recipe.id}?servings=3`),
    );
    const draft = { servings: 2, lines: recipeLines.map(({ id: _id, ...line }) => line) };
    same("preview_recipe", await call("preview_recipe", draft), await rest("POST", "/recipes/preview", draft));
    same(
      "look_up_barcode",
      await call("look_up_barcode", { barcode: BARCODE }),
      await rest("POST", "/foods/lookup", { barcode: BARCODE }),
    );
    same("look_up_barcode finds the own food", (await call("look_up_barcode", { barcode: BARCODE })).food?.id, food.id);

    // --- the write leg -------------------------------------------------------
    const writeKeyId = await writeLeg({ rest, connect, recordRows, callOn }, food.id, today);

    // --- revoking ------------------------------------------------------------
    await rest("DELETE", `/connections/${readKey.connection.id}`);
    await rest("DELETE", `/connections/${writeKeyId}`);
    const refused = await client.callTool({ name: "get_context", arguments: {} }).then(
      () => false,
      () => true,
    );
    same("a call after the revoke is refused", refused, true);
    await client.close().catch(() => undefined);
  } finally {
    if (jwt)
      await rest("DELETE", "/users/me", { password }).catch((err: Error) =>
        tally.failures.push(`clean up: ${err.message}`),
      );
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }

  console.log(`\n${tally.checks} checks, ${tally.failures.length} failed.`);
  if (tally.failures.length > 0) {
    for (const failure of tally.failures) console.error(`  FAIL ${failure}`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
