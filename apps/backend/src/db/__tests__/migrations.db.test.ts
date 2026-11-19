import { describe, expect, it } from "@jest/globals";
import { createThrowawayDb, journal, readMigration, realDatabaseAvailable } from "./support/throwawayDb.js";

// What the migrations themselves refuse, on real Postgres: a database that is
// not UTF-8, a server without the fi-x-icu collation, and a Fineli portion
// unit the API does not name. And what a migration does to a database that
// already holds rows.

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

  it("add the record of changes on top of a database with connections, empty, and refuse an action it does not name", async () => {
    const at = journal.entries.find((e) => e.tag === "0008_assistant_changes")!.idx;
    const throwaway = await createThrowawayDb(name("changes"));
    try {
      await throwaway.migrateBefore(at);
      const user = await throwaway.client.query(
        "INSERT INTO users (email, google_id) VALUES ('m@example.com', 'g-m') RETURNING id",
      );
      const connection = await throwaway.client.query(
        `INSERT INTO assistant_connections (user_id, name, key_hash, access, expires_at)
         VALUES ($1, 'Before', md5('k'), 'read_write', now() + interval '7 days') RETURNING id`,
        [user.rows[0].id],
      );
      await throwaway.migrateAll();
      const { rows } = await throwaway.client.query("SELECT count(*)::int AS n FROM assistant_changes");
      expect(rows[0].n).toBe(0);
      const add = (action: string, ids: string) =>
        throwaway.client.query(
          `INSERT INTO assistant_changes (user_id, connection_id, connection_name, action, entity_ids, summary, request_key, request_hash)
           VALUES ($1, $2, 'Before', $3, $4::uuid[], '{}', md5(random()::text), 'h')`,
          [user.rows[0].id, connection.rows[0].id, action, ids],
        );
      await expect(add("entry.deleted", "{00000000-0000-4000-8000-000000000001}")).rejects.toMatchObject({
        code: "23514",
        constraint: "assistant_changes_action",
      });
      await expect(add("entry.added", "{}")).rejects.toMatchObject({
        code: "23514",
        constraint: "assistant_changes_entity_ids",
      });
      await expect(add("entry.added", "{00000000-0000-4000-8000-000000000001}")).resolves.toBeDefined();
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
