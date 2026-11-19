import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { serviceHolder, sqlHolder } from "../../__tests__/support/holder.js";
import { sessionApi } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import type { AssistantActor } from "../../services/writes/changeRecord.js";
import { connect, freezeDate, listen, quietConsole } from "./harness.js";
import {
  call,
  CONNECTION_NAME,
  newRequestKey,
  recordsOf,
  writerWithKey,
  written,
  type Writer,
} from "./writeSupport.js";

// The targets write tools on a real Postgres (design d.4): set_targets and
// remove_targets make the screen's change through its own service, record
// what they replaced or removed with the change's id, and add no rule of
// their own. The races run on the real clock, because the lock wait polls
// it, and name no day: they set targets for `today`.
//
// setTargets is wrapped so a test can hold one call between the assistant's
// before-read and its upsert: the wrapper waits only when a test armed it,
// and then calls the real service. The real module is loaded first, so the
// wrapper and every test hold the real function.

process.env.MCP_WRITES_ENABLED = "true";
quietConsole();
const real = await import("../../services/writes/targets.js");
let armed: { reached: () => void; release: Promise<void> } | null = null;
jest.unstable_mockModule("../../services/writes/targets.js", () => ({
  ...real,
  async setTargets(...args: Parameters<typeof real.setTargets>) {
    const pause = armed;
    armed = null;
    if (pause) {
      pause.reached();
      await pause.release;
    }
    return real.setTargets(...args);
  },
}));

/** Holds the next setTargets call before it writes. `reached` settles once it waits there. */
function holdNextSetTargets() {
  let reached!: () => void;
  let release!: () => void;
  const atPause = new Promise<void>((resolve) => (reached = resolve));
  armed = { reached, release: new Promise<void>((resolve) => (release = resolve)) };
  return { atPause, release };
}

const NOW = "2026-11-19T10:00:00.000Z"; // noon in Helsinki
const TODAY = "2026-11-19";
const LATER = "2026-12-01";
const range = (energy: [number, number], protein: [number, number]) => ({
  energyKcal: { lower: energy[0], upper: energy[1] },
  proteinG: { lower: protein[0], upper: protein[1] },
});
const A = range([1800, 2200], [120, 160]);
const B = range([2000, 2400], [140, 180]);
const C = range([1500, 1700], [100, 110]);

await describeWithDb("mcp targets writes", (suite) => {
  const d = daysApi(suite);
  const sessions = sessionApi(suite);
  const api = d.api;
  let server: Awaited<ReturnType<typeof listen>>;
  let resetBrake: () => void;

  beforeAll(async () => {
    const { writesPerMinute } = await import("../writeBrake.js");
    resetBrake = () => writesPerMinute.reset();
    server = await listen(suite.app);
  });
  beforeEach(() => resetBrake());
  afterAll(async () => {
    await server?.close();
  });

  const changeIdOn = async (userId: string, date: string) =>
    (
      await suite.client.query("SELECT id FROM target_changes WHERE user_id = $1 AND effective_from = $2", [
        userId,
        date,
      ])
    ).rows[0]?.id as string | undefined;

  describe("on a frozen clock", () => {
    let w: Writer;
    let client: Client;

    beforeAll(async () => {
      freezeDate(NOW);
      w = await writerWithKey(suite, api);
      client = await connect(server.url, w.key);
    });
    afterAll(async () => {
      await client?.close();
      jest.useRealTimers();
    });

    const records = () => recordsOf(suite, w.user.id);
    /** GET /targets as an assistant reads it, without the screen's routing fact. */
    const withoutRouting = ({ firstRunDue: _routing, ...rest }: Record<string, unknown>) => rest;
    const restTargets = async () => withoutRouting((await api().get(d.v1("/targets")).set(w.user.auth)).body);

    it("sets targets from today when effectiveFrom is left out, and records the change by its id", async () => {
      const requestKey = newRequestKey();
      const data = await written(client, "set_targets", { requestKey, ranges: A });
      expect(data).toMatchObject({ outcome: "created", change: { effectiveFrom: TODAY, ranges: A } });
      expect(data.targets).toEqual(await restTargets());
      expect(data.targets.inForce).toEqual(data.change);
      expect(await written(client, "get_targets", {})).toEqual(data.targets);
      expect((await records()).at(-1)).toEqual({
        action: "targets.set",
        entityIds: [await changeIdOn(w.user.id, TODAY)],
        requestKey,
        connectionId: w.connectionId,
        connectionName: CONNECTION_NAME,
        summary: { entity: "targets", effectiveFrom: TODAY, before: null, after: A },
      });
    });

    it("replaces the change on the same date and records what it replaced, and the same numbers record nothing", async () => {
      const replaced = await written(client, "set_targets", {
        requestKey: newRequestKey(),
        effectiveFrom: TODAY,
        ranges: B,
      });
      expect(replaced.outcome).toBe("changed");
      expect((await records()).at(-1)?.summary).toEqual({
        entity: "targets",
        effectiveFrom: TODAY,
        before: A,
        after: B,
      });
      const rows = (await records()).length;
      const same = await written(client, "set_targets", {
        requestKey: newRequestKey(),
        effectiveFrom: "today",
        ranges: B,
      });
      expect(same).toMatchObject({ outcome: "unchanged", note: "Nothing changed. Nothing was recorded." });
      expect(await records()).toHaveLength(rows);
    });

    it("takes the person's numbers as given, and refuses only what the screen refuses", async () => {
      const odd = range([1, 99_999.9], [0.1, 9_999.9]);
      const data = await written(client, "set_targets", {
        requestKey: newRequestKey(),
        effectiveFrom: LATER,
        ranges: odd,
      });
      expect(data.change).toMatchObject({ effectiveFrom: LATER, ranges: odd });
      const rows = (await records()).length;
      const refused = await call(client, "set_targets", {
        requestKey: newRequestKey(),
        effectiveFrom: LATER,
        ranges: range([2000, 1000], [100, 120]),
      });
      expect(refused).toMatchObject({ isError: true, text: expect.stringContaining("target_lower_above_upper") });
      expect(
        (
          await api()
            .put(d.v1(`/targets/${LATER}`))
            .set(w.user.auth)
            .send({ ranges: range([2000, 1000], [100, 120]) })
        ).body.code,
      ).toBe("target_lower_above_upper");
      expect(await records()).toHaveLength(rows);
    });

    it("removes a change, records the ranges it removed and the change's id, and replays the targets as they are now", async () => {
      const id = await changeIdOn(w.user.id, LATER);
      const requestKey = newRequestKey();
      const data = await written(client, "remove_targets", { requestKey, effectiveFrom: LATER });
      expect(data).toMatchObject({ outcome: "deleted", note: "Recorded in the app under this connection's name." });
      expect(data.targets).toEqual(await restTargets());
      expect(data.targets.changes.map((c: { effectiveFrom: string }) => c.effectiveFrom)).not.toContain(LATER);
      expect((await records()).at(-1)).toMatchObject({
        action: "targets.removed",
        entityIds: [id],
        summary: { entity: "targets", effectiveFrom: LATER, before: range([1, 99_999.9], [0.1, 9_999.9]), after: null },
      });

      await d.targets(w.user, LATER, [1900, 2100], [130, 150]);
      const retried = await written(client, "remove_targets", { requestKey, effectiveFrom: LATER });
      expect(retried).toMatchObject({ outcome: "replayed", targets: await restTargets() });
      expect(await changeIdOn(w.user.id, LATER)).toBeDefined();
    });

    it("refuses a date with no change, as the screen does, and records nothing", async () => {
      const rows = (await records()).length;
      const refused = await call(client, "remove_targets", {
        requestKey: newRequestKey(),
        effectiveFrom: "2026-10-01",
      });
      expect(refused).toMatchObject({ isError: true, text: expect.stringContaining("(target_change_not_found)") });
      expect(await records()).toHaveLength(rows);
    });

    it("records nothing for targets set and removed on screen", async () => {
      const rows = (await records()).length;
      await d.targets(w.user, "2026-12-24", [1000, 1200], [80, 90]);
      expect((await api().delete(d.v1("/targets/2026-12-24")).set(w.user.auth)).status).toBe(204);
      expect(await records()).toHaveLength(rows);
    });
  });

  describe("at once, on the real clock", () => {
    let w: Writer;
    let client: Client;

    beforeAll(async () => {
      w = await writerWithKey(suite, api);
      client = await connect(server.url, w.key);
    });
    afterAll(async () => {
      await client?.close();
    });

    const records = () => recordsOf(suite, w.user.id);
    const put = (ranges: object) =>
      api()
        .put(d.v1(`/targets/${helsinkiToday()}`))
        .set(w.user.auth)
        .send({ ranges });

    it("makes a screen save on the same date wait, so the record's before is what the assistant replaced", async () => {
      expect((await put(A)).status).toBe(200);
      const hold = holdNextSetTargets();
      const assistant = call(client, "set_targets", { requestKey: newRequestKey(), ranges: B });
      await hold.atPause;
      // Supertest sends on then(), so start it now.
      const screen = put(C).then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      hold.release();
      const [answer, saved] = await Promise.all([assistant, screen]);

      expect(waited).toBe(1);
      expect(answer.data).toMatchObject({ outcome: "changed", change: { ranges: B } });
      expect((await records()).at(-1)?.summary).toMatchObject({ before: A, after: B });
      // The screen's save waited for the assistant's, and landed after it.
      expect(saved.status).toBe(200);
      expect((await api().get(d.v1("/targets")).set(w.user.auth)).body.inForce.ranges).toEqual(C);
    });

    it("lets two set_targets at once both finish, the second replacing the first", async () => {
      const hold = holdNextSetTargets();
      const first = call(client, "set_targets", { requestKey: newRequestKey(), ranges: A });
      await hold.atPause;
      const second = call(client, "set_targets", { requestKey: newRequestKey(), ranges: B });
      const waited = await sessions.queuedOnLock(1);
      hold.release();
      const answers = await Promise.all([first, second]);

      expect(waited).toBe(1);
      expect(answers.map((a) => a.isError)).toEqual([false, false]);
      expect(answers.map((a) => a.data.outcome)).toEqual(["changed", "changed"]);
      expect((await records()).slice(-2).map((r) => r.summary)).toMatchObject([
        { before: C, after: A },
        { before: A, after: B },
      ]);
    });

    it("answers the second of two calls with one key as the replay of the first", async () => {
      const { recordedSetTargets } = await import("../../services/writes/recorded/targets.js");
      const { requestHashOf } = await import("../../services/writes/changeRecord.js");
      const args = { requestKey: newRequestKey(), ranges: C };
      const via: AssistantActor = {
        connectionId: w.connectionId,
        connectionName: CONNECTION_NAME,
        requestKey: args.requestKey,
        requestHash: requestHashOf("set_targets", args),
      };
      const first = await serviceHolder(await d.contextAt(w.user.id), (c) =>
        recordedSetTargets(c, via, { effectiveFrom: c.today, ranges: C }),
      );
      const second = call(client, "set_targets", args);
      const waited = await sessions.queuedOnLock(1);
      await first.commit();
      const answer = await second;

      expect(waited).toBe(1);
      expect(answer.data).toMatchObject({ outcome: "replayed", recorded: { before: B, after: C } });
      expect((await records()).filter((r) => r.requestKey === args.requestKey)).toHaveLength(1);
    });

    it("makes a screen save wait for a held remove_targets on the same date, so the record's before is what was removed", async () => {
      expect((await put(A)).status).toBe(200);
      const { recordedRemoveTargets } = await import("../../services/writes/recorded/targets.js");
      const { requestHashOf } = await import("../../services/writes/changeRecord.js");
      const args = { requestKey: newRequestKey(), effectiveFrom: helsinkiToday() };
      const via: AssistantActor = {
        connectionId: w.connectionId,
        connectionName: CONNECTION_NAME,
        requestKey: args.requestKey,
        requestHash: requestHashOf("remove_targets", args),
      };
      const removal = await serviceHolder(await d.contextAt(w.user.id), (c) => recordedRemoveTargets(c, via, c.today));
      const screen = put(B).then((res) => res);
      const waited = await sessions.queuedOnLock(1);
      await removal.commit();
      const saved = await screen;

      expect(waited).toBe(1);
      expect(removal.value.outcome).toBe("deleted");
      expect((await records()).at(-1)).toMatchObject({
        action: "targets.removed",
        summary: { effectiveFrom: helsinkiToday(), before: A, after: null },
      });
      // The screen's save waited for the removal, and landed after it as a new change.
      expect(saved.status).toBe(200);
      expect((await api().get(d.v1("/targets")).set(w.user.auth)).body.inForce).toMatchObject({
        effectiveFrom: helsinkiToday(),
        ranges: B,
      });
    });

    it("makes remove_targets wait for a held screen save on the same date, and records the values that save left", async () => {
      const today = helsinkiToday();
      const id = await changeIdOn(w.user.id, today);
      // The screen's save as setTargets makes it: the user's row FOR KEY SHARE, then the change.
      const save = await sqlHolder(suite.url);
      await save.query("SELECT id FROM users WHERE id = $1 FOR KEY SHARE", [w.user.id]);
      await save.query(
        `UPDATE target_changes SET energy_kcal_lower = $3, energy_kcal_upper = $4, protein_g_lower = $5,
           protein_g_upper = $6, updated_at = now() WHERE user_id = $1 AND effective_from = $2`,
        [w.user.id, today, C.energyKcal.lower, C.energyKcal.upper, C.proteinG.lower, C.proteinG.upper],
      );
      const assistant = call(client, "remove_targets", { requestKey: newRequestKey(), effectiveFrom: today });
      const waited = await sessions.queuedOnLock(1);
      await save.commit();
      const answer = await assistant;

      expect(waited).toBe(1);
      expect(answer.isError).toBe(false);
      expect(answer.data.outcome).toBe("deleted");
      expect((await records()).at(-1)).toMatchObject({
        action: "targets.removed",
        entityIds: [id],
        summary: { effectiveFrom: today, before: C, after: null },
      });
      expect(await changeIdOn(w.user.id, today)).toBeUndefined();
    });
  });
});
