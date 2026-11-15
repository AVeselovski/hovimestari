import { beforeAll, describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// The search rule on 249 real Fineli names (release 18, see fixtures/README.md).
// The sample holds each pinned query's full first 40 on the release, so a
// position up to 30 here is the position on the full release. The ranking is
// pinned in Finnish, because part counts and lengths use the display name.

interface SampleFood {
  fineliId: number;
  type: string;
  process: string;
  name: string;
  nameEn: string;
}

const SAMPLE: SampleFood[] = readFileSync(path.resolve("src/services/__tests__/fixtures/fineli-names-r18.csv"), "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const [fineliId, type, process, name, nameEn] = line.split(";");
    return { fineliId: Number(fineliId), type, process, name, nameEn };
  });

type Found = { id: string; name: string; isFavourite: boolean; isOwn: boolean };

await describeWithDb("foodSearch", (suite) => {
  const ids = new Map<number, string>();
  let reader: ApiUser;

  beforeAll(async () => {
    // Invented values: the ranking never reads them.
    for (const f of SAMPLE) {
      const { rows } = await suite.client.query(
        `INSERT INTO foods (source, fineli_id, name, name_en, energy_kcal, protein_g, carbs_g, fat_g, fineli_type, fineli_process)
         VALUES ('fineli', $1, $2, $3, 100, 10, 10, 5, $4, $5) RETURNING id`,
        [f.fineliId, f.name, f.nameEn, f.type, f.process],
      );
      ids.set(f.fineliId, rows[0].id as string);
    }
    reader = await signUp(suite.client);
    // Pinned: part counts and lengths in the ranking use the display name.
    await suite.client.query("UPDATE users SET food_name_language = 'fi' WHERE id = $1", [reader.id]);
  });

  const search = async (as: ApiUser, q: string, limit?: number): Promise<Found[]> => {
    const res = await request(suite.app)
      .get("/api/v1/foods/search")
      .query(limit ? { q, limit } : { q })
      .set(as.auth);
    expect(res.status).toBe(200);
    return res.body.foods as Found[];
  };
  const positionOf = (found: Found[], fineliId: number) => found.findIndex((f) => f.id === ids.get(fineliId)) + 1;

  it("loads the sample", () => {
    expect(SAMPLE.length).toBe(249);
  });

  it.each(["%", "_", "-", "a", "%%", "a %", "  ,  "])("answers no foods for %p, a query with no word", async (q) => {
    expect(await search(reader, q)).toEqual([]);
  });

  it("answers at most 30 by default, and the limit asked for", async () => {
    expect(await search(reader, "maito")).toHaveLength(30);
    expect(await search(reader, "maito", 5)).toHaveLength(5);
  });

  it("matches every word, in either name, without typing accents", async () => {
    const found = await search(reader, "JÄÄTELÖ kerma");
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) expect(f.name.toLowerCase()).toContain("kerma");
    expect((await search(reader, "egg shell")).map((f) => f.id)).toContain(ids.get(858));
  });

  describe("pinned queries", () => {
    it('"rahka": the plain quark in the first 10, every "Rahka, ..." before any "Rahkapiirakka"', async () => {
      const found = await search(reader, "rahka");
      const names = found.map((f) => f.name);
      expect(positionOf(found, 622)).toBeGreaterThan(0);
      expect(positionOf(found, 622)).toBeLessThanOrEqual(10);
      expect(names.slice(0, 20).every((n) => n.startsWith("Rahka, "))).toBe(true);
      expect(names.slice(0, 20).some((n) => /rahkapiirakka/i.test(n))).toBe(false);
      const lastQuark = names.map((n) => n.startsWith("Rahka, ")).lastIndexOf(true);
      const firstPie = names.findIndex((n) => /rahkapiirakka/i.test(n));
      if (firstPie >= 0) expect(lastQuark).toBeLessThan(firstPie);
    });

    it('"muna": the egg first, and the aubergine after every "Kananmuna" food', async () => {
      const found = await search(reader, "muna");
      expect(positionOf(found, 858)).toBe(1);
      const aubergine = positionOf(found, 362);
      expect(aubergine).toBeGreaterThan(1);
      const eggs = SAMPLE.filter((f) => f.name.startsWith("Kananmuna,") && f.type === "FOOD");
      expect(eggs.length).toBeGreaterThan(0);
      for (const egg of eggs) expect(positionOf(found, egg.fineliId)).toBeLessThan(aubergine);
    });

    it('"maito": the first 12 are all "Maito, ..." milks', async () => {
      const names = (await search(reader, "maito")).map((f) => f.name);
      expect(names.slice(0, 12).every((n) => n.startsWith("Maito, "))).toBe(true);
    });

    it('"kaura": pulled oats first, oat flakes in the first 3', async () => {
      const found = await search(reader, "kaura");
      expect(found[0].name).toBe("Nyhtökaura");
      expect(positionOf(found, 153)).toBeGreaterThan(0);
      expect(positionOf(found, 153)).toBeLessThanOrEqual(3);
    });

    it('"kana": chicken first, and the carrot 4th, the known limit of the compound tier', async () => {
      const found = await search(reader, "kana");
      expect(positionOf(found, 750)).toBe(1);
      expect(positionOf(found, 300)).toBe(4);
    });

    it('"jaatelo": the first 12 are all "Jäätelö, ..." ice creams', async () => {
      const names = (await search(reader, "jaatelo")).map((f) => f.name);
      expect(names.slice(0, 12).every((n) => n.startsWith("Jäätelö, "))).toBe(true);
    });

    it('"rahka vl": the four low-lactose quarks first, in order', async () => {
      const found = await search(reader, "rahka vl");
      expect(found).toHaveLength(7);
      expect([34595, 34655, 34592, 11156].map((id) => positionOf(found, id))).toEqual([1, 2, 3, 4]);
    });

    it('"egg": the egg in the first 2, by its English name', async () => {
      const found = await search(reader, "egg");
      expect(positionOf(found, 858)).toBeGreaterThan(0);
      expect(positionOf(found, 858)).toBeLessThanOrEqual(2);
    });
  });

  describe("the user's standing", () => {
    it("ranks a favourite first within its tier, and never above a better tier", async () => {
      const fan = await signUp(suite.client);
      const before = await search(fan, "rahka", 50);
      const quark = before[14];
      const pie = before.find((f) => /rahkapiirakka/i.test(f.name))!;
      for (const f of [quark, pie]) {
        expect((await request(suite.app).put(`/api/v1/foods/${f.id}/favourite`).set(fan.auth)).status).toBe(204);
      }

      const after = await search(fan, "rahka", 50);
      expect(after[0]).toMatchObject({ id: quark.id, isFavourite: true });
      const piePosition = after.findIndex((f) => f.id === pie.id);
      const lastQuark = after.map((f) => f.name.startsWith("Rahka, ")).lastIndexOf(true);
      expect(piePosition).toBeGreaterThan(lastQuark);
    });

    it("ranks the user's own food after favourites and before the rest of its tier", async () => {
      const cook = await signUp(suite.client);
      const res = await request(suite.app)
        .post("/api/v1/foods")
        .set(cook.auth)
        .send({
          name: "Rahka, oma, iso purkki, kotitekoinen, maustamaton",
          per100g: { energyKcal: 1, proteinG: 1, carbsG: 1, fatG: 1 },
        });
      const found = await search(cook, "rahka");
      expect(found[0]).toMatchObject({ id: res.body.id, isOwn: true });
    });
  });

  it("never answers a retired food, which stays readable by id", async () => {
    const { rows } = await suite.client.query(
      `INSERT INTO foods (source, fineli_id, name, name_en, energy_kcal, protein_g, carbs_g, fat_g, fineli_type, fineli_process, retired_at)
       VALUES ('fineli', 999001, 'Kummitusrahka', 'Ghost quark', 1, 1, 1, 1, 'FOOD', 'IND', now()) RETURNING id`,
    );
    expect(await search(reader, "kummitus")).toEqual([]);
    const detail = await request(suite.app).get(`/api/v1/foods/${rows[0].id}`).set(reader.auth);
    expect(detail.body).toMatchObject({ name: "Kummitusrahka", retired: true });
  });

  it("names foods in the user's language, and still finds them by either name", async () => {
    const english = await signUp(suite.client);
    await suite.client.query("UPDATE users SET food_name_language = 'en' WHERE id = $1", [english.id]);
    const found = await search(english, "kananmuna kuoreton");
    expect(found.find((f) => f.id === ids.get(858))).toMatchObject({ name: "Egg without shell" });
  });

  it("serves a word of three characters from the trigram index at 10,000 rows, quickly", async () => {
    // Names that hold none of the sample's words.
    await suite.client.query(
      `INSERT INTO foods (source, fineli_id, name, name_en, energy_kcal, protein_g, carbs_g, fat_g, fineli_type, fineli_process)
       SELECT 'fineli', 500000 + g, 'Zyx ' || g || ', qwv', 'Zyx ' || g, 1, 1, 1, 1, 'FOOD', 'RAW'
       FROM generate_series(1, ${10_000 - SAMPLE.length}) AS g`,
    );
    // VACUUM, not only ANALYZE: a bulk insert leaves the GIN index's pending
    // list full, and the planner then prices the index scan above a seq scan.
    await suite.client.query("VACUUM ANALYZE foods");

    const { searchQuery } = await import("../foodSearch.js");
    const query = searchQuery(suite.db, reader.id, ["rah"], 30).toSQL();
    const plan = await suite.client.query(`EXPLAIN ${query.sql}`, query.params);
    expect(plan.rows.map((r) => r["QUERY PLAN"]).join("\n")).toContain("foods_search_all_trgm");

    const times: number[] = [];
    for (let i = 0; i < 25; i++) {
      const start = performance.now();
      await search(reader, "rahka");
      times.push(performance.now() - start);
    }
    times.sort((x, y) => x - y);
    expect(times[12]).toBeLessThan(150);
  });
});
