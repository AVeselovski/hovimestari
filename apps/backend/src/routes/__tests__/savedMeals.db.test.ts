import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { addDays, daysApi, helsinkiToday } from "../../__tests__/support/daysApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Saved meals, recent items and last amounts on a real Postgres.

const figures = (energyKcal: number, proteinG = 40) => ({ energyKcal, proteinG, carbsG: 60, fatG: 20 });

await describeWithDb("savedMeals", (suite) => {
  const d = daysApi(suite);
  const today = () => helsinkiToday();
  const create = (user: ApiUser, body: object) => d.api().post(d.v1("/saved-meals")).set(user.auth).send(body);
  const list = (user: ApiUser, archived?: string) =>
    d
      .api()
      .get(d.v1("/saved-meals"))
      .query(archived ? { archived } : {})
      .set(user.auth);
  const archive = (user: ApiUser, id: string, on: boolean) =>
    (on ? d.api().put(d.v1(`/saved-meals/${id}/archived`)) : d.api().delete(d.v1(`/saved-meals/${id}/archived`))).set(
      user.auth,
    );
  const recents = (user: ApiUser, limit?: number) =>
    d
      .api()
      .get(d.v1("/log/recents"))
      .query(limit ? { limit } : {})
      .set(user.auth);

  describe("a saved meal", () => {
    it("is created with a trimmed source, replayed with 200, and another user's id answers 409", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      const body = { id: randomUUID(), name: " Lohikeitto ", source: "  Foodie  ", figures: figures(600) };
      const first = await create(user, body);
      expect(first.status).toBe(201);
      expect(first.body).toEqual({
        id: body.id,
        name: "Lohikeitto",
        source: "Foodie",
        figures: figures(600),
        archived: false,
        lastCount: null,
      });
      expect((await create(user, { ...body, name: "Other" })).status).toBe(200);
      const taken = await create(other, body);
      expect([taken.status, taken.body.code]).toEqual([409, "saved_meal_id_taken"]);
      expect((await create(user, { ...body, id: randomUUID(), source: "   " })).body.source).toBeNull();
    });

    it.each([
      [{ source: "x".repeat(41) }, "meal_source_too_long"],
      [{ name: "" }, "name_required"],
      [{ figures: { energyKcal: 600, proteinG: 40, carbsG: 60 } }, "figure_required"],
      [{ figures: { ...figures(600), fatG: 20.25 } }, "figure_invalid"],
      [{ id: "not-a-uuid" }, "invalid_request"],
    ])("refuses %j with %p", async (overrides, code) => {
      const user = await signUp(suite.client);
      const res = await create(user, {
        id: randomUUID(),
        name: "Lounas",
        source: null,
        figures: figures(600),
        ...overrides,
      });
      expect([res.status, res.body.code]).toEqual([400, code]);
    });

    it("lists active meals in Finnish alphabetical order, and archived ones apart", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      for (const name of ["Ärtsoppa", "Zucchinikeitto", "Broileri", "Arkistoitu"]) await d.meal(user, figures(1), name);
      await d.meal(other, figures(1), "Not mine");
      const archived = (await list(user)).body.meals.find((m: { name: string }) => m.name === "Arkistoitu").id;
      expect((await archive(user, archived, true)).status).toBe(204);

      expect((await list(user)).body.meals.map((m: { name: string }) => m.name)).toEqual([
        "Broileri",
        "Zucchinikeitto",
        "Ärtsoppa",
      ]);
      const archivedList = (await list(user, "true")).body.meals;
      expect(archivedList).toEqual([expect.objectContaining({ id: archived, archived: true })]);
    });

    it("archives idempotently, keeping the first time, restores, and answers 404 for another user's", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      const meal = await d.meal(user, figures(600));
      const archivedAt = async () =>
        (await suite.client.query("SELECT archived_at FROM saved_meals WHERE id = $1", [meal])).rows[0].archived_at;
      await archive(user, meal, true);
      const first = await archivedAt();
      expect((await archive(user, meal, true)).status).toBe(204);
      expect(await archivedAt()).toEqual(first);
      expect((await archive(user, meal, false)).status).toBe(204);
      expect(await archivedAt()).toBeNull();
      expect((await archive(other, meal, true)).status).toBe(404);
      expect(
        (
          await d
            .api()
            .get(d.v1(`/saved-meals/${meal}`))
            .set(other.auth)
        ).status,
      ).toBe(404);
      expect(
        (
          await d
            .api()
            .delete(d.v1(`/saved-meals/${meal}`))
            .set(other.auth)
        ).status,
      ).toBe(404);
    });

    it("logs Artur's snack: 2.5 meals of 60 kcal and 8 g give 150 kcal and 20.0 g", async () => {
      const user = await signUp(suite.client);
      const snack = await d.meal(user, { energyKcal: 60, proteinG: 8, carbsG: 4.2, fatG: 1.5 }, "Välipala");
      const entry = await d.added(user, d.mealBody(snack, 2.5));
      expect(entry.figures).toEqual({ energyKcal: 150, proteinG: 20, carbsG: 10.5, fatG: 3.8 });
      expect(entry.figures.energyKcal).not.toBe(60);
      expect(entry.figures.proteinG).not.toBe(8);
      expect(entry.figures.energyKcal).not.toBe(2.5);
      const day = (await d.day(user, today())).body;
      expect(day.eaten.figures).toEqual(entry.figures);
    });

    it("logs an archived meal, and remembers the count of its latest eaten entry", async () => {
      const user = await signUp(suite.client);
      const meal = await d.meal(user, figures(600));
      await archive(user, meal, true);
      await d.added(user, d.mealBody(meal, 1.5));
      await d.added(user, d.mealBody(meal, 3, { status: "planned" }));
      const res = await d
        .api()
        .get(d.v1(`/saved-meals/${meal}`))
        .set(user.auth);
      expect(res.body).toMatchObject({ archived: true, lastCount: 1.5 });
    });
  });

  describe("recent items", () => {
    it("are eaten foods and meals, each once, newest first, with the latest amount", async () => {
      const user = await signUp(suite.client);
      const quark = await d.fineliFood();
      const shake = await d.ownFood(user, { energyKcal: 100, proteinG: 20, carbsG: 0, fatG: 0 }, "Pirtelö");
      const meal = await d.meal(user, figures(600), "Lounas", "Foodie");
      await d.added(user, d.foodBody(quark.id, { grams: 150 }));
      await d.added(user, d.mealBody(meal, 1));
      await d.added(user, d.foodBody(shake, { grams: 330 }));
      await d.added(user, d.foodBody(quark.id, { portionId: quark.portionId, count: 1.5 }));
      await d.added(user, d.foodBody(shake, { grams: 500 }, { status: "planned" })); // planned: not recent
      await d.added(user, d.estimateBody(figures(900))); // an estimate is on no list

      const res = await recents(user);
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([
        {
          kind: "food",
          food: expect.objectContaining({ id: quark.id }),
          last: { grams: 300, portion: { id: quark.portionId, unit: "PORTM", name: null, count: 1.5 } },
        },
        {
          kind: "food",
          food: expect.objectContaining({ id: shake, name: "Pirtelö" }),
          last: { grams: 330, portion: null },
        },
        {
          kind: "saved_meal",
          meal: expect.objectContaining({ id: meal, source: "Foodie", lastCount: 1 }),
          last: { count: 1 },
        },
      ]);
      expect((await recents(user, 1)).body.items).toHaveLength(1);
    });

    it("leave out an archived or deleted meal and a deleted food, keep a retired food, and null a removed portion", async () => {
      const user = await signUp(suite.client);
      const retired = await d.fineliFood();
      const gone = await d.ownFood(user, { energyKcal: 100, proteinG: 20, carbsG: 0, fatG: 0 });
      const archived = await d.meal(user, figures(600), "Archived");
      const deleted = await d.meal(user, figures(600), "Deleted");
      await d.added(user, d.foodBody(retired.id, { portionId: retired.portionId, count: 1 }));
      await d.added(user, d.foodBody(gone, { grams: 100 }));
      await d.added(user, d.mealBody(archived, 1));
      await d.added(user, d.mealBody(deleted, 1));
      await archive(user, archived, true);
      await d
        .api()
        .delete(d.v1(`/saved-meals/${deleted}`))
        .set(user.auth);
      await d
        .api()
        .delete(d.v1(`/foods/${gone}`))
        .set(user.auth);
      await suite.client.query("UPDATE foods SET retired_at = now() WHERE id = $1", [retired.id]);
      await suite.client.query("DELETE FROM food_portions WHERE id = $1", [retired.portionId]);

      const items = (await recents(user)).body.items;
      expect(items).toEqual([
        {
          kind: "food",
          food: expect.objectContaining({ id: retired.id, retired: true }),
          last: { grams: 200, portion: { id: null, unit: "PORTM", name: null, count: 1 } },
        },
      ]);
    });

    it("break a tie in when they were eaten by the order added, and spend no place on a hidden food or a repeat", async () => {
      const user = await signUp(suite.client);
      const [a, b, c] = [await d.fineliFood(), await d.fineliFood(), await d.fineliFood()];
      const planned = [];
      for (const food of [a, b, c])
        planned.push(await d.added(user, d.foodBody(food.id, { grams: 100 }, { status: "planned" })));
      expect(
        (
          await d.setStatus(
            user,
            planned.map((e) => e.id),
            "eaten",
          )
        ).status,
      ).toBe(200); // one instant for all three
      const hidden = await d.ownFood(user, { energyKcal: 100, proteinG: 20, carbsG: 0, fatG: 0 });
      await d.added(user, d.foodBody(hidden, { grams: 100 }));
      await d.added(user, d.foodBody(hidden, { grams: 200 }));
      await d
        .api()
        .delete(d.v1(`/foods/${hidden}`))
        .set(user.auth);

      const ids = async (limit: number) =>
        (await recents(user, limit)).body.items.map((i: { food: { id: string } }) => i.food.id);
      expect(await ids(2)).toEqual([c.id, b.id]);
      expect(await ids(30)).toEqual([c.id, b.id, a.id]);

      await d.added(user, d.foodBody(a.id, { grams: 50 }));
      await d.added(user, d.foodBody(c.id, { grams: 70 }));
      await d.added(user, d.foodBody(a.id, { grams: 60 }));
      expect(await ids(2)).toEqual([a.id, c.id]);
      expect((await recents(user, 3)).body.items.map((i: { last: { grams: number } }) => i.last.grams)).toEqual([
        60, 70, 100,
      ]);
    });

    it("are another user's never, and limited to 1 to 30", async () => {
      const user = await signUp(suite.client);
      const other = await signUp(suite.client);
      const food = await d.fineliFood();
      await d.added(other, d.foodBody(food.id, { grams: 100 }));
      expect((await recents(user)).body.items).toEqual([]);
      for (const limit of ["0", "31", "x"]) {
        const res = await d.api().get(d.v1("/log/recents")).query({ limit }).set(user.auth);
        expect([res.status, res.body.code]).toEqual([400, "invalid_request"]);
      }
    });
  });

  describe("the last amount", () => {
    it("is on a food's detail and on each favourite, from the latest eaten entry, null when never eaten", async () => {
      const user = await signUp(suite.client);
      const eaten = await d.fineliFood();
      const never = await d.fineliFood();
      for (const id of [eaten.id, never.id])
        await d
          .api()
          .put(d.v1(`/foods/${id}/favourite`))
          .set(user.auth);
      await d.added(user, d.foodBody(eaten.id, { grams: 120 }, { date: addDays(today(), -1) }));
      await d.added(user, d.foodBody(eaten.id, { grams: 175 }));
      await d.added(user, d.foodBody(eaten.id, { grams: 999 }, { status: "planned" }));

      const detail = await d
        .api()
        .get(d.v1(`/foods/${eaten.id}`))
        .set(user.auth);
      expect(detail.body.lastAmount).toEqual({ grams: 175, portion: null });
      expect(
        (
          await d
            .api()
            .get(d.v1(`/foods/${never.id}`))
            .set(user.auth)
        ).body.lastAmount,
      ).toBeNull();
      const favourites = (await d.api().get(d.v1("/foods/favourites")).set(user.auth)).body.foods;
      expect(favourites.map((f: { id: string; lastAmount: unknown }) => [f.id, f.lastAmount])).toEqual([
        [never.id, null],
        [eaten.id, { grams: 175, portion: null }],
      ]);
    });
  });
});
