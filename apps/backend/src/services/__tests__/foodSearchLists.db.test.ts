import { beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { at, everyMatch, loadSample, SAMPLE, searchAs } from "./support/searchSample.js";

// What GET /foods/search answers around the rank itself: its two lists, when
// the near list is there, where the user's own foods stand, and who sees
// what. On the sample of foodSearch.db.test.ts (see fixtures/README.md).

const PLAIN_QUARK = "Rahka, maitorahka, maustamaton, rasvaa <0,5 %";
const per100g = { energyKcal: 1, proteinG: 1, carbsG: 1, fatG: 1 };

await describeWithDb("foodSearchLists", (suite) => {
  const ids = new Map<string, string>();
  let reader: ApiUser;

  beforeAll(async () => {
    await loadSample(suite.client);
    const { rows } = await suite.client.query("SELECT id, name FROM foods");
    for (const row of rows) ids.set(row.name as string, row.id as string);
    reader = await signUp(suite.client);
  });

  const ownFood = async (owner: ApiUser, name: string) => {
    const res = await request(suite.app).post("/api/v1/foods").set(owner.auth).send({ name, per100g });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };
  let scanned = 0;
  /** A product kept from Open Food Facts, visible to each of `lookedUpBy`. */
  const scannedFood = async (name: string, lookedUpBy: ApiUser[]) => {
    const { rows } = await suite.client.query(
      `INSERT INTO foods (source, name, energy_kcal, protein_g, carbs_g, fat_g, barcode)
       VALUES ('open_food_facts', $1, 1, 1, 1, 1, $2) RETURNING id`,
      [name, String(6_400_000_000_000 + scanned++)],
    );
    for (const user of lookedUpBy) {
      await suite.client.query("INSERT INTO food_lookups (user_id, food_id) VALUES ($1, $2)", [user.id, rows[0].id]);
    }
    return rows[0].id as string;
  };
  const favourite = async (as: ApiUser, name: string) => {
    expect(
      (
        await request(suite.app)
          .put(`/api/v1/foods/${ids.get(name)}/favourite`)
          .set(as.auth)
      ).status,
    ).toBe(204);
  };
  const namesOf = (found: { name: string }[]) => found.map((f) => f.name);

  describe("the answer", () => {
    it("holds two lists of food summaries, foods and near", async () => {
      const res = await request(suite.app).get("/api/v1/foods/search").query({ q: "kermarahka" }).set(reader.auth);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        foods: [
          {
            id: ids.get("Rahka, maustamaton, kermarahka, rasvaa 10 %"),
            source: "fineli",
            name: "Rahka, maustamaton, kermarahka, rasvaa 10 %",
            otherName: "Cream quark, 10% fat",
            per100g: { energyKcal: 100, proteinG: 10, carbsG: 10, fatG: 5 },
            isFavourite: false,
            isOwn: false,
            retired: false,
          },
        ],
        near: [],
      });
    });

    it.each(["%", "_", "-", "a", "%%", "a %", "  ,  "])("is empty for %p, a query with no word", async (q) => {
      expect(await searchAs(suite, reader, q)).toEqual({ foods: [], near: [] });
    });

    it.each(["rahka\u0000vl", "\u0000", "rahka\u001Bvl"])(
      "refuses %j, a query with a control character, with 400",
      async (q) => {
        const res = await request(suite.app).get("/api/v1/foods/search").query({ q }).set(reader.auth);
        expect([res.status, res.body.code]).toEqual([400, "invalid_request"]);
      },
    );

    it.each(["jäätelö", "rahka 🍓", "👨\u200D👩\u200D👧 rahka", "rahka\tvl"])(
      "answers %j: accents, emoji, the zero-width joiner and a tab are text",
      async (q) => {
        expect((await searchAs(suite, reader, q)).foods.length).toBeGreaterThan(0);
      },
    );

    it("holds at most 30 foods by default, and the limit asked for", async () => {
      expect((await searchAs(suite, reader, "maito")).foods).toHaveLength(30);
      expect((await searchAs(suite, reader, "maito", 5)).foods).toHaveLength(5);
    });

    it("matches every word, in either name, without typing accents", async () => {
      const { foods } = await searchAs(suite, reader, "JÄÄTELÖ kerma");
      expect(foods.length).toBeGreaterThan(0);
      for (const f of foods) expect(f.name.toLowerCase()).toContain("kerma");
      expect(namesOf((await searchAs(suite, reader, "egg shell")).foods)).toContain("Kananmuna, kuoreton");
    });

    it("names foods in the user's language, and still finds them by either name", async () => {
      const english = await signUp(suite.client);
      await suite.client.query("UPDATE users SET food_name_language = 'en' WHERE id = $1", [english.id]);
      const { foods } = await searchAs(suite, english, "kananmuna kuoreton");
      expect(foods.find((f) => f.id === ids.get("Kananmuna, kuoreton"))).toMatchObject({ name: "Egg without shell" });
    });

    it("never holds a retired food, which stays readable by id", async () => {
      const { rows } = await suite.client.query(
        `INSERT INTO foods (source, fineli_id, name, name_en, energy_kcal, protein_g, carbs_g, fat_g, fineli_type, fineli_process, retired_at)
         VALUES ('fineli', 999001, 'Haamurahka', 'Phantom quark', 1, 1, 1, 1, 'FOOD', 'IND', '2026-01-01T00:00:00Z') RETURNING id`,
      );
      expect(await searchAs(suite, reader, "haamu")).toEqual({ foods: [], near: [] });
      const detail = await request(suite.app).get(`/api/v1/foods/${rows[0].id}`).set(reader.auth);
      expect(detail.body).toMatchObject({ name: "Haamurahka", retired: true });
    });
  });

  describe("near, the foods with all words but one", () => {
    it("is empty for one word, however few foods match", async () => {
      const { foods, near } = await searchAs(suite, reader, "kermarahka");
      expect(foods).toHaveLength(1);
      expect(near).toEqual([]);
    });

    it("is empty when 8 foods or more hold every word", async () => {
      const { foods, near } = await searchAs(suite, reader, "rahka maustettu");
      expect(foods.length).toBeGreaterThanOrEqual(8);
      expect(near).toEqual([]);
    });

    it("is empty when the limit is under 8 and the foods fill it", async () => {
      const { foods, near } = await searchAs(suite, reader, "jauheliha nauta", 5);
      expect(foods).toHaveLength(5);
      expect(near).toEqual([]);
    });

    it("has rows when fewer foods than a limit under 8 hold every word, each lacking one word, in rank order", async () => {
      const { foods, near } = await searchAs(suite, reader, "riisi tumma", 5);
      expect(namesOf(foods)).toEqual([
        "Riisi tumma",
        "Riisi, tumma, keitetty, suolaa",
        "Riisi, tumma, keitetty, suolaton",
      ]);
      expect(near).toHaveLength(8);
      for (const { name } of near) {
        expect([/riisi/i.test(name), /tumma/i.test(name)].filter(Boolean)).toHaveLength(1);
      }
      // The rule over the word each holds: basic foods by recipe uses, then a one-food dish.
      expect(namesOf(near).slice(0, 3)).toEqual([
        "Riisi puuroutuva",
        "Riisi pitkäjyväinen, puuroutumaton",
        "Riisi, keitetty, suolaa",
      ]);
    });

    it('"rahka vl": the seven foods that hold both words, then the quarks that are not low in lactose', async () => {
      const { foods, near } = await searchAs(suite, reader, "rahka vl");
      expect(namesOf(foods)).toEqual([
        `${PLAIN_QUARK}, vl`,
        "Rahka, maustettu, rasvaa 7 %, vl",
        "Rahka, maustettu, rasvaton, proteiinirahka, vl",
        "Rahka, maitorahka, maustamaton, rasvaa 2,3 %, vl",
        "Rasvaseos 40%, valio better rahkariini, vl",
        "Jogurtti, maustettu, rahkainen jogurtti, valio, rasvaa 1,7 %, vl",
        "Jogurtti, juotava, valiojogurtti rahkainen, rasvaa 1,2 %, vl, d-vit 1 ug",
      ]);
      expect(namesOf(near)).toEqual([
        PLAIN_QUARK,
        "Rahka, maustettu, rasvaa 4 %",
        "Rahka, maustettu, rasvaa 2,9 %",
        "Rahka, maustettu, rasvaa 3,5 %",
        "Rahka, maustettu, rasvaa 4,5 %",
        "Rahka, maustettu, danio, rasvaa 3 %",
        "Rahka, maustamaton, kermarahka, rasvaa 10 %",
        "Rahka, rahkajogurtti, maustamaton, rasvaa 0,9 %",
      ]);
    });

    it("lists foods when nothing holds every word", async () => {
      const { foods, near } = await searchAs(suite, reader, "omena 120");
      expect(foods).toEqual([]);
      expect(near).toHaveLength(8);
      expect(near[0].name).toBe("Omena, keskiarvo, punnittu kuorineen");
    });

    it("never holds a retired food or another user's food, and holds the user's own", async () => {
      const cook = await signUp(suite.client);
      const other = await signUp(suite.client);
      const mine = await ownFood(cook, "Aavekeitto");
      await ownFood(other, "Aavepata");
      await scannedFood("Aavejuoma", [other]);
      await suite.client.query(
        `INSERT INTO foods (source, fineli_id, name, name_en, energy_kcal, protein_g, carbs_g, fat_g, fineli_type, fineli_process, retired_at)
         VALUES ('fineli', 999002, 'Aavepuuro', 'Wraith porridge', 1, 1, 1, 1, 'FOOD', 'IND', '2026-01-01T00:00:00Z')`,
      );
      const { foods, near } = await searchAs(suite, cook, "aave qzqz");
      expect(foods).toEqual([]);
      expect(near.map((f) => f.id)).toEqual([mine]);
    });
  });

  describe("yours before position", () => {
    it("puts an own food that holds the word later above a Fineli food headed by it, and never above a better group", async () => {
      const cook = await signUp(suite.client);
      const before = await searchAs(suite, cook, "rahka");
      expect(before.foods[0].name).toBe(PLAIN_QUARK);

      const later = await ownFood(cook, "Oma maitorahka");
      await ownFood(cook, "Rahkaherkku");
      const { foods } = await searchAs(suite, cook, "rahka");
      expect(foods[0]).toMatchObject({ id: later, isOwn: true });
      expect(foods[1].name).toBe(PLAIN_QUARK);

      // "Rahkaherkku" only starts with the word: it leads its own group, after every basic food that holds it strongly.
      const all = await everyMatch(suite, cook.id, "rahka");
      const quarks = SAMPLE.filter((f) => f.name.startsWith("Rahka, "));
      expect(quarks.length).toBeGreaterThan(8);
      for (const quark of quarks) expect(at(all, quark.name)).toBeLessThan(at(all, "Rahkaherkku"));
      expect(at(all, "Rahkaherkku")).toBeLessThan(at(all, "Rahkapiirakka, muropohja"));
    });

    it("puts a favourite that holds the word later first in its group, and never above a better group", async () => {
      const fan = await signUp(suite.client);
      expect(namesOf((await searchAs(suite, fan, "nauta")).foods)[0]).toBe("Naudanpaisti");
      await favourite(fan, "Jauheliha, sika-nauta");
      await favourite(fan, "Lasagne, sika-nauta");

      const all = await everyMatch(suite, fan.id, "nauta");
      expect(all.slice(0, 2)).toEqual(["Jauheliha, sika-nauta", "Naudanpaisti"]);
      // The lasagne is a dish with the word later in its name: after every basic food that holds it strongly.
      expect(at(all, "Lasagne, sika-nauta")).toBeGreaterThan(at(all, "Lihasäilyke, sika-nauta"));
      expect(at(all, "Lasagne, sika-nauta")).toBeLessThan(at(all, "Italianpata, sika-nauta"));
    });

    it("keeps a favourite dish with the word inside a word after a basic food with it inside a word", async () => {
      const fan = await signUp(suite.client);
      await favourite(fan, "Voileipäkakku, kasvis");
      const all = await everyMatch(suite, fan.id, "leipä");
      expect(at(all, "Jauho, hiivaleipävehnäjauho")).toBeGreaterThan(0);
      expect(at(all, "Voileipäkakku, kasvis")).toBeGreaterThan(at(all, "Jauho, hiivaleipävehnäjauho"));
    });

    it("puts a favourite before an own food, and a scanned product with the own foods", async () => {
      const cook = await signUp(suite.client);
      const other = await signUp(suite.client);
      const own = await ownFood(cook, "Oma maitorahka");
      const kept = await scannedFood("Kaupan maitorahka", [cook]);
      const theirs = await scannedFood("Toisen maitorahka", [other]);
      const starts = await scannedFood("Rahkavälipala", [cook]);
      await favourite(cook, "Rahka, maustettu, rasvaa 4 %");

      const { foods } = await searchAs(suite, cook, "rahka", 50);
      expect(foods.slice(0, 4).map((f) => f.id)).toEqual([
        ids.get("Rahka, maustettu, rasvaa 4 %"),
        // Both are the user's, both hold the word at the end of a later word: the shorter name first.
        own,
        kept,
        ids.get(PLAIN_QUARK),
      ]);
      expect(foods.map((f) => f.id)).not.toContain(theirs);
      expect(foods.findIndex((f) => f.id === starts)).toBeGreaterThan(
        foods.findIndex((f) => f.name === `${PLAIN_QUARK}, vl`),
      );
      expect((await searchAs(suite, other, "maitorahka")).foods.map((f) => f.id)).toContain(theirs);
    });
  });
});
