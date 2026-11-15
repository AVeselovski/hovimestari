import { expect, it } from "@jest/globals";
import { walkCascadeGraph } from "./support/cascadeGraph.js";
import { insertUser, SEEDED_TABLES, seedOneOfEach } from "./support/seedOneOfEach.js";
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
