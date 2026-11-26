import { expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import request from "supertest";
import type { ApiUser } from "../../../__tests__/support/apiUser.js";
import type { DbSuite } from "../../../db/__tests__/support/throwawayDb.js";

// The search sample: real Fineli names, types and recipe counts of release 18
// (see fixtures/README.md), and what the search suites share to load and read it.

export interface SampleFood {
  fineliId: number;
  type: string;
  process: string;
  name: string;
  nameEn: string;
  recipeUses: number;
  recipeFoods: number | null;
}

export const SAMPLE: SampleFood[] = readFileSync(
  path.resolve("src/services/__tests__/fixtures/fineli-names-r18.csv"),
  "utf8",
)
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const [fineliId, type, process, name, nameEn, recipeUses, recipeFoods] = line.split(";");
    return {
      fineliId: Number(fineliId),
      type,
      process,
      name,
      nameEn,
      recipeUses: Number(recipeUses),
      recipeFoods: recipeFoods === "" ? null : Number(recipeFoods),
    };
  });

/** Loads the sample as Fineli foods. The values are invented: the ranking never reads them. */
export async function loadSample(client: pg.Client): Promise<void> {
  await client.query(
    `INSERT INTO foods (source, fineli_id, name, name_en, energy_kcal, protein_g, carbs_g, fat_g, fineli_type, fineli_process,
       fineli_recipe_uses, fineli_recipe_foods)
     SELECT 'fineli', s.fineli_id, s.name, s.name_en, 100, 10, 10, 5, s.type, s.process, s.uses, s.foods
     FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[])
       AS s(fineli_id, name, name_en, type, process, uses, foods)`,
    [
      SAMPLE.map((f) => f.fineliId),
      SAMPLE.map((f) => f.name),
      SAMPLE.map((f) => f.nameEn),
      SAMPLE.map((f) => f.type),
      SAMPLE.map((f) => f.process),
      SAMPLE.map((f) => f.recipeUses),
      SAMPLE.map((f) => f.recipeFoods),
    ],
  );
}

/** Puts the sample's recipe counts back, after a test that changed them. */
export async function restoreCounts(client: pg.Client): Promise<void> {
  await client.query(
    `UPDATE foods f SET fineli_recipe_uses = s.uses, fineli_recipe_foods = s.foods
     FROM unnest($1::int[], $2::int[], $3::int[]) AS s(fineli_id, uses, foods) WHERE f.fineli_id = s.fineli_id`,
    [SAMPLE.map((f) => f.fineliId), SAMPLE.map((f) => f.recipeUses), SAMPLE.map((f) => f.recipeFoods)],
  );
}

export type Found = { id: string; name: string; source: string; isFavourite: boolean; isOwn: boolean };
export type SearchAnswer = { foods: Found[]; near: Found[] };

/** `GET /foods/search` as `as`, answered 200. */
export async function searchAs(suite: DbSuite, as: ApiUser, q: string, limit?: number): Promise<SearchAnswer> {
  const res = await request(suite.app)
    .get("/api/v1/foods/search")
    .query(limit ? { q, limit } : { q })
    .set(as.auth);
  expect(res.status).toBe(200);
  return res.body as SearchAnswer;
}

/**
 * Every match of `q` in rank order, by name, past the route's 50 rows: the
 * service's own query with a limit no sample reaches.
 */
export async function everyMatch(suite: DbSuite, userId: string, q: string): Promise<string[]> {
  const { searchQuery, searchWords } = await import("../../foodSearch.js");
  const rows = await searchQuery(suite.db, userId, await searchWords(suite.db, q), 5000);
  return rows.map((r) => r.name);
}

/** The 1-based position of the food named `name`, or 0. */
export const at = (names: string[], name: string): number => names.indexOf(name) + 1;
