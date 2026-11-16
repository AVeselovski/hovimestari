import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import type { Response } from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { sqlHolder } from "../../__tests__/support/holder.js";
import { sessionApi } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Writes that race an account deletion. A connection of its own deletes the
// user and holds the deletion open. The write goes through the API, passes
// authentication (the deletion is not committed yet), and queues on the
// user's row, which pg_locks shows. Once the deletion commits, the write
// finds no user and answers 404 `user_not_found`, as a request with a
// deleted user's live access token does, never a foreign key failure as 500.

await describeWithDb("deletionRaces", (suite) => {
  const d = daysApi(suite);
  const sessions = sessionApi(suite);
  const figures = { energyKcal: 500, proteinG: 30, carbsG: 50, fatG: 20 };
  const mealBody = () => ({ id: randomUUID(), name: "Lounas", source: null, figures });

  /** Sends `write` while a deletion of `user` is held open, then commits the deletion. */
  async function racingDeletion(user: ApiUser, write: () => Promise<Response>) {
    const deletion = await sqlHolder(suite.url);
    await deletion.query("DELETE FROM users WHERE id = $1", [user.id]);
    const writing = write().then((res) => res);
    const waited = await sessions.queuedOnLock(1);
    await deletion.commit();
    return { waited, res: await writing };
  }

  const expectUserGone = ({ waited, res }: { waited: number; res: Response }) => {
    expect(waited).toBe(1);
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 404, code: "user_not_found" });
  };

  it("an estimate add answers user_not_found", async () => {
    const user = await signUp(suite.client);
    expectUserGone(await racingDeletion(user, () => d.add(user, d.estimateBody(figures))));
  });

  it("a Fineli food add answers user_not_found", async () => {
    const user = await signUp(suite.client);
    const food = await d.fineliFood();
    expectUserGone(await racingDeletion(user, () => d.add(user, d.foodBody(food.id, { grams: 150 }))));
  });

  it("a saved meal create answers user_not_found", async () => {
    const user = await signUp(suite.client);
    expectUserGone(
      await racingDeletion(user, () => d.api().post(d.v1("/saved-meals")).set(user.auth).send(mealBody())),
    );
  });

  it("a save and log answers user_not_found", async () => {
    const user = await signUp(suite.client);
    const entry = { id: randomUUID(), date: "2026-01-05", status: "planned", count: 1 };
    expectUserGone(
      await racingDeletion(user, () =>
        d.api().post(d.v1("/saved-meals/log")).set(user.auth).send({ meal: mealBody(), entry }),
      ),
    );
  });

  describe("food, target and settings writes", () => {
    const per100g = { energyKcal: 100, proteinG: 10, carbsG: 0, fatG: 0 };

    it("an own food create answers user_not_found", async () => {
      const user = await signUp(suite.client);
      const body = { name: "Oma ruoka", per100g, barcode: null };
      expectUserGone(await racingDeletion(user, () => d.api().post(d.v1("/foods")).set(user.auth).send(body)));
    });

    it("a portion add on a Fineli food answers user_not_found", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      expectUserGone(
        await racingDeletion(user, () =>
          d
            .api()
            .post(d.v1(`/foods/${food.id}/portions`))
            .set(user.auth)
            .send({ name: "tub", grams: 150 }),
        ),
      );
    });

    it("marking a Fineli food a favourite answers user_not_found", async () => {
      const user = await signUp(suite.client);
      const food = await d.fineliFood();
      expectUserGone(
        await racingDeletion(user, () =>
          d
            .api()
            .put(d.v1(`/foods/${food.id}/favourite`))
            .set(user.auth),
        ),
      );
    });

    it("saving targets answers user_not_found", async () => {
      const user = await signUp(suite.client);
      const ranges = { energyKcal: { lower: 1800, upper: 2200 }, proteinG: { lower: 120, upper: 160 } };
      expectUserGone(
        await racingDeletion(user, () => d.api().put(d.v1("/targets/2026-01-05")).set(user.auth).send({ ranges })),
      );
    });

    it("changing settings answers user_not_found", async () => {
      const user = await signUp(suite.client);
      expectUserGone(
        await racingDeletion(user, () =>
          d.api().patch(d.v1("/users/me/settings")).set(user.auth).send({ timeZone: "Europe/Stockholm" }),
        ),
      );
    });
  });

  describe("writes that take no user lock", () => {
    it("archiving a saved meal waits on the meal's row and answers saved_meal_not_found", async () => {
      const user = await signUp(suite.client);
      const meal = await d.meal(user, figures);
      const { waited, res } = await racingDeletion(user, () =>
        d
          .api()
          .put(d.v1(`/saved-meals/${meal}/archived`))
          .set(user.auth),
      );
      expect(waited).toBe(1);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 404, code: "saved_meal_not_found" });
    });
  });
});
