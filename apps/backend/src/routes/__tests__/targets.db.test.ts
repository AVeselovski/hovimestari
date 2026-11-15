import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { Request } from "express";
import request from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Targets on a real, migrated Postgres: the in-force rule, the overwrite on a
// repeated date, the last-change guard under concurrency, and "today" in the
// user's stored time zone.

const ranges = (energy: [number, number], protein: [number, number] = [100, 150]) => ({
  ranges: {
    energyKcal: { lower: energy[0], upper: energy[1] },
    proteinG: { lower: protein[0], upper: protein[1] },
  },
});

await describeWithDb("targets", (suite) => {
  const api = () => request(suite.app);
  const put = (user: ApiUser, date: string, body: object) =>
    api().put(`/api/v1/targets/${date}`).set(user.auth).send(body);
  const get = (user: ApiUser, date?: string) =>
    api()
      .get("/api/v1/targets")
      .query(date ? { date } : {})
      .set(user.auth);
  const remove = (user: ApiUser, date: string) => api().delete(`/api/v1/targets/${date}`).set(user.auth);
  const rowCount = async (userId: string) =>
    (await suite.client.query("SELECT count(*)::int AS n FROM target_changes WHERE user_id = $1", [userId])).rows[0]
      .n as number;

  describe("validation", () => {
    it.each([
      [ranges([2200, 1800]), "target_lower_above_upper"],
      [ranges([0, 1800]), "target_not_positive"],
      [ranges([-1, 1800]), "target_not_positive"],
      [ranges([1800.25, 2000]), "target_value_invalid"],
      [ranges([100_000, 100_000]), "target_value_invalid"],
      [ranges([0.00000001, 1800]), "target_value_invalid"],
      [ranges([1800, 2000], [0.00000001, 150]), "target_value_invalid"],
      [{ ranges: { energyKcal: { lower: 1800, upper: 2000 } } }, "invalid_request"],
    ])("refuses %j with %p", async (body, code) => {
      const user = await signUp(suite.client);
      const res = await put(user, "2026-11-15", body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
      expect(await rowCount(user.id)).toBe(0);
    });

    it("accepts equal bounds and one decimal", async () => {
      const user = await signUp(suite.client);
      const res = await put(user, "2026-11-15", ranges([2000, 2000], [142.5, 142.5]));
      expect(res.status).toBe(200);
      expect(res.body.ranges).toEqual({
        energyKcal: { lower: 2000, upper: 2000 },
        proteinG: { lower: 142.5, upper: 142.5 },
      });
    });

    it.each(["2026-02-30", "not-a-date", "0000-01-01"])("refuses the date %p with invalid_date", async (date) => {
      const user = await signUp(suite.client);
      const res = await put(user, date, ranges([1800, 2000]));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("invalid_date");
      expect((await get(user, date)).body.code).toBe("invalid_date");
    });

    it("refuses an unauthenticated request", async () => {
      expect((await api().get("/api/v1/targets")).status).toBe(401);
    });
  });

  it("overwrites a change on a repeated date, leaving one row", async () => {
    const user = await signUp(suite.client);
    expect((await put(user, "2026-11-15", ranges([1800, 2000]))).status).toBe(200);
    const again = await put(user, "2026-11-15", ranges([1900, 2100]));
    expect(again.status).toBe(200);
    expect(again.body.ranges.energyKcal).toEqual({ lower: 1900, upper: 2100 });
    expect(await rowCount(user.id)).toBe(1);
  });

  it("answers no targets, and no number, for a user who has none", async () => {
    const user = await signUp(suite.client);
    const res = await get(user, "2026-11-15");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: "2026-11-15", inForce: null, changes: [] });
    // Every field but the two dates: no number may appear in it.
    const rest = { ...(res.body as Record<string, unknown>), date: undefined, today: undefined };
    expect(JSON.stringify(rest)).not.toMatch(/[0-9]/);
  });

  describe("the targets in force on a date", () => {
    it("is the latest change on or before the date, and the first change before any", async () => {
      const user = await signUp(suite.client);
      await put(user, "2026-11-10", ranges([1800, 2000]));
      await put(user, "2026-11-20", ranges([1500, 1700]));

      const on = async (date: string) => (await get(user, date)).body.inForce.effectiveFrom as string;
      expect(await on("2026-11-01")).toBe("2026-11-10");
      expect(await on("2026-11-10")).toBe("2026-11-10");
      expect(await on("2026-11-19")).toBe("2026-11-10");
      expect(await on("2026-11-20")).toBe("2026-11-20");
      expect(await on("2027-01-01")).toBe("2026-11-20");

      const all = (await get(user, "2026-11-19")).body;
      expect(all.changes.map((c: { effectiveFrom: string }) => c.effectiveFrom)).toEqual(["2026-11-10", "2026-11-20"]);
      expect(all.inForce.ranges.energyKcal).toEqual({ lower: 1800, upper: 2000 });
    });

    it("never changes for a day before a new change's date", async () => {
      const user = await signUp(suite.client);
      await put(user, "2026-11-10", ranges([1800, 2000]));
      const before = (await get(user, "2026-11-14")).body.inForce;
      await put(user, "2026-11-15", ranges([1500, 1700]));
      expect((await get(user, "2026-11-14")).body.inForce).toEqual(before);
    });
  });

  describe("removing a change", () => {
    it("removes a change, and the days it covered fall to the earlier one", async () => {
      const user = await signUp(suite.client);
      await put(user, "2026-11-10", ranges([1800, 2000]));
      await put(user, "2026-11-20", ranges([1500, 1700]));
      expect((await remove(user, "2026-11-20")).status).toBe(204);
      expect((await get(user, "2026-11-25")).body.inForce.effectiveFrom).toBe("2026-11-10");
    });

    it("refuses to remove the only change with 409", async () => {
      const user = await signUp(suite.client);
      await put(user, "2026-11-10", ranges([1800, 2000]));
      const res = await remove(user, "2026-11-10");
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("targets_last_change");
      expect(await rowCount(user.id)).toBe(1);
    });

    it("answers 404 for a date with no change, and for another user's date", async () => {
      const owner = await signUp(suite.client);
      const other = await signUp(suite.client);
      await put(owner, "2026-11-10", ranges([1800, 2000]));
      await put(owner, "2026-11-20", ranges([1500, 1700]));
      await put(other, "2026-11-01", ranges([1800, 2000]));
      await put(other, "2026-11-02", ranges([1800, 2000]));

      const missing = await remove(owner, "2026-12-01");
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe("target_change_not_found");
      expect((await remove(other, "2026-11-20")).status).toBe(404);
      expect(await rowCount(owner.id)).toBe(2);
    });

    it("lets two concurrent removals leave one change: one 204 and one 409", async () => {
      const user = await signUp(suite.client);
      await put(user, "2026-11-10", ranges([1800, 2000]));
      await put(user, "2026-11-20", ranges([1500, 1700]));

      const results = await Promise.all([remove(user, "2026-11-10"), remove(user, "2026-11-20")]);

      expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
      expect(await rowCount(user.id)).toBe(1);
    });
  });

  describe("today", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    /** The context `contextFor` builds for `userId` at `instant`, with only Date faked. */
    async function contextAt(userId: string, instant: string) {
      const { contextFor } = await import("../../lib/requestContext.js");
      jest.useFakeTimers({
        now: new Date(instant),
        doNotFake: [
          "hrtime",
          "nextTick",
          "performance",
          "queueMicrotask",
          "requestAnimationFrame",
          "cancelAnimationFrame",
          "requestIdleCallback",
          "cancelIdleCallback",
          "setImmediate",
          "clearImmediate",
          "setInterval",
          "clearInterval",
          "setTimeout",
          "clearTimeout",
        ],
      });
      return contextFor({ user: { id: userId } } as Request);
    }

    it("reads today in the user's stored zone", async () => {
      const user = await signUp(suite.client);
      await suite.client.query("UPDATE users SET time_zone = 'America/New_York' WHERE id = $1", [user.id]);
      // 02:00 UTC on the 15th is still the 14th in New York, and already the 15th in Helsinki.
      const ctx = await contextAt(user.id, "2026-11-15T02:00:00Z");
      expect(ctx).toMatchObject({ timeZone: "America/New_York", today: "2026-11-14" });
    });

    it("reads today in Helsinki for a stored zone the runtime does not know", async () => {
      const user = await signUp(suite.client);
      await suite.client.query("UPDATE users SET time_zone = 'Mars/Olympus' WHERE id = $1", [user.id]);
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const ctx = await contextAt(user.id, "2026-11-14T22:30:00Z");
      warn.mockRestore();
      expect(ctx).toMatchObject({ timeZone: "Europe/Helsinki", today: "2026-11-15" });
    });

    it("answers today and the targets in force on it in the user's stored zone when no date is given", async () => {
      const user = await signUp(suite.client);
      await suite.client.query("UPDATE users SET time_zone = 'Pacific/Kiritimati' WHERE id = $1", [user.id]);
      await put(user, "2020-01-01", ranges([1800, 2000]));

      const kiritimati = () =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati", dateStyle: "short" }).format(new Date());
      const before = kiritimati();
      const res = await get(user);
      const after = kiritimati();

      expect(res.status).toBe(200);
      expect([before, after]).toContain(res.body.today);
      expect(res.body.date).toBe(res.body.today);
      expect(res.body.inForce.effectiveFrom).toBe("2020-01-01");
    });

    it("falls back to Helsinki for a stored zone the runtime does not know", async () => {
      const user = await signUp(suite.client);
      await suite.client.query("UPDATE users SET time_zone = 'Mars/Olympus' WHERE id = $1", [user.id]);
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const helsinki = () =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki", dateStyle: "short" }).format(new Date());
      const before = helsinki();
      const res = await get(user);
      expect(res.status).toBe(200);
      warn.mockRestore();
      expect([before, helsinki()]).toContain(res.body.today);
    });
  });
});
