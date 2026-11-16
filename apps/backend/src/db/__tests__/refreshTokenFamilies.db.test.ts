import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { relayHeaders } from "../../__tests__/support/relay.js";
import { familyOf, freshEmail, hashOf, tokenWithoutFamily } from "../../__tests__/support/sessionApi.js";
import { createThrowawayDb, journal, realDatabaseAvailable } from "./support/throwawayDb.js";

// Test 11 of docs/design/session-renewal.md (fails today): the migration that
// adds token families runs over a table with live sessions and signs nobody
// out. Every existing row becomes a family of its own, and a token signed
// before families existed renews into a token that names its row's family.

const run = await realDatabaseAvailable("refreshTokenFamilies");

(run ? describe : describe.skip)("refreshTokenFamilies", () => {
  it("11. turns every existing row into its own live family, and an old token renews into it", async () => {
    const families = journal.entries.find((e) => e.tag.endsWith("_refresh_token_families"));
    expect(families).toBeDefined(); // today: no such migration

    const throwaway = await createThrowawayDb(`hovi_families_${process.pid}_${Date.now()}`);
    let pool: { end(): Promise<void> } | undefined;
    try {
      await throwaway.migrateBefore(families!.idx);
      const tokens: string[] = [];
      for (const sessions of [2, 1]) {
        const { rows } = await throwaway.client.query(
          "INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING id",
          [freshEmail(), `google-${tokens.length}-${Date.now()}`],
        );
        for (let i = 0; i < sessions; i++) {
          const token = tokenWithoutFamily(rows[0].id as string);
          await throwaway.client.query(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '7 days')",
            [rows[0].id, hashOf(token)],
          );
          tokens.push(token);
        }
      }

      await throwaway.migrateAll();

      const { rows } = await throwaway.client.query(
        "SELECT token_hash, family_id, superseded_at FROM refresh_tokens ORDER BY created_at",
      );
      expect(rows).toHaveLength(3);
      expect(new Set(rows.map((r) => r.family_id)).size).toBe(3);
      expect(rows.every((r) => r.superseded_at === null)).toBe(true);

      process.env.DATABASE_URL = throwaway.url;
      const { app } = await import("../../app.js");
      ({ pool } = await import("../index.js"));

      const res = await request(app).post("/api/v1/auth/refresh").set(relayHeaders()).send({ refreshToken: tokens[0] });
      expect(res.status).toBe(200);
      const rowFamily = rows.find((r) => r.token_hash === hashOf(tokens[0]))!.family_id as string;
      expect(familyOf(res.body.refreshToken as string)).toBe(rowFamily);
      // The other sessions are untouched.
      for (const token of tokens.slice(1)) {
        const other = await request(app).post("/api/v1/auth/refresh").set(relayHeaders()).send({ refreshToken: token });
        expect(other.status).toBe(200);
      }
    } finally {
      await pool?.end();
      await throwaway.drop();
    }
  });
});
