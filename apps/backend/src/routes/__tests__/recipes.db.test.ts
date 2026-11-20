import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { daysApi } from "../../__tests__/support/daysApi.js";
import { counted, editOf, notCounted, recipeBody, recipesApi } from "../../__tests__/support/recipesApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Recipes on a real Postgres: a recipe's figures come from its lines' foods,
// a line's refusal names the line, and a recipe is archived, starred and
// deleted as the screen does it.

const OWN = { energyKcal: 100, proteinG: 10, carbsG: 0, fatG: 0 };

await describeWithDb("recipes", (suite) => {
  const d = daysApi(suite);
  const r = recipesApi(d);
  const count = async (table: string, userId: string) =>
    (await suite.client.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [userId])).rows[0]
      .n as number;

  /** A user with a Fineli food (59.31 kcal and 10.5 g protein per 100 g, a 200 g portion) and an own food with a 150 g tub. */
  async function cook(): Promise<{
    user: ApiUser;
    fineli: { id: string; portionId: string };
    own: string;
    tub: string;
  }> {
    const user = await signUp(suite.client);
    const fineli = await d.fineliFood();
    const own = await d.ownFood(user, OWN, "Oma rahka");
    const tub = await d.ownPortion(user, own, 150);
    return { user, fineli, own, tub };
  }

  describe("creating a recipe", () => {
    it("computes its figures from its counted lines, turns a portion count into grams, and keeps every part", async () => {
      const { user, fineli, own, tub } = await cook();
      const body = recipeBody(
        [
          counted(fineli.id, { grams: 300 }, { written: { amount: 1, unit: "can" }, note: " chopped " }),
          counted(own, { portionId: tub, count: 2 }),
          notCounted("Salt"),
        ],
        { timeMinutes: 25, steps: ["Fry.", "Bake."], notes: "Serve hot.", tags: ["Quick", "Brunch"] },
      );
      const res = await r.create(user, body);
      expect(res.status).toBe(201);
      // 300 g at 59.31 kcal and 10.5 g, and 300 g at 100 kcal and 10 g: 477.93 kcal and 61.5 g, halved.
      expect(res.body).toMatchObject({
        id: body.id,
        name: "Shakshuka",
        servings: 2,
        timeMinutes: 25,
        tags: ["Brunch", "Quick"],
        favourite: false,
        archived: false,
        deleted: false,
        basis: { energyKcal: 238.97, proteinG: 30.75, carbsG: 5.4, fatG: 0.3 },
        perServing: { energyKcal: 239, proteinG: 30.8, carbsG: 5.4, fatG: 0.3 },
        whole: { energyKcal: 478, proteinG: 61.5, carbsG: 10.8, fatG: 0.6 },
        lastPutOn: null,
        lastServings: null,
        imageId: null,
        foodsGone: false,
        steps: ["Fry.", "Bake."],
        notes: "Serve hot.",
      });
      expect(res.body.lines).toEqual([
        {
          id: body.lines[0].id,
          position: 0,
          counted: true,
          food: {
            id: fineli.id,
            name: expect.stringMatching(/^Rahka/),
            source: "fineli",
            per100g: { energyKcal: 59.31, proteinG: 10.5, carbsG: 3.6, fatG: 0.2 },
            retired: false,
            deleted: false,
          },
          name: null,
          grams: 300,
          portion: null,
          written: { amount: 1, unit: "can" },
          note: "chopped",
        },
        expect.objectContaining({
          id: body.lines[1].id,
          position: 1,
          grams: 300,
          portion: { id: tub, unit: null, name: "tub", count: 2 },
        }),
        expect.objectContaining({ position: 2, counted: false, food: null, name: "Salt", grams: null }),
      ]);
      expect((await r.get(user, body.id)).body).toEqual(res.body);
    });

    it("answers a repeat with the same id 200 and ignores its body, and another user's id 409", async () => {
      const { user, fineli } = await cook();
      const other = await signUp(suite.client);
      const body = recipeBody([counted(fineli.id, { grams: 100 })]);
      await r.created(user, body);
      const again = await r.create(user, { ...body, name: "Other", lines: [notCounted()] });
      expect([again.status, again.body.name]).toEqual([200, "Shakshuka"]);
      const taken = await r.create(other, { ...body, lines: [notCounted()] });
      expect([taken.status, taken.body.code]).toEqual([409, "recipe_id_taken"]);
    });

    it("answers a line id another recipe holds 409 ingredient_id_taken, and writes nothing", async () => {
      const { user, fineli } = await cook();
      const other = await signUp(suite.client);
      const line = counted(fineli.id, { grams: 100 });
      await r.created(user, recipeBody([line]));
      const res = await r.create(other, recipeBody([{ ...line }]));
      expect([res.status, res.body.code]).toEqual([409, "ingredient_id_taken"]);
      expect(await count("recipes", other.id)).toBe(0);
    });

    it("refuses a line on another user's own food 404 at that line", async () => {
      const { user } = await cook();
      const other = await cook();
      const res = await r.create(user, recipeBody([notCounted(), counted(other.own, { grams: 100 })]));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: expect.any(String), code: "food_not_found", line: 1 });
      expect(await count("recipes", user.id)).toBe(0);
    });

    it("answers a portion that is not the line's food's at its line: line 3 answers line 3", async () => {
      const { user, fineli, tub } = await cook();
      const lines = [
        notCounted("Salt"),
        notCounted("Water"),
        counted(fineli.id, { grams: 100 }),
        counted(fineli.id, { portionId: tub, count: 1 }),
      ];
      const res = await r.create(user, recipeBody(lines));
      expect([res.status, res.body.code, res.body.line]).toEqual([404, "portion_not_found", 3]);
    });

    it("answers a refusal the body's schema finds at its line too", async () => {
      const { user, fineli } = await cook();
      const res = await r.create(user, recipeBody([notCounted(), counted(fineli.id, { grams: 5000.5 })]));
      expect([res.status, res.body.code, res.body.line]).toEqual([400, "entry_grams_invalid", 1]);
    });

    it("refuses the 61st line and the 11th tag", async () => {
      const { user } = await cook();
      const lines = Array.from({ length: 61 }, () => notCounted());
      expect((await r.create(user, recipeBody(lines))).body.code).toBe("recipe_lines_too_many");
      const tags = Array.from({ length: 11 }, (_, i) => `Tag ${i}`);
      expect((await r.create(user, recipeBody([notCounted()], { tags }))).body.code).toBe("tags_too_many");
      expect((await r.create(user, recipeBody(lines.slice(0, 60), { tags: tags.slice(0, 10) }))).status).toBe(201);
    });

    it("refuses a serving of more than 10000 kcal, its macros well under the cap", async () => {
      const user = await signUp(suite.client);
      const dense = await d.ownFood(user, { energyKcal: 900, proteinG: 0, carbsG: 0, fatG: 0 }, "Tiivis");
      const big = await r.create(user, recipeBody([counted(dense, { grams: 2300 })], { servings: 2 }));
      // 2300 g at 900 kcal is 20700 kcal, 10350 a serving.
      expect([big.status, big.body.code]).toEqual([400, "recipe_serving_too_large"]);
      expect((await r.create(user, recipeBody([counted(dense, { grams: 2300 })], { servings: 3 }))).status).toBe(201);
    });

    it.each(["proteinG", "carbsG", "fatG"] as const)(
      "refuses a serving of more than 1000 g of %s, its energy well under the cap",
      async (macro) => {
        const user = await signUp(suite.client);
        const food = await d.ownFood(user, { energyKcal: 100, proteinG: 0, carbsG: 0, fatG: 0, [macro]: 100 }, "Makro");
        // 2100 g at 100 g a 100 g is 2100 g, 1050 a serving, at 1050 kcal.
        const big = await r.create(user, recipeBody([counted(food, { grams: 2100 })], { servings: 2 }));
        expect([big.status, big.body.code]).toEqual([400, "recipe_serving_too_large"]);
        expect((await r.create(user, recipeBody([counted(food, { grams: 2100 })], { servings: 3 }))).status).toBe(201);
      },
    );

    it("keeps a tag once when the database folds two spellings alike that JavaScript keeps apart", async () => {
      const { user } = await cook();
      // On a UTF-8 database lower('İ') is 'i', while JavaScript's is 'i' with a combining dot.
      const body = recipeBody([notCounted()], { tags: ["İ", "i", "Quick"] });
      const res = await r.create(user, body);
      expect([res.status, res.body.tags]).toEqual([201, ["İ", "Quick"]]);
      const edit = await r.put(user, body.id, { ...editOf(body), tags: ["i", "İ"] });
      expect([edit.status, edit.body.tags]).toEqual([200, ["i"]]);
    });

    it("counts tags as sent: eleven with a repeat among them are refused", async () => {
      const { user } = await cook();
      const tags = [...Array.from({ length: 10 }, (_, i) => `Tag ${i}`), "tag 0"];
      expect((await r.create(user, recipeBody([notCounted()], { tags }))).body.code).toBe("tags_too_many");
    });
  });

  describe("a food hidden since", () => {
    it("is refused on a new line and kept on a line the recipe already has", async () => {
      const { user, own } = await cook();
      const body = recipeBody([counted(own, { grams: 200 })]);
      await r.created(user, body);
      const deleted = await d
        .api()
        .delete(d.v1(`/foods/${own}`))
        .set(user.auth);
      expect(deleted.status).toBe(204);

      const page = (await r.get(user, body.id)).body;
      expect(page.lines[0].food).toMatchObject({ id: own, deleted: true });
      expect(page).toMatchObject({ foodsGone: true, perServing: { energyKcal: 100, proteinG: 10 } });

      const fresh = await r.create(user, recipeBody([notCounted(), counted(own, { grams: 100 })]));
      expect([fresh.status, fresh.body.code, fresh.body.line]).toEqual([404, "food_not_found", 1]);

      const edit = editOf({ ...body, name: "Renamed" });
      const kept = await r.put(user, body.id, edit);
      expect(kept.status).toBe(200);
      expect(kept.body).toMatchObject({ name: "Renamed", lines: [{ id: body.lines[0].id, grams: 200 }] });
    });
  });

  describe("editing a recipe", () => {
    it("keeps each line's id, takes new lines and tags, and answers an edit of nothing unchanged", async () => {
      const { user, fineli, own } = await cook();
      const body = recipeBody([counted(fineli.id, { grams: 100 }), notCounted()], { tags: ["Brunch"] });
      await r.created(user, body);
      const whole = editOf(body);
      const before = (await r.get(user, body.id)).body;
      expect((await r.put(user, body.id, whole)).body).toEqual(before);

      const added = counted(own, { grams: 50 });
      const edit = { ...whole, servings: 1, lines: [added, body.lines[0], body.lines[1]], tags: ["Quick"] };
      const res = await r.put(user, body.id, edit);
      expect(res.status).toBe(200);
      expect(res.body.lines.map((l: { id: string; position: number }) => [l.id, l.position])).toEqual([
        [added.id, 0],
        [body.lines[0].id, 1],
        [body.lines[1].id, 2],
      ]);
      expect(res.body).toMatchObject({ servings: 1, tags: ["Quick"], perServing: { energyKcal: 109, proteinG: 15.5 } });
    });

    it("answers an edit of nothing unchanged even after a food on it was edited past the serving cap", async () => {
      const user = await signUp(suite.client);
      const dense = await d.ownFood(user, { energyKcal: 300, proteinG: 45, carbsG: 0, fatG: 0 }, "Tiivis");
      const body = recipeBody([counted(dense, { grams: 4000 })], { servings: 2 });
      await r.created(user, body);
      // 900 g of protein a serving at the save, 1100 g once the food reads 55 g a 100 g.
      await suite.client.query("UPDATE foods SET protein_g = 55 WHERE id = $1", [dense]);
      const before = (await r.get(user, body.id)).body;
      const same = await r.put(user, body.id, editOf(body));
      expect([same.status, same.body]).toEqual([200, before]);
      const changed = await r.put(user, body.id, { ...editOf(body), name: "Tiivis keitto" });
      expect([changed.status, changed.body.code]).toEqual([400, "recipe_serving_too_large"]);
    });

    describe("a line sent again under an id the recipe does not hold", () => {
      /** The line with a new id, as an editor or an assistant sends a line it did not read. */
      const renewed = <L extends { id: string }>(line: L): L => ({ ...line, id: randomUUID() });
      const idsOf = (res: { body: { lines: { id: string }[] } }) => res.body.lines.map((l) => l.id);
      const updatedAt = async (id: string) =>
        (await suite.client.query("SELECT updated_at FROM recipes WHERE id = $1", [id])).rows[0].updated_at as Date;

      it("keeps the line it equals, so a whole recipe sent again that way writes nothing", async () => {
        const { user, fineli, own, tub } = await cook();
        const body = recipeBody([
          counted(fineli.id, { grams: 100 }, { written: { amount: 1, unit: "can" }, note: "chopped" }),
          counted(own, { portionId: tub, count: 2 }),
          notCounted("Salt"),
        ]);
        await r.created(user, body);
        const before = (await r.get(user, body.id)).body;
        const at = await updatedAt(body.id);
        const res = await r.put(user, body.id, { ...editOf(body), lines: body.lines.map(renewed) });
        expect([res.status, res.body]).toEqual([200, before]);
        expect(await updatedAt(body.id)).toEqual(at);
      });

      it("keeps each line's id in a new order", async () => {
        const { user, fineli, own } = await cook();
        const body = recipeBody([counted(fineli.id, { grams: 100 }), counted(own, { grams: 50 }), notCounted()]);
        await r.created(user, body);
        const [a, b, c] = body.lines;
        const res = await r.put(user, body.id, { ...editOf(body), lines: [c, a, b].map(renewed) });
        expect(idsOf(res)).toEqual([c.id, a.id, b.id]);
      });

      it("keeps the lines it equals beside real changes, and takes the rest as new", async () => {
        const { user, fineli, own } = await cook();
        const body = recipeBody([counted(fineli.id, { grams: 100 }), counted(own, { grams: 50 }), notCounted()]);
        await r.created(user, body);
        const [a, b] = body.lines;
        const differs = renewed({ ...b, amount: { grams: 60 } });
        const res = await r.put(user, body.id, { ...editOf(body), lines: [renewed(a), differs] });
        expect(idsOf(res)).toEqual([a.id, differs.id]);
        expect(res.body.lines[1].grams).toBe(60);
      });

      it("refuses another recipe's line id on a line that differs, and keeps this recipe's id on one that is identical", async () => {
        const { user, fineli, own } = await cook();
        const other = await signUp(suite.client);
        const theirs = recipeBody([notCounted("Pepper")]);
        await r.created(other, theirs);
        const mine = recipeBody([notCounted("Pepper")]);
        await r.created(user, mine);
        const body = recipeBody([counted(fineli.id, { grams: 100 }), counted(own, { grams: 50 })]);
        await r.created(user, body);
        const [a, b] = body.lines;
        const before = (await r.get(user, body.id)).body;
        for (const foreign of [theirs.lines[0].id, mine.lines[0].id]) {
          const differs = await r.put(user, body.id, {
            ...editOf(body),
            lines: [a, { ...b, id: foreign, amount: { grams: 60 } }],
          });
          expect([differs.status, differs.body.code]).toEqual([409, "ingredient_id_taken"]);
          expect((await r.get(user, body.id)).body).toEqual(before);
          const same = await r.put(user, body.id, { ...editOf(body), lines: [a, { ...b, id: foreign }] });
          expect([same.status, idsOf(same)]).toEqual([200, [a.id, b.id]]);
        }
        expect((await r.get(other, theirs.id)).body.lines[0].id).toBe(theirs.lines[0].id);
      });

      it("pairs two identical lines one to one, in order", async () => {
        const { user, fineli } = await cook();
        const body = recipeBody([notCounted("Salt"), counted(fineli.id, { grams: 100 }), notCounted("Salt")]);
        await r.created(user, body);
        const [s1, f, s2] = body.lines;
        const both = await r.put(user, body.id, { ...editOf(body), lines: body.lines.map(renewed) });
        expect(idsOf(both)).toEqual([s1.id, f.id, s2.id]);
        const one = await r.put(user, body.id, { ...editOf(body), lines: [f, renewed(s2)] });
        expect(idsOf(one)).toEqual([f.id, s1.id]);
      });
    });

    it("answers another user's recipe, an unknown one and a malformed id 404", async () => {
      const { user, fineli } = await cook();
      const other = await signUp(suite.client);
      const body = recipeBody([counted(fineli.id, { grams: 100 })]);
      await r.created(user, body);
      const whole = editOf(body);
      for (const [who, id] of [
        [other, body.id],
        [user, randomUUID()],
        [user, "nope"],
      ] as const) {
        const res = await r.put(who, id, whole);
        expect([res.status, res.body.code]).toEqual([404, "recipe_not_found"]);
        expect((await r.get(who, id)).status).toBe(404);
      }
    });
  });

  describe("archiving, starring and deleting", () => {
    it("archives and restores, marks and unmarks a favourite, each idempotent", async () => {
      const { user, fineli } = await cook();
      const body = recipeBody([counted(fineli.id, { grams: 100 })]);
      await r.created(user, body);
      expect((await r.flag(user, body.id, "archived", true)).status).toBe(204);
      expect((await r.flag(user, body.id, "archived", true)).status).toBe(204);
      expect((await r.get(user, body.id)).body.archived).toBe(true);
      expect((await r.flag(user, body.id, "favourite", true)).status).toBe(204);
      expect((await r.get(user, body.id)).body.favourite).toBe(true);
      await r.flag(user, body.id, "archived", false);
      await r.flag(user, body.id, "favourite", false);
      expect((await r.get(user, body.id)).body).toMatchObject({ archived: false, favourite: false });
      const other = await signUp(suite.client);
      expect((await r.flag(other, body.id, "favourite", true)).status).toBe(404);
    });

    it("deletes a recipe with its lines and tags", async () => {
      const { user, fineli } = await cook();
      const body = recipeBody([counted(fineli.id, { grams: 100 }), notCounted()], { tags: ["Brunch"] });
      await r.created(user, body);
      expect((await r.remove(user, body.id)).status).toBe(204);
      expect((await r.get(user, body.id)).status).toBe(404);
      expect([await count("recipes", user.id), await count("recipe_ingredients", user.id)]).toEqual([0, 0]);
      expect(await count("recipe_tags", user.id)).toBe(0);
      expect((await r.remove(user, body.id)).status).toBe(404);
    });
  });

  describe("previewing a draft", () => {
    it("answers every line's grams and refusal, no figures while one is refused, and writes nothing", async () => {
      const { user, fineli, tub } = await cook();
      const lines = [
        { counted: true, foodId: fineli.id, amount: { portionId: fineli.portionId, count: 2 } },
        { counted: true, foodId: fineli.id, amount: { portionId: tub, count: 1 } },
        { counted: false, name: "Salt" },
      ];
      const res = await r.preview(user, { servings: 2, lines });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        lines: [
          {
            index: 0,
            foodName: expect.stringMatching(/^Rahka/),
            grams: 400,
            portion: { id: fineli.portionId, unit: "PORTM", name: null, count: 2 },
            refusal: null,
          },
          {
            index: 1,
            foodName: expect.stringMatching(/^Rahka/),
            grams: null,
            portion: null,
            refusal: "portion_not_found",
          },
          { index: 2, foodName: null, grams: null, portion: null, refusal: null },
        ],
        perServing: null,
        whole: null,
        basis: null,
        refusal: null,
      });
      expect(await count("recipes", user.id)).toBe(0);
    });

    it("answers the figures a save then stores, and a serving too large as the draft's refusal", async () => {
      const { user, fineli, own, tub } = await cook();
      const lines = [counted(fineli.id, { grams: 300 }), counted(own, { portionId: tub, count: 2 }), notCounted()];
      const preview = (await r.preview(user, { servings: 2, lines })).body;
      const saved = await r.created(user, recipeBody(lines));
      expect({ perServing: preview.perServing, whole: preview.whole, basis: preview.basis }).toEqual({
        perServing: saved.perServing,
        whole: saved.whole,
        basis: saved.basis,
      });
      const big = (
        await r.preview(user, { servings: 1, lines: [counted(own, { grams: 5000 }), counted(own, { grams: 5000 })] })
      ).body;
      expect([big.refusal, big.perServing]).toEqual([null, { energyKcal: 10000, proteinG: 1000, carbsG: 0, fatG: 0 }]);
      const over = (
        await r.preview(user, {
          servings: 1,
          lines: [counted(own, { grams: 5000 }), counted(own, { grams: 5000 }), counted(own, { grams: 1 })],
        })
      ).body;
      expect([over.refusal, over.perServing]).toEqual(["recipe_serving_too_large", null]);
    });
  });

  describe("reading recipes", () => {
    it("lists the active ones with archived=false, the archived ones with true, and filters by one tag or two", async () => {
      const { user, fineli } = await cook();
      const make = async (name: string, tags: string[]) =>
        (await r.created(user, recipeBody([counted(fineli.id, { grams: 100 })], { name, tags }))).id as string;
      await make("Shakshuka", ["Brunch", "Quick"]);
      await make("Lohikeitto", ["Brunch"]);
      const old = await make("Puuro", []);
      await r.flag(user, old, "archived", true);
      const names = async (query: object) =>
        ((await r.list(user, query)).body.recipes as { name: string }[]).map((x) => x.name);
      expect(await names({ archived: "false" })).toEqual(["Lohikeitto", "Shakshuka"]);
      expect(await names({})).toEqual(["Lohikeitto", "Shakshuka"]);
      expect(await names({ archived: "true" })).toEqual(["Puuro"]);
      expect(await names({ tags: "Brunch" })).toEqual(["Lohikeitto", "Shakshuka"]);
      expect(await names({ tags: ["Brunch", "Quick"] })).toEqual(["Shakshuka"]);
      expect((await r.list(user, { archived: "yes" })).status).toBe(400);
      const [summary] = (await r.list(user, { q: "shak" })).body.recipes;
      expect(Object.keys(summary).sort()).toEqual(
        [
          "id",
          "name",
          "servings",
          "timeMinutes",
          "tags",
          "favourite",
          "archived",
          "perServing",
          "basis",
          "lastPutOn",
          "lastServings",
          "imageId",
          "foodsGone",
        ].sort(),
      );
      expect((await r.list(await signUp(suite.client))).body.recipes).toEqual([]);
    });

    it("answers a recipe at another number of servings, its amounts scaled and its figures from its basis", async () => {
      const { user, fineli, own, tub } = await cook();
      const body = recipeBody([
        counted(fineli.id, { grams: 300 }, { written: { amount: 1, unit: "can" } }),
        counted(own, { portionId: tub, count: 2 }),
      ]);
      await r.created(user, body);
      const res = (await r.get(user, body.id, { servings: 3 })).body;
      expect(res.scaled).toEqual({
        servings: 3,
        lines: [
          expect.objectContaining({ grams: 450, written: { amount: 1.5, unit: "can" } }),
          expect.objectContaining({ grams: 450, portion: expect.objectContaining({ count: 3 }) }),
        ],
        figures: { energyKcal: 717, proteinG: 92.3, carbsG: 16.2, fatG: 0.9 },
      });
      expect((await r.get(user, body.id, { servings: 0 })).status).toBe(400);
    });
  });
});
