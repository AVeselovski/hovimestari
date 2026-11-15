import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { insertFineliFood } from "../../db/__tests__/support/seedOneOfEach.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Foods on a real, migrated Postgres: who sees what, what is read-only, and
// what each route answers. User B must never learn that user A's own food or
// own portion exists.

const per100g = { energyKcal: 120, proteinG: 12.5, carbsG: 4, fatG: 6.25 };

let fineliIds = 800_000;

await describeWithDb("foods", (suite) => {
  const api = () => request(suite.app);
  const user = () => signUp(suite.client);
  const fineliFood = () => insertFineliFood(suite.client, ++fineliIds);
  const createFood = async (owner: ApiUser, body: Record<string, unknown> = {}) => {
    const res = await api()
      .post("/api/v1/foods")
      .set(owner.auth)
      .send({ name: "Proteiinirahka", per100g, ...body });
    expect(res.status).toBe(201);
    return res.body as { id: string; portions: unknown[] };
  };
  const addPortion = async (owner: ApiUser, foodId: string, name = "one tub", grams = 200) => {
    const res = await api().post(`/api/v1/foods/${foodId}/portions`).set(owner.auth).send({ name, grams });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };

  describe("own foods", () => {
    it("creates, reads, lists, edits and deletes an own food", async () => {
      const a = await user();
      const created = await createFood(a, { barcode: "6408430000012" });
      expect(created).toMatchObject({
        source: "user",
        name: "Proteiinirahka",
        otherName: null,
        per100g,
        isOwn: true,
        isFavourite: false,
        retired: false,
        barcode: "6408430000012",
        fineli: null,
        portions: [],
      });

      expect((await api().get(`/api/v1/foods/${created.id}`).set(a.auth)).body).toEqual(created);
      expect((await api().get("/api/v1/foods/own").set(a.auth)).body.foods.map((f: { id: string }) => f.id)).toEqual([
        created.id,
      ]);

      const edited = await api()
        .put(`/api/v1/foods/${created.id}`)
        .set(a.auth)
        .send({ name: "Rahka", per100g: { ...per100g, fatG: 0.2 } });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ name: "Rahka", barcode: null, per100g: { ...per100g, fatG: 0.2 } });

      expect((await api().delete(`/api/v1/foods/${created.id}`).set(a.auth)).status).toBe(204);
      expect((await api().get(`/api/v1/foods/${created.id}`).set(a.auth)).status).toBe(404);
    });

    it("refuses a second own food with one barcode, and lets another user use it", async () => {
      const a = await user();
      const b = await user();
      await createFood(a, { barcode: "12345678" });
      const twice = await api().post("/api/v1/foods").set(a.auth).send({ name: "Twin", per100g, barcode: "12345678" });
      expect(twice.status).toBe(409);
      expect(twice.body.code).toBe("barcode_taken");
      await createFood(b, { barcode: "12345678" });
    });

    it("refuses a barcode taken by another own food on edit", async () => {
      const a = await user();
      await createFood(a, { barcode: "87654321" });
      const other = await createFood(a);
      const res = await api()
        .put(`/api/v1/foods/${other.id}`)
        .set(a.auth)
        .send({ name: "Other", per100g, barcode: "87654321" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("barcode_taken");
    });

    it("answers a validation code for a bad body", async () => {
      const a = await user();
      const res = await api()
        .post("/api/v1/foods")
        .set(a.auth)
        .send({ name: "A", per100g: { ...per100g, fatG: 101 } });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("food_macro_invalid");
    });

    it("deletes the food's portions and favourites with it", async () => {
      const a = await user();
      const food = await createFood(a);
      await addPortion(a, food.id);
      await api().put(`/api/v1/foods/${food.id}/favourite`).set(a.auth);
      await api().delete(`/api/v1/foods/${food.id}`).set(a.auth);
      const left = await suite.client.query(
        "SELECT (SELECT count(*) FROM food_portions WHERE food_id = $1)::int AS p, (SELECT count(*) FROM food_favourites WHERE food_id = $1)::int AS f",
        [food.id],
      );
      expect(left.rows[0]).toEqual({ p: 0, f: 0 });
    });
  });

  describe("values the columns cannot hold", () => {
    it.each([
      [{ ...per100g, proteinG: 1.2345 }, "food_macro_invalid"],
      [{ ...per100g, energyKcal: 59.315 }, "food_energy_invalid"],
    ])("refuses %j rather than storing it rounded", async (values, code) => {
      const a = await user();
      const res = await api().post("/api/v1/foods").set(a.auth).send({ name: "Tarkka", per100g: values });
      expect([res.status, res.body.code]).toEqual([400, code]);
    });

    it("answers an identical edit as unchanged, keeping updated_at", async () => {
      const a = await user();
      const values = { ...per100g, proteinG: 1.234, energyKcal: 59.31 };
      const food = await createFood(a, { per100g: values });
      const stamp = async () =>
        (await suite.client.query("SELECT updated_at FROM foods WHERE id = $1", [food.id])).rows[0].updated_at as Date;
      const before = await stamp();
      await api().put(`/api/v1/foods/${food.id}`).set(a.auth).send({ name: "Proteiinirahka", per100g: values });
      expect(await stamp()).toEqual(before);
    });

    it("refuses a portion weight Postgres would round to zero", async () => {
      const a = await user();
      const food = await createFood(a);
      const res = await api()
        .post(`/api/v1/foods/${food.id}/portions`)
        .set(a.auth)
        .send({ name: "x", grams: 0.00000001 });
      expect([res.status, res.body.code]).toEqual([400, "portion_grams_invalid"]);
    });
  });

  describe("list limits", () => {
    it("answer at most the limit asked for, and refuse one above 200", async () => {
      const a = await user();
      await createFood(a, { name: "Yksi" });
      await createFood(a, { name: "Kaksi" });
      const one = await api().get("/api/v1/foods/own").query({ limit: 1 }).set(a.auth);
      expect(one.body.foods).toHaveLength(1);
      expect((await api().get("/api/v1/foods/own").set(a.auth)).body.foods).toHaveLength(2);
      for (const path of ["/api/v1/foods/own", "/api/v1/foods/favourites"]) {
        const res = await api().get(path).query({ limit: 201 }).set(a.auth);
        expect([res.status, res.body.code]).toEqual([400, "invalid_request"]);
      }
    });

    it("cut the favourites list at the limit too", async () => {
      const a = await user();
      for (const id of [await fineliFood(), await fineliFood()]) {
        await api().put(`/api/v1/foods/${id}/favourite`).set(a.auth);
      }
      const res = await api().get("/api/v1/foods/favourites").query({ limit: 1 }).set(a.auth);
      expect(res.body.foods).toHaveLength(1);
    });
  });

  describe("another user's own food", () => {
    it("answers 404 food_not_found on every route for user B, and never appears in B's search", async () => {
      const a = await user();
      const b = await user();
      const food = await createFood(a, { name: "Salainen rahkaherkku" });
      const portion = await addPortion(a, food.id);
      const base = `/api/v1/foods/${food.id}`;

      const calls = [
        api().get(base).set(b.auth),
        api().put(base).set(b.auth).send({ name: "Stolen", per100g }),
        api().delete(base).set(b.auth),
        api().post(`${base}/portions`).set(b.auth).send({ name: "x", grams: 1 }),
        api().put(`${base}/favourite`).set(b.auth),
        api().delete(`${base}/favourite`).set(b.auth),
      ];
      for (const res of await Promise.all(calls)) {
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 404, code: "food_not_found" });
      }
      for (const res of await Promise.all([
        api().put(`${base}/portions/${portion.id}`).set(b.auth).send({ name: "x", grams: 1 }),
        api().delete(`${base}/portions/${portion.id}`).set(b.auth),
      ])) {
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 404, code: "portion_not_found" });
      }

      const search = await api().get("/api/v1/foods/search").query({ q: "salainen" }).set(b.auth);
      expect(search.body).toEqual({ foods: [] });
      const own = await api().get("/api/v1/foods/search").query({ q: "salainen" }).set(a.auth);
      expect(own.body.foods.map((f: { id: string }) => f.id)).toEqual([food.id]);
      expect((await api().get("/api/v1/foods/own").set(b.auth)).body).toEqual({ foods: [] });
    });

    it("answers 404 for a malformed id", async () => {
      const a = await user();
      const res = await api().get("/api/v1/foods/not-a-uuid").set(a.auth);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("food_not_found");
    });
  });

  describe("Fineli foods", () => {
    it("are read-only: PUT and DELETE answer 403 food_read_only", async () => {
      const a = await user();
      const id = await fineliFood();
      const put = await api().put(`/api/v1/foods/${id}`).set(a.auth).send({ name: "Mine now", per100g });
      const del = await api().delete(`/api/v1/foods/${id}`).set(a.auth);
      expect([put.status, put.body.code]).toEqual([403, "food_read_only"]);
      expect([del.status, del.body.code]).toEqual([403, "food_read_only"]);
    });

    it("show their source, the Fineli id and their Fineli portions", async () => {
      const a = await user();
      const id = await fineliFood();
      const res = await api().get(`/api/v1/foods/${id}`).set(a.auth);
      expect(res.body).toMatchObject({
        source: "fineli",
        name: `Rahka ${fineliIds}`,
        otherName: `Quark ${fineliIds}`,
        isOwn: false,
        fineli: { id: fineliIds, type: "FOOD", process: "IND" },
        portions: [{ unit: "PORTM", name: null, grams: 200, isOwn: false }],
      });
    });

    it("refuse an edit of a Fineli portion with 403 portion_read_only", async () => {
      const a = await user();
      const id = await fineliFood();
      const detail = await api().get(`/api/v1/foods/${id}`).set(a.auth);
      const fineliPortion = detail.body.portions[0].id as string;
      const put = await api()
        .put(`/api/v1/foods/${id}/portions/${fineliPortion}`)
        .set(a.auth)
        .send({ name: "x", grams: 1 });
      const del = await api().delete(`/api/v1/foods/${id}/portions/${fineliPortion}`).set(a.auth);
      expect([put.status, put.body.code]).toEqual([403, "portion_read_only"]);
      expect([del.status, del.body.code]).toEqual([403, "portion_read_only"]);
    });
  });

  describe("portions", () => {
    it("keep user A's portion on a Fineli food out of user B's detail, and B's writes to it answer 404", async () => {
      const a = await user();
      const b = await user();
      const id = await fineliFood();
      const mine = await addPortion(a, id, "one tub", 250);

      const seenByA = (await api().get(`/api/v1/foods/${id}`).set(a.auth)).body.portions;
      expect(seenByA).toEqual([
        { id: expect.any(String), unit: "PORTM", name: null, grams: 200, isOwn: false },
        { id: mine.id, unit: null, name: "one tub", grams: 250, isOwn: true },
      ]);
      const seenByB = (await api().get(`/api/v1/foods/${id}`).set(b.auth)).body.portions;
      expect(seenByB.map((p: { id: string }) => p.id)).not.toContain(mine.id);

      const put = await api().put(`/api/v1/foods/${id}/portions/${mine.id}`).set(b.auth).send({ name: "x", grams: 1 });
      const del = await api().delete(`/api/v1/foods/${id}/portions/${mine.id}`).set(b.auth);
      expect([put.status, put.body.code]).toEqual([404, "portion_not_found"]);
      expect([del.status, del.body.code]).toEqual([404, "portion_not_found"]);
    });

    it("edits and removes the user's own portion", async () => {
      const a = await user();
      const food = await createFood(a);
      const portion = await addPortion(a, food.id);
      const base = `/api/v1/foods/${food.id}/portions/${portion.id}`;
      const put = await api().put(base).set(a.auth).send({ name: "half a tub", grams: 100 });
      expect(put.body).toEqual({ id: portion.id, unit: null, name: "half a tub", grams: 100, isOwn: true });
      expect((await api().delete(base).set(a.auth)).status).toBe(204);
      expect((await api().delete(base).set(a.auth)).status).toBe(404);
    });

    it("answers 404 for a portion under another food's id", async () => {
      const a = await user();
      const one = await createFood(a);
      const two = await createFood(a);
      const portion = await addPortion(a, one.id);
      const res = await api().delete(`/api/v1/foods/${two.id}/portions/${portion.id}`).set(a.auth);
      expect([res.status, res.body.code]).toEqual([404, "portion_not_found"]);
    });

    it("answers a validation code for a bad portion", async () => {
      const a = await user();
      const food = await createFood(a);
      const res = await api().post(`/api/v1/foods/${food.id}/portions`).set(a.auth).send({ name: "x", grams: 0 });
      expect([res.status, res.body.code]).toEqual([400, "portion_grams_invalid"]);
    });
  });

  describe("favourites", () => {
    it("are idempotent both ways and list newest first", async () => {
      const a = await user();
      const first = await fineliFood();
      const second = await fineliFood();
      const fav = (id: string) => api().put(`/api/v1/foods/${id}/favourite`).set(a.auth);
      const unfav = (id: string) => api().delete(`/api/v1/foods/${id}/favourite`).set(a.auth);

      expect((await fav(first)).status).toBe(204);
      expect((await fav(first)).status).toBe(204);
      expect((await fav(second)).status).toBe(204);
      const list = await api().get("/api/v1/foods/favourites").set(a.auth);
      expect(list.body.foods.map((f: { id: string; isFavourite: boolean }) => [f.id, f.isFavourite])).toEqual([
        [second, true],
        [first, true],
      ]);

      expect((await unfav(first)).status).toBe(204);
      expect((await unfav(first)).status).toBe(204);
      expect((await api().get(`/api/v1/foods/${first}`).set(a.auth)).body.isFavourite).toBe(false);
    });

    it("answers 404 for an unknown food", async () => {
      const a = await user();
      const res = await api().put("/api/v1/foods/00000000-0000-4000-8000-000000000000/favourite").set(a.auth);
      expect([res.status, res.body.code]).toEqual([404, "food_not_found"]);
    });
  });

  describe("settings", () => {
    it("answers the language and zone in GET /users/me, and PATCH changes the names foods answer", async () => {
      const a = await user();
      const id = await fineliFood();
      const me = await api().get("/api/v1/users/me").set(a.auth);
      expect(me.body).toMatchObject({ foodNameLanguage: "fi", timeZone: "Europe/Helsinki" });

      const patched = await api().patch("/api/v1/users/me/settings").set(a.auth).send({ foodNameLanguage: "en" });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ foodNameLanguage: "en", timeZone: "Europe/Helsinki" });

      const detail = await api().get(`/api/v1/foods/${id}`).set(a.auth);
      expect([detail.body.name, detail.body.otherName]).toEqual([`Quark ${fineliIds}`, `Rahka ${fineliIds}`]);
      const search = await api()
        .get("/api/v1/foods/search")
        .query({ q: `rahka ${fineliIds}` })
        .set(a.auth);
      expect(search.body.foods.map((f: { name: string }) => f.name)).toEqual([`Quark ${fineliIds}`]);
    });

    it("changes the time zone, and refuses one Intl does not know", async () => {
      const a = await user();
      const ok = await api().patch("/api/v1/users/me/settings").set(a.auth).send({ timeZone: "America/New_York" });
      expect(ok.body.timeZone).toBe("America/New_York");
      const canonical = await api()
        .patch("/api/v1/users/me/settings")
        .set(a.auth)
        .send({ timeZone: "europe/helsinki" });
      expect(canonical.body.timeZone).toBe("Europe/Helsinki");
      const offset = await api().patch("/api/v1/users/me/settings").set(a.auth).send({ timeZone: "+02:00" });
      expect([offset.status, offset.body.code]).toEqual([400, "invalid_time_zone"]);
      const bad = await api().patch("/api/v1/users/me/settings").set(a.auth).send({ timeZone: "Mars/Olympus" });
      expect([bad.status, bad.body.code]).toEqual([400, "invalid_time_zone"]);
      const empty = await api().patch("/api/v1/users/me/settings").set(a.auth).send({});
      expect([empty.status, empty.body.code]).toEqual([400, "invalid_request"]);
    });
  });
});
