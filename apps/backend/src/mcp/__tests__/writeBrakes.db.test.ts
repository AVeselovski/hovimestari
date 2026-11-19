import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { connect, freezeDate, listen, quietConsole } from "./harness.js";
import { call, newRequestKey, writerWithKey, type Writer } from "./writeSupport.js";

// The two brakes on an assistant's writes (design d.4), on a real Postgres
// and a frozen clock: 30 write calls a minute, refused ones included, and
// 300 recorded changes an hour, each counted per person across every key,
// pinned just inside and just past its window. The clock is years after the
// real one, so a record row the database stamps with its own clock is older
// than any window here, and only the rows a test places count.

process.env.MCP_WRITES_ENABLED = "true";
quietConsole();
const NOW = Date.parse("2030-01-15T10:00:00.000Z");
const MINUTE = 60_000;
const HOUR = 3_600_000;
const PER_MINUTE = "Too many changes in a minute. Wait a minute, then carry on. (assistant_writes_per_minute)";
const PER_HOUR =
  "This account has had 300 changes by assistants in the last hour. Make the rest in the app, or wait. (assistant_changes_per_hour)";
const NO_SUCH_ENTRY = "99999999-9999-4999-8999-999999999999";

await describeWithDb("mcp write brakes", (suite) => {
  const d = daysApi(suite);

  describe("on a frozen clock", () => {
    let server: Awaited<ReturnType<typeof listen>>;
    let resetBrake: () => void;
    const clients: Client[] = [];

    /** A person with two writing keys, each with its client. */
    async function personWithTwoKeys(): Promise<{ first: Writer; one: Client; two: Client }> {
      const first = await writerWithKey(suite, d.api);
      const res = await d
        .api()
        .post("/api/v1/connections")
        .set(first.user.auth)
        .send({ name: "Claude Desktop", access: "read_write", expiresInDays: 7 });
      expect(res.status).toBe(201);
      // A key's expiry is set on the database's clock, years before this suite's. Past both.
      await suite.client.query("UPDATE assistant_connections SET expires_at = '2031-01-01' WHERE user_id = $1", [
        first.user.id,
      ]);
      const one = await connect(server.url, first.key);
      const two = await connect(server.url, res.body.key as string);
      clients.push(one, two);
      return { first, one, two };
    }

    /** A write that changes nothing, so it records nothing: only the per-minute brake counts it. */
    const markNothing = (client: Client) =>
      call(client, "set_entries_status", { requestKey: newRequestKey(), entryIds: [NO_SUCH_ENTRY], status: "eaten" });
    /** A write the app refuses after the brake has counted it. */
    const logMissingFood = (client: Client) =>
      call(client, "log_food", {
        requestKey: newRequestKey(),
        foodId: NO_SUCH_ENTRY,
        amount: { grams: 100 },
        date: "today",
        status: "eaten",
      });
    const logEstimate = (client: Client, requestKey = newRequestKey()) =>
      call(client, "log_estimate", {
        requestKey,
        name: "Lunch",
        figures: { energyKcal: 500, proteinG: 30, carbsG: 50, fatG: 20 },
        date: "today",
        status: "eaten",
      });

    beforeAll(async () => {
      freezeDate(NOW);
      const { writesPerMinute } = await import("../writeBrake.js");
      resetBrake = () => writesPerMinute.reset();
      server = await listen(suite.app);
    });
    beforeEach(() => {
      jest.setSystemTime(NOW);
      resetBrake();
    });
    afterAll(async () => {
      for (const client of clients) await client.close();
      await server?.close();
      jest.useRealTimers();
    });

    describe("30 write calls a minute", () => {
      it("are shared by the person's two keys, count refused calls, and refill a minute after the first", async () => {
        const { one, two } = await personWithTwoKeys();
        for (let i = 0; i < 10; i++) {
          expect((await logMissingFood(i % 2 === 0 ? one : two)).text).toContain("(food_not_found)");
        }
        for (let i = 0; i < 20; i++)
          expect((await markNothing(i % 2 === 0 ? one : two)).data.outcome).toBe("unchanged");

        expect(await markNothing(one)).toMatchObject({ isError: true, text: PER_MINUTE });
        expect(await markNothing(two)).toMatchObject({ isError: true, text: PER_MINUTE });
        jest.setSystemTime(NOW + MINUTE - 1);
        expect(await markNothing(two)).toMatchObject({ isError: true, text: PER_MINUTE });
        jest.setSystemTime(NOW + MINUTE);
        expect((await markNothing(two)).data.outcome).toBe("unchanged");
      });

      it("are counted per person: another person's key still writes", async () => {
        const braked = await personWithTwoKeys();
        const other = await personWithTwoKeys();
        for (let i = 0; i < 30; i++) await markNothing(braked.one);
        expect(await markNothing(braked.two)).toMatchObject({ isError: true, text: PER_MINUTE });
        expect((await markNothing(other.one)).data.outcome).toBe("unchanged");
      });
    });

    describe("300 recorded changes an hour", () => {
      /** `n` record rows for the person under their first key, `ago` milliseconds before NOW. */
      async function placeRecords(w: Writer, n: number, ago: number) {
        await suite.client.query(
          `INSERT INTO assistant_changes (user_id, connection_id, connection_name, action, entity_ids, summary, request_key, request_hash, created_at)
           SELECT $1, $2, 'Claude Code, writing', 'entry.added', ARRAY[gen_random_uuid()], '{}'::jsonb, 'placed_' || gen_random_uuid(), 'h', $3
             FROM generate_series(1, $4) AS i`,
          [w.user.id, w.connectionId, new Date(NOW - ago), n],
        );
      }

      it("refuse the next change from any of the person's keys while 300 are inside the hour, and admit it once they leave", async () => {
        const { first, two } = await personWithTwoKeys();
        await placeRecords(first, 299, HOUR - 1);
        expect((await logEstimate(two)).data.outcome).toBe("created");
        // That change was stamped by the database's clock, years before this one: only the placed rows count.
        await placeRecords(first, 1, HOUR - 1);

        expect(await logEstimate(two)).toMatchObject({ isError: true, text: PER_HOUR });
        jest.setSystemTime(NOW + 1);
        expect((await logEstimate(two)).data.outcome).toBe("created");
      });

      it("still answer a retry of a change that landed, as a replay", async () => {
        const { first, one } = await personWithTwoKeys();
        const requestKey = newRequestKey();
        const logged = await logEstimate(one, requestKey);
        expect(logged.data.outcome).toBe("created");
        await placeRecords(first, 300, MINUTE);

        expect(await logEstimate(one)).toMatchObject({ isError: true, text: PER_HOUR });
        expect((await logEstimate(one, requestKey)).data).toMatchObject({
          outcome: "replayed",
          entry: { id: logged.data.entry.id },
        });
      });

      it("count only the person's own changes", async () => {
        const braked = await personWithTwoKeys();
        const other = await personWithTwoKeys();
        await placeRecords(braked.first, 300, MINUTE);
        expect(await logEstimate(braked.one)).toMatchObject({ isError: true, text: PER_HOUR });
        expect((await logEstimate(other.one)).data.outcome).toBe("created");
      });
    });
  });
});
