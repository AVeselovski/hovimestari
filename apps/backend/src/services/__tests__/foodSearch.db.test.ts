import { beforeAll, describe, expect, it } from "@jest/globals";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";
import { at, everyMatch, loadSample, restoreCounts, SAMPLE, searchAs } from "./support/searchSample.js";

// The search rule on 826 real Fineli names with their real recipe counts
// (release 18, see fixtures/README.md). The sample holds each pinned query's
// full first 40 on the release, so a position up to 40 here is the position
// on the full release. The ranking is pinned in Finnish unless a test says
// otherwise, because part counts and lengths use the display name.

const DRY_PASTA = "Pasta, spagetti, makaroni";
const PLAIN_QUARK = "Rahka, maitorahka, maustamaton, rasvaa <0,5 %";
const EGG = "Kananmuna, kuoreton";
const BOILED_CHICKEN = "Kana, keitetty, suolaa";
const RYE_BREAD = "Ruisleipä, ruista 51%";
const FLATBREAD = "Sekaleipä, nyrkkirieska, ohra, kotitekoinen";
const BEEF_MINCE = "Jauheliha, naudan, rasvaa 17 %";

await describeWithDb("foodSearch", (suite) => {
  let reader: ApiUser;
  let english: ApiUser;

  beforeAll(async () => {
    await loadSample(suite.client);
    reader = await signUp(suite.client);
    english = await signUp(suite.client);
    await suite.client.query("UPDATE users SET food_name_language = 'fi' WHERE id = $1", [reader.id]);
    await suite.client.query("UPDATE users SET food_name_language = 'en' WHERE id = $1", [english.id]);
  });

  /** The names `q` answers, in order: the first 30, or the first `limit`. */
  const names = async (q: string, limit?: number) => (await searchAs(suite, reader, q, limit)).foods.map((f) => f.name);

  it("loads the sample", () => {
    expect(SAMPLE.length).toBe(826);
  });

  describe("the owner's two searches", () => {
    it('"spagetti": the dry pasta and its two gluten-free kinds first, no ready meal in the first 8', async () => {
      const found = await names("spagetti");
      expect(found.slice(0, 3)).toEqual([
        DRY_PASTA,
        "Pasta, spagetti, makaroni, luontaisesti gluteeniton",
        "Pasta, spagetti, luontaisesti gluteeniton, kananmunaa",
      ]);
      expect(found.slice(0, 8).filter((n) => n.includes("valmisateria"))).toEqual([]);
      expect(at(found, "Spagettilihavuoka")).toBeGreaterThan(at(found, DRY_PASTA));
    });

    it('"jauheliha 10 nauta": the one mince at 10 % and its fried form, then the nearest minces in near', async () => {
      const { foods, near } = await searchAs(suite, reader, "jauheliha 10 nauta");
      expect(foods.map((f) => f.name)).toEqual([
        "Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 10 %",
        "Jauheliha, kevyt, sika-nauta, paistettu",
      ]);
      expect(near.map((f) => f.name).slice(0, 4)).toEqual([
        "Jauheliha, sika-nauta",
        "Jauheliha, naudanpaisti, rasvaa 9 %",
        BEEF_MINCE,
        "Jauheliha, naudan, vähärasvainen, rasvaa 7 %",
      ]);
      expect(near).toHaveLength(8);
      const full = new Set(foods.map((f) => f.id));
      expect(near.filter((f) => full.has(f.id))).toEqual([]);
    });
  });

  describe("word forms", () => {
    it('"nauta" finds the "Naudan..." cuts, and "naudan" the beef mince', async () => {
      const beef = await names("nauta");
      expect(beef[0]).toBe("Naudanpaisti");
      expect(beef.slice(0, 8).filter((n) => !n.startsWith("Naud"))).toEqual([]);
      const genitive = await names("naudan");
      expect(at(genitive, BEEF_MINCE)).toBeGreaterThan(0);
      expect(at(genitive, BEEF_MINCE)).toBeLessThanOrEqual(3);
    });

    it('"jauheliha nauta": the mixed mince, then beef at 9 %, 17 % and 7 %, before any fried form', async () => {
      const found = await names("jauheliha nauta");
      expect(found.slice(0, 4)).toEqual([
        "Jauheliha, sika-nauta",
        "Jauheliha, naudanpaisti, rasvaa 9 %",
        BEEF_MINCE,
        "Jauheliha, naudan, vähärasvainen, rasvaa 7 %",
      ]);
      expect(found.findIndex((n) => n.includes("paistettu"))).toBeGreaterThan(3);
    });

    it("a typed base finds its changed-stem genitive: sika, lammas, hirvi", async () => {
      const pork = await names("sika");
      expect(at(pork, "Sianliha, keskiarvo")).toBeGreaterThan(0);
      expect(at(pork, "Sianliha, keskiarvo")).toBeLessThanOrEqual(3);
      expect((await names("lammas")).slice(0, 2)).toEqual(["Lampaanliha, vähärasvainen", "Lampaanliha, rasvainen"]);
      expect((await names("hirvi"))[0]).toBe("Hirvenliha");
    });

    it("a typed genitive finds its base: kanan, perunan", async () => {
      expect((await names("kanan"))[0]).toBe("Kana");
      expect((await names("perunan"))[0]).toBe("Peruna, vanha, kuorittu");
    });

    it('a typed genitive ranks its base as a later whole word above its base at the start of a word: "perunan"', async () => {
      const found = await everyMatch(suite, reader.id, "perunan");
      const laterWord = at(found, "Jauho, jauhoseos, luontaisesti gluteeniton, riisi-maissi-peruna");
      expect(laterWord).toBeGreaterThan(0);
      for (const starts of ["Perunahiutale", "Perunalastu"]) expect(at(found, starts)).toBeGreaterThan(laterWord);
    });

    it('a typed genitive finds its own form too, and the base in a compound: "sian"', async () => {
      const found = await names("sian");
      expect(found.slice(0, 2)).toEqual(["Sian selkäsilava", "Sian lämminsavukylki, rasvainen"]);
      expect(found).toContain("Jauheliha, sika-nauta");
    });

    it('a regular pair works one way: "poro" adds no form, "poron" finds the base', async () => {
      const typedBase = await everyMatch(suite, reader.id, "poro");
      expect(typedBase[0]).toBe("Poronliha");
      // "Maksa, poron" is met as a word that starts with "poro", so every basic food headed "Poron..." comes first.
      const liver = at(typedBase, "Maksa, poron");
      for (const basic of ["Poronliha", "Poronpaisti", "Poronliha, keitetty, suolaa"]) {
        expect(at(typedBase, basic)).toBeGreaterThan(0);
        expect(at(typedBase, basic)).toBeLessThan(liver);
      }
      // A many-food dish headed "Poron..." is a dish where the word only starts a word: a later group.
      expect(at(typedBase, "Poronlihamureke")).toBeGreaterThan(liver);

      const typedGenitive = await names("poron");
      expect(typedGenitive[0]).toBe("Maksa, poron");
      expect(typedGenitive).toContain("Poro-rieskarulla");
      expect(typedBase).toContain("Poro-rieskarulla");
    });

    it('the dropped pair stays dropped: "härän" finds no broad bean and "härkä" no "Härän..." food', async () => {
      expect(await names("härän")).toEqual(["Häränlihahöystö, punaviini, ruskea kastike"]);
      const ox = await everyMatch(suite, reader.id, "härkä");
      expect(ox).toContain("Papu, härkäpapu, tuore");
      expect(ox.filter((n) => n.startsWith("Härän"))).toEqual([]);
    });

    it('a form must start a word: "sika" does not find the "sian" inside "Russian"', async () => {
      const soup = "Kalakeitto, venäläinen, seljanka";
      expect(await names("russian")).toContain(soup);
      expect(await everyMatch(suite, reader.id, "sika")).not.toContain(soup);
    });

    it('a form applies to the whole word only: "naut" finds no "naudan" food', async () => {
      const found = await everyMatch(suite, reader.id, "naut");
      expect(found).toContain("Jauheliha, sika-nauta");
      expect(found.filter((n) => !/naut/i.test(n))).toEqual([]);
      expect(await everyMatch(suite, reader.id, "nauta")).toContain(BEEF_MINCE);
    });
  });

  describe("basic and common foods first", () => {
    it('"rahka": the plain quark, then its low-lactose twin', async () => {
      expect((await names("rahka")).slice(0, 2)).toEqual([PLAIN_QUARK, `${PLAIN_QUARK}, vl`]);
    });

    it('"maito": light, fat-free, whole, and goat milk outside the first 8', async () => {
      const found = await names("maito");
      expect(found.slice(0, 3)).toEqual([
        "Maito, kevytmaito, d-vitamiinia 1 ug",
        "Maito, rasvaton, d-vitamiinia 1 ug",
        "Maito, täysmaito, d-vitamiinia 1 ug",
      ]);
      expect(at(found, "Maito, kutunmaito, vuohenmaito")).toBeGreaterThan(8);
    });

    it('"egg": the shelled egg first, the quail egg after its organic and omega kinds', async () => {
      const found = await names("egg");
      expect(found[0]).toBe(EGG);
      const quail = at(found, "Viiriäisen muna");
      expect(quail).toBeGreaterThan(5);
      for (const egg of [EGG, "Kananmuna, kuoreton, luomu", "Kananmuna, omega, kuoreton"]) {
        expect(at(found, egg)).toBeGreaterThan(0);
        expect(at(found, egg)).toBeLessThan(quail);
      }
    });

    it('"rice": porridge rice first, rice chocolate outside the first 8', async () => {
      const found = await names("rice");
      expect(found[0]).toBe("Riisi puuroutuva");
      expect(at(found, "Riisisuklaa")).toBeGreaterThan(8);
    });

    it('"omena": the average apple first, and dried apple 4th, a pinned limit of the rule', async () => {
      const found = await names("omena");
      expect(found[0]).toBe("Omena, keskiarvo, punnittu kuorineen");
      // No apple a person eats fresh stands between: recipe uses put the dried apple here. A change that moves it
      // lower is welcome, and then this figure changes with it.
      expect(at(found, "Omena, kuivattu")).toBe(4);
    });

    it('"peruna": the common potato first, boiled potato in the first 8', async () => {
      const found = await names("peruna");
      expect(found[0]).toBe("Peruna, vanha, kuorittu");
      expect(at(found, "Peruna, kuorittu, keitetty, suolaton")).toBeGreaterThan(0);
      expect(at(found, "Peruna, kuorittu, keitetty, suolaton")).toBeLessThanOrEqual(8);
    });

    it('"kaura": oat flakes in the first 3', async () => {
      const found = await names("kaura");
      expect(at(found, "Kaurahiutale")).toBeGreaterThan(0);
      expect(at(found, "Kaurahiutale")).toBeLessThanOrEqual(3);
    });

    it('"muna": the shelled egg first, and the aubergine after every "Kananmuna, ..." food', async () => {
      const found = await everyMatch(suite, reader.id, "muna");
      expect(found[0]).toBe(EGG);
      const aubergine = at(found, "Munakoiso");
      const eggs = SAMPLE.filter((f) => f.name.startsWith("Kananmuna,"));
      expect(eggs.length).toBeGreaterThan(8);
      for (const egg of eggs) expect(at(found, egg.name)).toBeLessThan(aubergine);
    });

    it('"kana": chicken first, the carrot 4th and no egg in the first 8, the known limit of the compound rule', async () => {
      const found = await names("kana");
      expect(found[0]).toBe("Kana");
      expect(at(found, "Porkkana")).toBe(4);
      expect(found.slice(0, 8).filter((n) => n.startsWith("Kananmuna"))).toEqual([]);
    });

    it("a one-food dish is a basic food, and a dish of two foods is not", async () => {
      const before = await names("kana");
      expect(at(before, BOILED_CHICKEN)).toBeLessThan(at(before, "Porkkana"));
      await suite.client.query("UPDATE foods SET fineli_recipe_foods = 2 WHERE name = $1", [BOILED_CHICKEN]);
      try {
        const after = await names("kana");
        expect(at(after, BOILED_CHICKEN)).toBeGreaterThan(at(after, "Porkkana"));
      } finally {
        await restoreCounts(suite.client);
      }
    });
  });

  describe("dishes", () => {
    it('recipe uses never order dishes: "leipä" keeps the 51 % rye bread before a toast seven recipes use', async () => {
      const found = await names("leipä");
      const toast = SAMPLE.find((f) => f.name === "Paahtoleipä, vehnä, vesi")!;
      const rye = SAMPLE.find((f) => f.name === RYE_BREAD)!;
      expect(toast.recipeUses).toBeGreaterThan(rye.recipeUses);
      expect(at(found, RYE_BREAD)).toBe(2);
      expect(at(found, toast.name)).toBeGreaterThan(2);
      expect((await names("ruisleipä"))[0]).toBe(RYE_BREAD);
    });

    it('the accepted limits: a one-flour flatbread leads "leipä", a yoghurt with muesli leads "mysli"', async () => {
      expect((await names("leipä"))[0]).toBe(FLATBREAD);
      const muesli = await names("mysli");
      expect(muesli[0]).toBe("Jogurtti, luonnonjogurtti ja marjamysli, a+, rasvaa 3,5 %, vl, d-vit 0,9 ug");
      expect(muesli[1]).toBe("Mysli, perus");
    });

    it('"soup" by English names: meal-replacement soup powders first, the first "Peasoup" after them in the first 20', async () => {
      const found = (await searchAs(suite, english, "soup")).foods.map((f) => f.name).slice(0, 20);
      expect(found[0]).toBe("Meal replacement, soup powder, average");
      const peasoup = found.findIndex((n) => n.startsWith("Peasoup"));
      const lastPowder = found.map((n) => n.startsWith("Meal replacement")).lastIndexOf(true);
      expect(peasoup).toBeGreaterThan(lastPowder);
    });

    it('the seven groups in order, on "leipä"', async () => {
      const found = await everyMatch(suite, reader.id, "leipä");
      const order = [
        FLATBREAD, // a basic food named by the word
        RYE_BREAD, // a dish named by it
        "Juusto, leipäjuusto, rasvaa 17-23 %", // a basic food where it starts a word
        "Vaalea leipä, juustopatonki", // a dish with it later in the name
        "Leipärasva, keskiarvo", // a dish where it starts a word
        "Jauho, hiivaleipävehnäjauho", // a basic food with it inside a word
        "Voileipäkakku, kasvis", // a dish with it inside a word
      ].map((n) => at(found, n));
      expect(order.every((position) => position > 0)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(new Set(order).size).toBe(7);
    });

    it('fewer parts in the name come before a shorter name: two dishes named by "leipä"', async () => {
      const found = await names("leipä");
      const twoParts = "Ruisleipä, tumma täysjyväleipä vähäsuolainen";
      const threeParts = "Paahtoleipä, vehnä, vesi";
      expect(twoParts.length).toBeGreaterThan(threeParts.length);
      expect(at(found, twoParts)).toBeGreaterThan(0);
      expect(at(found, threeParts)).toBeGreaterThan(at(found, twoParts));
    });
  });

  it('accents need not be typed: "jaatelo" finds the ice creams', async () => {
    expect((await names("jaatelo")).slice(0, 2)).toEqual(["Jäätelö, kermajäätelö", "Jäätelö, maitojäätelö"]);
  });

  it("searches by the first eight words and ignores a ninth", async () => {
    const { searchQuery, searchWords } = await import("../foodSearch.js");
    const yoghurt = "Jogurtti, luonnonjogurtti ja marjamysli, a+, rasvaa 3,5 %, vl, d-vit 0,9 ug";
    const eight = "jogurtti luonnonjogurtti ja marjamysli rasvaa vl vit ug";
    // No food holds the ninth word, so an answer that read it would be empty.
    const nine = `${eight} qzqz`;
    expect(await searchAs(suite, reader, "qzqz")).toEqual({ foods: [], near: [] });
    const answer = await searchAs(suite, reader, nine);
    expect(answer.foods.map((f) => f.name)).toEqual([yoghurt]);
    expect(answer).toEqual(await searchAs(suite, reader, eight));
    // The statement is the eight-word one: a longer text adds no pattern to it.
    const paramsOf = async (q: string) =>
      searchQuery(suite.db, reader.id, await searchWords(suite.db, q), 30).toSQL().params;
    expect(await paramsOf(nine)).toEqual(await paramsOf(eight));
  });

  it("a database not imported since the recipe counts came: dry pasta still first, goat milk first, no boiled chicken in six", async () => {
    await suite.client.query("UPDATE foods SET fineli_recipe_uses = 0, fineli_recipe_foods = NULL");
    try {
      expect((await names("spagetti"))[0]).toBe(DRY_PASTA);
      expect((await names("maito"))[0]).toBe("Maito, kutunmaito, vuohenmaito");
      const chicken = await names("kana");
      expect(chicken.slice(0, 2)).toEqual(["Kana", "Porkkana"]);
      expect(chicken.slice(0, 6).filter((n) => n.startsWith("Kana, keitetty"))).toEqual([]);
    } finally {
      await restoreCounts(suite.client);
    }
    expect((await names("maito"))[0]).toBe("Maito, kevytmaito, d-vitamiinia 1 ug");
  });

  it("serves a short word and a word with a form from the trigram index at 10,000 rows, quickly", async () => {
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
    for (const word of ["rah", "nauta"]) {
      const query = searchQuery(suite.db, reader.id, [word], 30).toSQL();
      const plan = await suite.client.query(`EXPLAIN ${query.sql}`, query.params);
      expect(plan.rows.map((r) => r["QUERY PLAN"]).join("\n")).toContain("foods_search_all_trgm");
    }

    const times: number[] = [];
    for (let i = 0; i < 25; i++) {
      const start = performance.now();
      await searchAs(suite, reader, "rahka");
      times.push(performance.now() - start);
    }
    times.sort((x, y) => x - y);
    expect(times[12]).toBeLessThan(150);
  });
});
