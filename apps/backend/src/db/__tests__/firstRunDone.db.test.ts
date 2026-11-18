import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createThrowawayDb, journal, realDatabaseAvailable } from "./support/throwawayDb.js";

// The migration that adds `users.first_run_done_at` runs over accounts made
// before it, with no backfill. An account that already has targets is past
// the first run by the rule, and one without (made but never decided) still
// has it due.

const run = await realDatabaseAvailable("firstRunDone");

(run ? describe : describe.skip)("firstRunDone", () => {
  it("adds a null column to existing accounts, and firstRunDue follows the targets each one has", async () => {
    const migration = journal.entries.find((e) => e.tag.endsWith("_first_run_done"));
    expect(migration).toBeDefined();

    const throwaway = await createThrowawayDb(`hovi_first_run_${process.pid}_${Date.now()}`);
    let pool: { end(): Promise<void> } | undefined;
    try {
      await throwaway.migrateBefore(migration!.idx);
      const insertUser = async () =>
        (
          await throwaway.client.query("INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING id", [
            `migration-${randomUUID()}@example.com`,
            `google-${randomUUID()}`,
          ])
        ).rows[0].id as string;
      const withTargets = await insertUser();
      const without = await insertUser();
      await throwaway.client.query(
        `INSERT INTO target_changes (user_id, effective_from, energy_kcal_lower, energy_kcal_upper, protein_g_lower, protein_g_upper)
         VALUES ($1, '2026-11-01', 1800, 2000, 120, 160)`,
        [withTargets],
      );

      await throwaway.migrateAll();

      const { rows } = await throwaway.client.query("SELECT first_run_done_at FROM users ORDER BY created_at");
      expect(rows).toEqual([{ first_run_done_at: null }, { first_run_done_at: null }]);

      process.env.DATABASE_URL = throwaway.url;
      const { app } = await import("../../app.js");
      ({ pool } = await import("../index.js"));
      const { signAccessToken } = await import("../../lib/jwt.js");
      const dueFor = async (id: string) => {
        const res = await request(app)
          .get("/api/v1/targets")
          .set({ Authorization: `Bearer ${signAccessToken({ sub: id })}` });
        expect(res.status).toBe(200);
        return res.body.firstRunDue as unknown;
      };
      expect(await dueFor(withTargets)).toBe(false);
      expect(await dueFor(without)).toBe(true);
    } finally {
      await pool?.end();
      await throwaway.drop();
    }
  });
});
