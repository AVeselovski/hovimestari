import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { offStub, stubDeps } from "../../__tests__/support/offStub.js";
import { insertFineliFood } from "../../db/__tests__/support/seedOneOfEach.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// The portions a new own food comes with, through POST /foods, and a
// Fineli food copied into a person's own, as in the olive oil scan that
// missed: the copy is a new own food made by POST /foods with the Fineli
// food's name, its values with one changed, the scanned barcode and its
// tablespoon as a named portion. The Fineli food stays exactly as it was,
// and the next lookup of the barcode answers the copy with no call to Open
// Food Facts.

const BARCODE = "6416710030208";
const FINELI = { energyKcal: 884, proteinG: 0, carbsG: 0, fatG: 100 };
const NOW = new Date("2026-11-28T10:00:00Z");

await describeWithDb("foodCopy", (suite) => {
  const api = () => request(suite.app);

  /** POST /foods of an olive oil with `portions`, which must answer 201. */
  const createFood = async (owner: ApiUser, portions: unknown[]) => {
    const res = await api()
      .post("/api/v1/foods")
      .set(owner.auth)
      .send({ name: "Oliiviöljy", per100g: FINELI, portions });
    expect(res.status).toBe(201);
    return res.body as { id: string; portions: unknown[] };
  };

  /** A Fineli olive oil with one tablespoon, as the import writes it. */
  const fineliOliveOil = () =>
    insertFineliFood(suite.client, 950_001, {
      name: "Oliiviöljy",
      nameEn: "Olive oil",
      per100g: FINELI,
      unit: "RKL",
      grams: 13.5,
    });

  /** Every row the Fineli food has: itself, its portions and its favourites. */
  const rowsOf = async (id: string) => ({
    food: (await suite.client.query("SELECT * FROM foods WHERE id = $1", [id])).rows,
    portions: (await suite.client.query("SELECT * FROM food_portions WHERE food_id = $1 ORDER BY id", [id])).rows,
    favourites: (await suite.client.query("SELECT * FROM food_favourites WHERE food_id = $1", [id])).rows,
  });

  describe("a copy of a Fineli food with a barcode", () => {
    it("is a new own food, leaves the Fineli food as it was, and is what the next lookup finds", async () => {
      const a = await signUp(suite.client);
      const fineli = await fineliOliveOil();
      await api().put(`/api/v1/foods/${fineli}/favourite`).set(a.auth).expect(204);
      const before = (await api().get(`/api/v1/foods/${fineli}`).set(a.auth)).body;
      const rowsBefore = await rowsOf(fineli);
      const tablespoon = before.portions[0];
      expect(tablespoon).toMatchObject({ unit: "RKL", name: null, isOwn: false });

      const res = await api()
        .post("/api/v1/foods")
        .set(a.auth)
        .send({
          name: before.name,
          per100g: { ...before.per100g, fatG: 91.6 },
          barcode: BARCODE,
          portions: [{ name: "Tablespoon", grams: tablespoon.grams }],
        });
      expect(res.status).toBe(201);
      const copy = res.body;
      expect(copy).toMatchObject({
        source: "user",
        isOwn: true,
        isFavourite: false,
        name: "Oliiviöljy",
        otherName: null,
        per100g: { ...FINELI, fatG: 91.6 },
        barcode: BARCODE,
        fineli: null,
        lastAmount: null,
        portions: [{ id: expect.any(String), unit: null, name: "Tablespoon", grams: 13.5, isOwn: true }],
      });
      expect(copy.id).not.toBe(fineli);

      // The Fineli food reads as before, row for row: values, portions, retired, favourite.
      expect((await api().get(`/api/v1/foods/${fineli}`).set(a.auth)).body).toEqual(before);
      expect(await rowsOf(fineli)).toEqual(rowsBefore);

      const { lookupBarcode } = await import("../../services/writes/barcode.js");
      const { contextForUser } = await import("../../lib/requestContext.js");
      const ctx = contextForUser({ id: a.id, timeZone: "Europe/Helsinki" }, NOW);
      const stub = offStub();
      const found = await lookupBarcode(ctx, { barcode: BARCODE }, await stubDeps(stub));
      expect(found.value).toEqual({ result: "found", food: copy, newlyVisible: false });
      expect(found.value).not.toMatchObject({ food: { id: fineli } });
      expect(stub.calls).toEqual([]);
    });
  });

  describe("the portions a new own food comes with", () => {
    const portions = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Portion ${i + 1}`, grams: i + 1 }));
    const ownCounts = async (owner: ApiUser) =>
      (
        await suite.client.query(
          `SELECT (SELECT count(*) FROM foods WHERE user_id = $1)::int AS foods,
                  (SELECT count(*) FROM food_portions WHERE user_id = $1)::int AS portions`,
          [owner.id],
        )
      ).rows[0];

    it("takes 30, and answers them as the user's own in the food's detail", async () => {
      const a = await signUp(suite.client);
      const created = await createFood(a, portions(30));
      expect(created.portions).toHaveLength(30);
      expect(created.portions).toContainEqual({
        id: expect.any(String),
        unit: null,
        name: "Portion 30",
        grams: 30,
        isOwn: true,
      });
      expect((await api().get(`/api/v1/foods/${created.id}`).set(a.auth)).body.portions).toEqual(created.portions);
    });

    it.each([
      ["31 portions", portions(31), "portions_too_many"],
      ["a portion with no name", [{ name: "", grams: 15 }], "portion_name_required"],
    ])("refuses %s and saves nothing", async (_what, list, code) => {
      const a = await signUp(suite.client);
      const res = await api()
        .post("/api/v1/foods")
        .set(a.auth)
        .send({ name: "Oliiviöljy", per100g: FINELI, portions: list });
      expect([res.status, res.body.code]).toEqual([400, code]);
      expect(await ownCounts(a)).toEqual({ foods: 0, portions: 0 });
    });

    it("are not read by an edit, which leaves the food's portions as they were", async () => {
      const a = await signUp(suite.client);
      const created = await createFood(a, portions(2));
      const res = await api()
        .put(`/api/v1/foods/${created.id}`)
        .set(a.auth)
        .send({ name: "Oliiviöljy", per100g: { ...FINELI, fatG: 91.6 }, portions: portions(5) });
      expect(res.status).toBe(200);
      expect(res.body.portions).toEqual(created.portions);
      expect(await ownCounts(a)).toEqual({ foods: 1, portions: 2 });
    });
  });
});
