import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// The first run on a real, migrated Postgres: `PUT /users/me/first-run`
// stores that the user has passed it, and `GET /targets` answers
// `firstRunDue` only for a user with no change who has not passed it, or
// removed a change.

const ranges = {
  ranges: { energyKcal: { lower: 1800, upper: 2000 }, proteinG: { lower: 120, upper: 160 } },
};

await describeWithDb("firstRun", (suite) => {
  const api = () => request(suite.app);
  const finish = (user: ApiUser) => api().put("/api/v1/users/me/first-run").set(user.auth);
  const due = async (user: ApiUser, date?: string) => {
    const res = await api()
      .get("/api/v1/targets")
      .query(date ? { date } : {})
      .set(user.auth);
    expect(res.status).toBe(200);
    return res.body.firstRunDue as unknown;
  };
  const put = (user: ApiUser, date: string) => api().put(`/api/v1/targets/${date}`).set(user.auth).send(ranges);
  const remove = (user: ApiUser, date: string) => api().delete(`/api/v1/targets/${date}`).set(user.auth);
  const stamps = async (userId: string) =>
    (
      await suite.client.query<{ done: Date | null; updated: Date }>(
        "SELECT first_run_done_at AS done, updated_at AS updated FROM users WHERE id = $1",
        [userId],
      )
    ).rows[0];
  /** Moves the user row's `updated_at` into the past, so a bump shows. */
  const ageRow = (userId: string) =>
    suite.client.query("UPDATE users SET updated_at = '2026-01-01T00:00:00Z' WHERE id = $1", [userId]);

  describe("PUT /users/me/first-run", () => {
    it("refuses an unauthenticated request", async () => {
      expect((await api().put("/api/v1/users/me/first-run")).status).toBe(401);
    });

    it("answers 204 with no body, sets the fact, and bumps updated_at", async () => {
      const user = await signUp(suite.client);
      await ageRow(user.id);
      const res = await finish(user);
      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      const after = await stamps(user.id);
      expect(after.done).toBeInstanceOf(Date);
      expect(after.updated.toISOString()).toBe(after.done!.toISOString());
    });

    it("is idempotent: a second call answers 204 and moves neither stamp", async () => {
      const user = await signUp(suite.client);
      expect((await finish(user)).status).toBe(204);
      await ageRow(user.id);
      const first = await stamps(user.id);
      expect((await finish(user)).status).toBe(204);
      expect(await stamps(user.id)).toEqual(first);
    });

    it("ignores a body", async () => {
      const user = await signUp(suite.client);
      const res = await finish(user).send({ firstRunDoneAt: null, done: false });
      expect(res.status).toBe(204);
      expect((await stamps(user.id)).done).toBeInstanceOf(Date);
    });

    it("answers 404 user_not_found for a deleted account whose token still lives", async () => {
      const user = await signUp(suite.client);
      await suite.client.query("DELETE FROM users WHERE id = $1", [user.id]);
      const res = await finish(user);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("user_not_found");
    });
  });

  describe("firstRunDue", () => {
    it("is true for a new account, on any date", async () => {
      const user = await signUp(suite.client);
      expect(await due(user)).toBe(true);
      expect(await due(user, "2026-11-01")).toBe(true);
    });

    it("is false once the user passes the first run, and stays false", async () => {
      const user = await signUp(suite.client);
      await finish(user);
      expect(await due(user)).toBe(false);
      await finish(user);
      expect(await due(user)).toBe(false);
    });

    it("is false once the user saves targets, on a date before them too", async () => {
      const user = await signUp(suite.client);
      await put(user, "2026-11-18");
      expect(await due(user)).toBe(false);
      expect(await due(user, "2026-11-17")).toBe(false);
      // Saving does not store the fact: a change is reason enough.
      expect((await stamps(user.id)).done).toBeNull();
    });

    it("never turns true after the only change is removed, and the removal bumps updated_at", async () => {
      const user = await signUp(suite.client);
      await put(user, "2026-11-18");
      await ageRow(user.id);
      expect((await remove(user, "2026-11-18")).status).toBe(204);
      const after = await stamps(user.id);
      expect(after.done).toBeInstanceOf(Date);
      expect(after.updated.toISOString()).toBe(after.done!.toISOString());

      const res = await api().get("/api/v1/targets").set(user.auth);
      expect(res.body).toMatchObject({ inForce: null, changes: [], firstRunDue: false });
      // Still false on a later read, and after one more save and removal.
      expect(await due(user)).toBe(false);
      await put(user, "2026-11-20");
      expect((await remove(user, "2026-11-20")).status).toBe(204);
      expect(await due(user)).toBe(false);
    });

    it("is set by a removal of any change, not only the last", async () => {
      const user = await signUp(suite.client);
      await put(user, "2026-11-10");
      await put(user, "2026-11-20");
      await remove(user, "2026-11-10");
      expect((await stamps(user.id)).done).toBeInstanceOf(Date);
      await remove(user, "2026-11-20");
      expect(await due(user)).toBe(false);
    });

    it("keeps the first stamp when a later removal finds it set", async () => {
      const user = await signUp(suite.client);
      await finish(user);
      await ageRow(user.id);
      const first = await stamps(user.id);
      await put(user, "2026-11-18");
      await remove(user, "2026-11-18");
      expect(await stamps(user.id)).toEqual(first);
    });

    it("leaves every day without targets after the only change is removed", async () => {
      const user = await signUp(suite.client);
      await put(user, "2026-11-18");
      await remove(user, "2026-11-18");
      for (const date of ["2026-11-17", "2026-11-18", "2026-12-01"]) {
        const day = await api().get(`/api/v1/days/${date}`).set(user.auth);
        expect(day.status).toBe(200);
        expect(day.body.targets).toBeNull();
        expect([day.body.eaten.energy, day.body.eaten.protein]).toEqual([null, null]);
        expect([day.body.withPlan.energy, day.body.withPlan.protein]).toEqual([null, null]);
      }
      const week = await api().get("/api/v1/days").query({ from: "2026-11-16", to: "2026-11-22" }).set(user.auth);
      expect(week.status).toBe(200);
      expect(week.body.days.map((d: { targets: unknown }) => d.targets)).toEqual(Array(7).fill(null));
    });

    it("belongs to the user alone", async () => {
      const passed = await signUp(suite.client);
      const fresh = await signUp(suite.client);
      await finish(passed);
      expect(await due(passed)).toBe(false);
      expect(await due(fresh)).toBe(true);
    });
  });
});
