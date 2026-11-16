import { describe, expect, it } from "@jest/globals";
import { createThrowawayDb, readMigration, realDatabaseAvailable } from "./support/throwawayDb.js";

// What the migrations themselves refuse, on real Postgres: a database that is
// not UTF-8, a server without the fi-x-icu collation, and a Fineli portion
// unit the API does not name.

const run = await realDatabaseAvailable("migrations");
const name = (what: string) => `hovi_migrations_${what}_${process.pid}_${Date.now()}`;

(run ? describe : describe.skip)("migrations", () => {
  it("refuse a database that is not UTF-8", async () => {
    const throwaway = await createThrowawayDb(name("ascii"), "SQL_ASCII");
    try {
      await expect(throwaway.migrateAll()).rejects.toThrow(/needs a UTF8 database/);
    } finally {
      await throwaway.drop();
    }
  });

  it("refuse a server without the fi-x-icu collation", async () => {
    // Every server the tests run on has ICU, so the guard from migration 0001
    // runs here as written and then with a collation name no server has.
    const guard = readMigration("0001_search_functions")
      .split("--> statement-breakpoint")
      .find((statement) => statement.includes("pg_collation"));
    expect(guard).toBeDefined();
    const throwaway = await createThrowawayDb(name("icu"));
    try {
      await expect(throwaway.client.query(guard as string)).resolves.toBeDefined();
      await expect(
        throwaway.client.query((guard as string).replaceAll("fi-x-icu", "zz-no-such-x-icu")),
      ).rejects.toThrow(/needs the ICU collation zz-no-such-x-icu/);
    } finally {
      await throwaway.drop();
    }
  });

  it("refuse a Fineli portion unit the API does not name", async () => {
    const throwaway = await createThrowawayDb(name("units"));
    try {
      await throwaway.migrateAll();
      const { rows } = await throwaway.client.query(
        `INSERT INTO foods (source, fineli_id, name, energy_kcal, protein_g, carbs_g, fat_g)
         VALUES ('fineli', 1, 'Kana', 1, 1, 1, 1) RETURNING id`,
      );
      const add = (unit: string) =>
        throwaway.client.query("INSERT INTO food_portions (food_id, fineli_unit, grams) VALUES ($1, $2, 10)", [
          rows[0].id,
          unit,
        ]);
      await expect(add("PORTTBL")).rejects.toMatchObject({
        code: "23514",
        constraint: "food_portions_fineli_unit_known",
      });
      await expect(add("KPL_M")).resolves.toBeDefined();
    } finally {
      await throwaway.drop();
    }
  });
});
