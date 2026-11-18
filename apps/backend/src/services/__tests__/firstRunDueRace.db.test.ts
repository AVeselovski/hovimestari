import { describe, expect, it } from "@jest/globals";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { signUp } from "../../__tests__/support/apiUser.js";
import { serviceHolder } from "../../__tests__/support/holder.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import * as schema from "../../db/schema/index.js";
import { targetsOverview } from "../reads/targets.js";
import type { WriteContext } from "../writes/context.js";
import { removeTargetChange } from "../writes/targets.js";

// A removal on another device commits while the overview reads. The removal
// deletes the change and marks the first run passed in one transaction, so
// firstRunDue must never come out true: that would show the first-run page to
// a user who has passed it.
//
// The race is staged without a sleep. The overview reads through a gate on
// the pool. Statements the gate lets go first run before the removal commits,
// the rest after it. The gate commits once it has seen as many statements as
// a plain overview sends and the "early" ones have answered.

const TODAY = "2026-11-18";

await describeWithDb("firstRunDueRace", (suite) => {
  const ctxOf = (userId: string): WriteContext => ({
    userId,
    db: suite.db,
    now: new Date(`${TODAY}T12:00:00Z`),
    timeZone: "Europe/Helsinki",
    today: TODAY,
    actor: { userId },
  });

  /** How many statements one overview sends, counted on a plain run, so the gate's count follows the service. */
  async function statementsOf(userId: string) {
    let count = 0;
    const counter = {
      query: (config: pg.QueryConfig, values?: unknown[]) => {
        count += 1;
        return suite.pool.query(config, values);
      },
    };
    await targetsOverview({ ...ctxOf(userId), db: drizzle(counter as unknown as pg.Pool, { schema }) });
    return count;
  }

  /** A user with one change, a removal of it held open, and an overview read through a gate around its commit. */
  async function raced(early: (text: string) => boolean) {
    const user = await signUp(suite.client);
    await suite.client.query(
      `INSERT INTO target_changes (user_id, effective_from, energy_kcal_lower, energy_kcal_upper, protein_g_lower, protein_g_upper)
       VALUES ($1, '2026-11-01', 1800, 2000, 120, 160)`,
      [user.id],
    );
    const removal = await serviceHolder(ctxOf(user.id), (ctx) => removeTargetChange(ctx, "2026-11-01"));

    const expected = await statementsOf(user.id);
    const earlyRuns: Promise<unknown>[] = [];
    let arrived = 0;
    let commitDone!: Promise<void>;
    let release!: () => void;
    const committed = new Promise<void>((resolve) => (release = resolve));
    const gate = {
      query: (config: unknown, values?: unknown[]) => {
        const text = typeof config === "string" ? config : (config as { text: string }).text;
        const run = () => suite.pool.query(config as pg.QueryConfig, values);
        const answer = early(text) ? run() : committed.then(run);
        if (early(text)) earlyRuns.push(answer);
        // The commit waits for a count, not a turn of the event loop: once
        // every statement of the overview has arrived and the early ones
        // have answered, the removal commits and the late ones go.
        arrived += 1;
        if (arrived === expected) {
          commitDone = Promise.all(earlyRuns)
            .then(() => removal.commit())
            .then(release);
        }
        return answer;
      },
    };
    const gated = drizzle(gate as unknown as pg.Pool, { schema });
    const overview = await targetsOverview({ ...ctxOf(user.id), db: gated });
    expect(arrived).toBe(expected);
    // With no late statement the overview answers before the commit, so the
    // read after it waits for the commit itself.
    await commitDone;
    const after = await targetsOverview(ctxOf(user.id));
    return { overview, after };
  }

  const readsUsers = (text: string) => /from "users"/.test(text);
  const readsChanges = (text: string) => /"target_changes"/.test(text);

  it("answers not due when the flag is read before the removal commits and the changes after it", async () => {
    // Before: the flag read alone saw it unset, the changes read saw none.
    const { overview, after } = await raced((text) => readsUsers(text) && !readsChanges(text));
    expect(overview).toMatchObject({ changes: [], firstRunDue: false });
    expect(after).toMatchObject({ changes: [], firstRunDue: false });
  });

  it("answers not due when every statement that reads the changes goes before the commit (a sanity case for that order, not a race)", async () => {
    // The statement that answers the flag also reads the changes, so it goes
    // early too: the answer is one view from before the commit, and this
    // order stages no race. It passed on the read before the fix as well.
    const { overview, after } = await raced(readsChanges);
    expect(overview.firstRunDue).toBe(false);
    expect(after).toMatchObject({ changes: [], firstRunDue: false });
  });

  describe("without the race", () => {
    it("answers due for a user with no change who has never passed the first run", async () => {
      const user = await signUp(suite.client);
      expect((await targetsOverview(ctxOf(user.id))).firstRunDue).toBe(true);
    });
  });
});
