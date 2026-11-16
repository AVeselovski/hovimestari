import { describe, expect, it } from "@jest/globals";
import { signUp } from "../../__tests__/support/apiUser.js";
import { insertFineliFood } from "../../db/__tests__/support/seedOneOfEach.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import type { Db } from "../../db/types.js";
import type { WriteContext } from "../writes/context.js";

// The writes on a real database when something changes between a service's
// check and its write: a second caller, as the MCP tools will be. A wrapper
// runs `hook` once, just before the first statement of the watched kind
// executes. The write must still touch only the caller's own rows.

// A write that runs in a transaction is watched inside it too, and the kind
// "transaction" runs `hook` just before the transaction begins.
type Kind = "update" | "delete" | "select" | "transaction";

/** A builder that runs `hook` before it executes. Every chained call keeps the wrapper. */
function deferred<T extends object>(builder: T, hook: () => Promise<void>): T {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          hook().then(() => (target as unknown as PromiseLike<unknown>).then(resolve, reject), reject);
      }
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = (value as (...a: unknown[]) => unknown).apply(target, args);
        return result && typeof result === "object" ? deferred(result as object, hook) : result;
      };
    },
  });
}

/** `db` with `hook` run once before the first `kind` statement after `skip` of them executes, in it or in a transaction it opens. */
function interfered(db: Db, kind: Kind, hook: () => Promise<void>, skip = 0): Db {
  let done = false;
  let seen = 0;
  const once = async () => {
    if (done || seen++ < skip) return;
    done = true;
    await hook();
  };
  const watch = (handle: Db): Db =>
    new Proxy(handle, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown;
        if (typeof value !== "function") return value;
        if (prop === "transaction") {
          return async (body: (tx: Db) => Promise<unknown>, ...rest: unknown[]) => {
            if (kind === "transaction") await once();
            return (value as (...a: unknown[]) => Promise<unknown>).call(target, (tx: Db) => body(watch(tx)), ...rest);
          };
        }
        if (prop !== kind) return value;
        return (...args: unknown[]) => deferred((value as (...a: unknown[]) => object).apply(target, args), once);
      },
    });
  return watch(db);
}

let fineliIds = 700_000;

await describeWithDb("foodWrites", (suite) => {
  async function contextOf(userId: string, db: Db = suite.db): Promise<WriteContext> {
    const { contextForUser } = await import("../../lib/requestContext.js");
    return { ...contextForUser({ id: userId, timeZone: "Europe/Helsinki" }, new Date()), db };
  }
  const per100g = { energyKcal: 100, proteinG: 10, carbsG: 10, fatG: 5 };
  const body = (name: string) => ({ name, per100g, barcode: null });
  const ownerOf = async (table: string, id: string) =>
    (await suite.client.query(`SELECT user_id FROM ${table} WHERE id = $1`, [id])).rows[0]?.user_id as
      string | undefined;

  async function setUp() {
    const a = await signUp(suite.client);
    const b = await signUp(suite.client);
    const writes = await import("../writes/foods.js");
    const food = (await writes.createOwnFood(await contextOf(a.id), body("Oma rahka"))).value;
    const portion = (await writes.addPortion(await contextOf(a.id), food.id, { name: "tub", grams: 200 })).value;
    return { a, b, writes, food, portion };
  }

  describe("a name search could never find", () => {
    // The shared schema refuses these before a route calls the service. The
    // service checks again with the search's own SQL, for callers (the MCP
    // tools) that pass a body the schema did not see.
    it.each(["a", "- %", "x y", "½"])("refuses %p on create and on edit, and writes nothing", async (name) => {
      const { a, writes, food } = await setUp();
      const ctx = await contextOf(a.id);
      await expect(writes.createOwnFood(ctx, body(name))).rejects.toMatchObject({
        code: "food_name_not_searchable",
        status: 400,
      });
      await expect(writes.updateOwnFood(ctx, food.id, body(name))).rejects.toMatchObject({
        code: "food_name_not_searchable",
        status: 400,
      });
      const { rows } = await suite.client.query("SELECT name FROM foods WHERE user_id = $1", [a.id]);
      expect(rows).toEqual([{ name: "Oma rahka" }]);
    });

    it("is not checked again on an edit that keeps it, so the food's values can still change", async () => {
      const { a, writes, food } = await setUp();
      // A name saved before the rule, or by a caller the schema did not see.
      await suite.client.query("UPDATE foods SET name = $1 WHERE id = $2", ["½", food.id]);
      const ctx = await contextOf(a.id);
      const edited = await writes.updateOwnFood(ctx, food.id, { ...body("½"), per100g: { ...per100g, proteinG: 12 } });
      expect(edited.outcome).toBe("changed");
      expect(edited.value.per100g.proteinG).toBe(12);
      await expect(writes.updateOwnFood(ctx, food.id, body("a"))).rejects.toMatchObject({
        code: "food_name_not_searchable",
      });
    });
  });

  describe("an own food that changes owner between the check and the write", () => {
    it("is not edited, and the edit answers 404", async () => {
      const { a, b, writes, food } = await setUp();
      const db = interfered(suite.db, "update", async () => {
        await suite.client.query("UPDATE foods SET user_id = $1 WHERE id = $2", [b.id, food.id]);
      });
      await expect(writes.updateOwnFood(await contextOf(a.id, db), food.id, body("Renamed"))).rejects.toMatchObject({
        code: "food_not_found",
        status: 404,
      });
      const { rows } = await suite.client.query("SELECT name FROM foods WHERE id = $1", [food.id]);
      expect(rows[0].name).toBe("Oma rahka");
    });

    it("is not deleted, and the delete answers 404", async () => {
      const { a, b, writes, food } = await setUp();
      // The delete locks the food first, so the owner changes as its transaction begins.
      const db = interfered(suite.db, "transaction", async () => {
        await suite.client.query("UPDATE foods SET user_id = $1 WHERE id = $2", [b.id, food.id]);
      });
      await expect(writes.deleteOwnFood(await contextOf(a.id, db), food.id)).rejects.toMatchObject({
        code: "food_not_found",
      });
      expect(await ownerOf("foods", food.id)).toBe(b.id);
    });
  });

  describe("an own portion that changes owner between the check and the write", () => {
    it("is not edited, and the edit answers 404", async () => {
      const { a, b, writes, food, portion } = await setUp();
      const db = interfered(suite.db, "update", async () => {
        await suite.client.query("UPDATE food_portions SET user_id = $1 WHERE id = $2", [b.id, portion.id]);
      });
      await expect(
        writes.updatePortion(await contextOf(a.id, db), food.id, portion.id, { name: "half", grams: 100 }),
      ).rejects.toMatchObject({ code: "portion_not_found" });
      const { rows } = await suite.client.query("SELECT name FROM food_portions WHERE id = $1", [portion.id]);
      expect(rows[0].name).toBe("tub");
    });

    it("is not deleted, and the delete answers 404", async () => {
      const { a, b, writes, food, portion } = await setUp();
      const db = interfered(suite.db, "delete", async () => {
        await suite.client.query("UPDATE food_portions SET user_id = $1 WHERE id = $2", [b.id, portion.id]);
      });
      await expect(writes.removePortion(await contextOf(a.id, db), food.id, portion.id)).rejects.toMatchObject({
        code: "portion_not_found",
      });
      expect(await ownerOf("food_portions", portion.id)).toBe(b.id);
    });
  });

  it("answers 404, not a 500, when an identical targets save loses its change to a removal", async () => {
    const a = await signUp(suite.client);
    const { setTargets } = await import("../writes/targets.js");
    const ranges = { energyKcal: { lower: 1800, upper: 2000 }, proteinG: { lower: 100, upper: 150 } };
    await setTargets(await contextOf(a.id), "2026-11-15", ranges);
    // The first select is the save's user lock. The second is the read after the save.
    const db = interfered(
      suite.db,
      "select",
      async () => {
        await suite.client.query("DELETE FROM target_changes WHERE user_id = $1", [a.id]);
      },
      1,
    );
    await expect(setTargets(await contextOf(a.id, db), "2026-11-15", ranges)).rejects.toMatchObject({
      code: "target_change_not_found",
      status: 404,
    });
  });

  it("answers no portions of a food the user cannot see", async () => {
    const { a, b, food } = await setUp();
    // An unowned portion on an own food: nothing writes one, but the read must not rely on that.
    await suite.client.query("INSERT INTO food_portions (food_id, name, grams) VALUES ($1, 'loose', 10)", [food.id]);
    const { portionsOf } = await import("../reads/foods.js");
    expect(await portionsOf(await contextOf(b.id), food.id)).toEqual([]);
    expect((await portionsOf(await contextOf(a.id), food.id)).map((p) => p.name).sort()).toEqual(["loose", "tub"]);
    const fineli = await insertFineliFood(suite.client, ++fineliIds);
    expect(await portionsOf(await contextOf(b.id), fineli)).toHaveLength(1);
  });
});
