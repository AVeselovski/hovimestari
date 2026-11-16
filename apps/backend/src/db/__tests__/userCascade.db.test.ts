import { expect, it } from "@jest/globals";
import { walkCascadeGraph } from "./support/cascadeGraph.js";
import {
  insertFineliFood,
  insertFoodEntry,
  insertMealEntry,
  insertUser,
  SEEDED_TABLES,
  seedOneOfEach,
} from "./support/seedOneOfEach.js";
import { describeWithDb } from "./support/throwawayDb.js";

// Deleting an account deletes everything it owns. Every user-owned table
// reaches users through foreign keys that all cascade, and a deletion leaves
// no row of that user and every row of everyone else. Every later step's
// tables pass through here.

await describeWithDb("userCascade", (suite) => {
  it("reaches every user-owned table from users through cascading foreign keys only", async () => {
    const report = await walkCascadeGraph(suite.client);
    expect(report.violations).toEqual([]);
  });

  it("seeds every table the graph reaches, so a new table cannot skip the deletion check", async () => {
    const report = await walkCascadeGraph(suite.client);
    expect(report.reached).toEqual([...SEEDED_TABLES].sort());
  });

  it("deletes every row of the deleted user and none of anyone else's", async () => {
    const gone = await insertUser(suite.client);
    const kept = await insertUser(suite.client);
    await seedOneOfEach(suite.client, gone);
    await seedOneOfEach(suite.client, kept);

    await suite.client.query("DELETE FROM users WHERE id = $1", [gone]);

    for (const table of SEEDED_TABLES) {
      const left = await suite.client.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [gone]);
      const others = await suite.client.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [kept]);
      expect({ table, left: left.rows[0].n }).toEqual({ table, left: 0 });
      expect({ table, others: others.rows[0].n }).toEqual({ table, others: 1 });
    }
  });

  it("keeps every Fineli food and portion, and removes the user's own portion and favourite on one", async () => {
    const gone = await insertUser(suite.client);
    const fineli = await insertFineliFood(suite.client, 900_001);
    await suite.client.query("INSERT INTO food_portions (food_id, user_id, name, grams) VALUES ($1, $2, 'tub', 200)", [
      fineli,
      gone,
    ]);
    await suite.client.query("INSERT INTO food_favourites (user_id, food_id) VALUES ($1, $2)", [gone, fineli]);

    await suite.client.query("DELETE FROM users WHERE id = $1", [gone]);

    const food = await suite.client.query("SELECT count(*)::int AS n FROM foods WHERE id = $1", [fineli]);
    const portions = await suite.client.query(
      "SELECT fineli_unit, user_id FROM food_portions WHERE food_id = $1 ORDER BY fineli_unit",
      [fineli],
    );
    const favourites = await suite.client.query("SELECT count(*)::int AS n FROM food_favourites WHERE food_id = $1", [
      fineli,
    ]);
    expect(food.rows[0].n).toBe(1);
    expect(portions.rows).toEqual([{ fineli_unit: "PORTM", user_id: null }]);
    expect(favourites.rows[0].n).toBe(0);
  });

  it("reads the composite key from entries to saved_meals as one cascading edge", async () => {
    const report = await walkCascadeGraph(suite.client);
    const { rows } = await suite.client.query(
      `SELECT confdeltype::text AS on_delete, array_length(conkey, 1) AS columns
         FROM pg_constraint WHERE conname = 'entries_saved_meal_user_fk'`,
    );
    expect(rows).toEqual([{ on_delete: "c", columns: 2 }]);
    expect(report.reached).toEqual(expect.arrayContaining(["entries", "saved_meals", "removed_entries"]));
  });

  it("removes the user's entries on a Fineli food and keeps the food", async () => {
    const gone = await insertUser(suite.client);
    const fineli = await insertFineliFood(suite.client, 900_002);
    await insertFoodEntry(suite.client, gone, fineli);

    await suite.client.query("DELETE FROM users WHERE id = $1", [gone]);

    const left = await suite.client.query("SELECT count(*)::int AS n FROM entries WHERE food_id = $1", [fineli]);
    const food = await suite.client.query("SELECT count(*)::int AS n FROM foods WHERE id = $1", [fineli]);
    expect(left.rows[0].n).toBe(0);
    expect(food.rows[0].n).toBe(1);
  });

  it("refuses an entry that points at another user's saved meal, by the composite key", async () => {
    const owner = await insertUser(suite.client);
    const other = await insertUser(suite.client);
    const meal = await suite.client.query(
      `INSERT INTO saved_meals (user_id, name, energy_kcal, protein_g, carbs_g, fat_g)
       VALUES ($1, 'Owner meal', 600, 40, 60, 20) RETURNING id`,
      [owner],
    );
    await expect(insertMealEntry(suite.client, other, meal.rows[0].id as string)).rejects.toMatchObject({
      code: "23503",
      constraint: "entries_saved_meal_user_fk",
    });
    await expect(insertMealEntry(suite.client, owner, meal.rows[0].id as string)).resolves.toBeDefined();
  });

  it("fails the walk for a child table that points at a user-owned table with ON DELETE SET NULL", async () => {
    // A migration a later step might write by mistake, applied in a savepoint and rolled back.
    await suite.client.query("BEGIN");
    try {
      await suite.client.query(`
        CREATE TABLE token_notes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          refresh_token_id uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL
        )`);
      const report = await walkCascadeGraph(suite.client);
      expect(report.violations).toEqual([expect.stringContaining("token_notes -> refresh_tokens")]);
      expect(report.reached).toContain("token_notes");
    } finally {
      await suite.client.query("ROLLBACK");
    }
  });

  it("fails the walk for a table with user_id and no foreign key", async () => {
    await suite.client.query("BEGIN");
    try {
      await suite.client.query("CREATE TABLE loose_rows (id serial PRIMARY KEY, user_id uuid NOT NULL)");
      const report = await walkCascadeGraph(suite.client);
      expect(report.violations).toEqual([expect.stringContaining("loose_rows has user_id")]);
    } finally {
      await suite.client.query("ROLLBACK");
    }
  });
});
