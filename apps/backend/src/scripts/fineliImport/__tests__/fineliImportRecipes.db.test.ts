import { beforeEach, describe, expect, it } from "@jest/globals";
import path from "node:path";
import request from "supertest";
import { signUp } from "../../../__tests__/support/apiUser.js";
import { describeWithDb } from "../../../db/__tests__/support/throwawayDb.js";
import type { RecipeCountsTable } from "../recipeCounts.js";

// The recipe counts through the import, on a real database. Release A holds a
// recipe file, release B the same file without the one recipe that uses the
// turkey (752), and release-utf8 is release A's foods with no recipe file
// (fixtures/README.md).

const FIXTURES = path.resolve("src/scripts/fineliImport/__tests__/fixtures");
const A = path.join(FIXTURES, "release-a");
const B = path.join(FIXTURES, "release-b");
const NO_RECIPE_FILE = path.join(FIXTURES, "release-utf8");
const T1 = new Date("2026-11-01T10:00:00Z");
const T2 = new Date("2026-11-02T10:00:00Z");
const SKIMMED_MILK = 606;
const EGG = 858;
const TURKEY = 752;
const DISH = 31924;

/** Counts for the egg, for the dish, and for an id no fixture release has. */
const SMALL_TABLE: RecipeCountsTable = {
  release: "18.0",
  rows: [
    [EGG, 7, null],
    [DISH, 0, 3],
    [424242, 2, null],
  ],
};

type Mod = typeof import("../applyRelease.js") &
  typeof import("../readRelease.js") &
  typeof import("../cli.js") &
  typeof import("../report.js");

await describeWithDb("fineliImportRecipes", (suite) => {
  const mod = {} as Mod;
  const args = (dir: string) => ({ dir, dryRun: false, allowRetire: false, allowRename: false });
  /** Fineli id to [uses, foods, updated_at] of every Fineli food. */
  const stored = async () => {
    const { rows } = await suite.client.query(
      "SELECT fineli_id, fineli_recipe_uses AS uses, fineli_recipe_foods AS foods, updated_at FROM foods WHERE source = 'fineli' ORDER BY fineli_id",
    );
    return new Map(rows.map((r) => [r.fineli_id as number, { uses: r.uses, foods: r.foods, updatedAt: r.updated_at }]));
  };
  const countsOf = async (fineliId: number) => {
    const row = (await stored()).get(fineliId);
    return row && { uses: row.uses, foods: row.foods };
  };

  beforeEach(async () => {
    Object.assign(
      mod,
      await import("../applyRelease.js"),
      await import("../readRelease.js"),
      await import("../cli.js"),
      await import("../report.js"),
    );
    await suite.client.query("TRUNCATE foods CASCADE");
  });

  describe("a release with a recipe file", () => {
    it("stores each food's counts, and 0 and NULL for a food no recipe names", async () => {
      const { result } = await mod.runImport(suite.db, args(A), T1);
      expect(await countsOf(SKIMMED_MILK)).toEqual({ uses: 5, foods: null });
      expect(await countsOf(EGG)).toEqual({ uses: 4, foods: null });
      expect(await countsOf(604)).toEqual({ uses: 0, foods: null });
      // Nothing was stored before, so no stored count changed.
      expect(result.recipeCountsChanged).toBe(0);
    });

    it("stores a recipe's food count", async () => {
      const release = mod.readRelease(A);
      const withRecipe = {
        ...release,
        foods: release.foods.map((f) => (f.fineliId === DISH ? { ...f, recipeFoods: 1 } : f)),
      };
      await mod.applyRelease(suite.db, withRecipe, { allowRetire: false, allowRename: false, dryRun: false, now: T1 });
      expect(await countsOf(DISH)).toEqual({ uses: 0, foods: 1 });
    });

    it("changes nothing on a second run", async () => {
      await mod.runImport(suite.db, args(A), T1);
      const before = await stored();
      const { result } = await mod.runImport(suite.db, args(A), T2);
      expect(result.foods).toEqual({ inserted: 0, updated: 0, unchanged: 16, revived: 0, archived: 0 });
      expect(result.recipeCountsChanged).toBe(0);
      expect(await stored()).toEqual(before);
    });

    it("reports a food whose count changed as changed, not renamed", async () => {
      await mod.runImport(suite.db, args(A), T1);
      expect(await countsOf(TURKEY)).toEqual({ uses: 1, foods: null });
      const { release, result } = await mod.runImport(suite.db, args(B), T2);
      expect((await stored()).get(TURKEY)).toEqual({ uses: 0, foods: null, updatedAt: T2 });
      expect(result.recipeCountsChanged).toBe(1);
      // Changed: the banana's protein, the renamed oats, and the turkey's count.
      expect(result.foods.updated).toBe(3);
      expect(result.renamed.map((r) => r.fineliId)).toEqual([153]);
      expect(mod.formatReport(B, release, result)).toContain("Stored counts changed: 1");
    });

    it("counts a food that comes back with a new count, though it is counted as back and not as changed", async () => {
      await mod.runImport(suite.db, args(A), T1);
      // Release B drops "(arc)" from 572, a margarine, and the turkey's one recipe. Here the margarine also gets a use.
      const release = mod.readRelease(B);
      const edited = {
        ...release,
        foods: release.foods.map((f) => (f.fineliId === 572 ? { ...f, recipeUses: 3 } : f)),
      };
      const result = await mod.applyRelease(suite.db, edited, {
        allowRetire: false,
        allowRename: false,
        dryRun: false,
        now: T2,
      });
      expect(result.foods.revived).toBe(1);
      expect(result.foods.updated).toBe(3);
      // The turkey and the margarine.
      expect(result.recipeCountsChanged).toBe(2);
      expect(await countsOf(572)).toEqual({ uses: 3, foods: null });
    });

    it("ignores the counts it is handed", async () => {
      await mod.runImport(suite.db, args(A), T1, SMALL_TABLE);
      expect(await countsOf(EGG)).toEqual({ uses: 4, foods: null });
      expect(await countsOf(DISH)).toEqual({ uses: 0, foods: null });
    });

    it("refuses a negative count in the database", async () => {
      await mod.runImport(suite.db, args(A), T1);
      await expect(
        suite.client.query("UPDATE foods SET fineli_recipe_uses = -1 WHERE fineli_id = $1", [EGG]),
      ).rejects.toThrow("foods_fineli_recipe_counts");
      await expect(
        suite.client.query("UPDATE foods SET fineli_recipe_foods = -1 WHERE fineli_id = $1", [EGG]),
      ).rejects.toThrow("foods_fineli_recipe_counts");
    });
  });

  describe("a folder without a recipe file and no counts handed in", () => {
    it("adds foods with 0 and NULL", async () => {
      const { release } = await mod.runImport(suite.db, args(NO_RECIPE_FILE), T1);
      expect(release.recipeCounts).toBeNull();
      expect([...(await stored()).values()].every((r) => r.uses === 0 && r.foods === null)).toBe(true);
    });

    it("leaves the stored counts as they were, changes no food and says so", async () => {
      await mod.runImport(suite.db, args(A), T1);
      const before = await stored();
      const { release, result } = await mod.runImport(suite.db, args(NO_RECIPE_FILE), T2);
      expect(result.foods).toEqual({ inserted: 0, updated: 0, unchanged: 16, revived: 0, archived: 0 });
      expect(result.recipeCountsChanged).toBe(0);
      expect(await stored()).toEqual(before);
      expect(await countsOf(SKIMMED_MILK)).toEqual({ uses: 5, foods: null });
      expect(mod.formatReport(NO_RECIPE_FILE, release, result)).toContain(
        "Recipe counts: none. Stored counts are left as they are.",
      );
    });

    it("keeps a food's stored counts when another of its values changes", async () => {
      await mod.runImport(suite.db, args(A), T1);
      const release = mod.readRelease(NO_RECIPE_FILE);
      const edited = {
        ...release,
        foods: release.foods.map((f) => (f.fineliId === EGG ? { ...f, proteinG: f.proteinG + 1 } : f)),
      };
      const result = await mod.applyRelease(suite.db, edited, {
        allowRetire: false,
        allowRename: false,
        dryRun: false,
        now: T2,
      });
      expect(result.foods.updated).toBe(1);
      expect((await stored()).get(EGG)).toEqual({ uses: 4, foods: null, updatedAt: T2 });
    });
  });

  describe("a folder without a recipe file and counts handed in", () => {
    it("stores the handed counts, and 0 and NULL for every food they do not name", async () => {
      await mod.runImport(suite.db, args(A), T1);
      const { release, result } = await mod.runImport(suite.db, args(NO_RECIPE_FILE), T2, SMALL_TABLE);
      expect(await countsOf(EGG)).toEqual({ uses: 7, foods: null });
      expect(await countsOf(DISH)).toEqual({ uses: 0, foods: 3 });
      expect(await countsOf(SKIMMED_MILK)).toEqual({ uses: 0, foods: null });
      // The eight foods release A's recipes use, and the dish.
      expect(result.recipeCountsChanged).toBe(9);
      const report = mod.formatReport(NO_RECIPE_FILE, release, result);
      expect(report).toContain(
        "Recipe counts: committed counts of release 18.0. The folder has no contribfood.csv and is release 18.0",
      );
      expect(report).toContain("Foods with a count: 2 of 18 read. Counts for ids not in this release: 1");
    });

    it("gets them from the command's defaults", async () => {
      const log: string[] = [];
      const out = { log: (l: string) => log.push(l), error: (l: string) => log.push(l) };
      const defaults = { defaultDir: A, cwd: FIXTURES, recipeCounts: SMALL_TABLE };
      expect(await mod.runCli(["release-utf8"], suite.db, out, defaults)).toBe(0);
      expect(log.join("\n")).toContain("Recipe counts: committed counts of release 18.0.");
      expect(await countsOf(EGG)).toEqual({ uses: 7, foods: null });
    });
  });

  describe("the first import onto a catalogue stored before the counts", () => {
    it("reports every food with a count as changed, once, and renames and retires none", async () => {
      await mod.runImport(suite.db, args(NO_RECIPE_FILE), T1);
      const { result } = await mod.runImport(suite.db, args(A), T2);
      // 1, 153, 606, 622, 663, 752, 858 and 11049. The broth, 29, has a count and is left out.
      expect(result.foods).toEqual({ inserted: 0, updated: 8, unchanged: 8, revived: 0, archived: 0 });
      expect(result.recipeCountsChanged).toBe(8);
      expect(result.renamed).toEqual([]);
      expect(result.retired).toEqual({ absent: 0, leftOut: [] });
      const again = await mod.runImport(suite.db, args(A), T2);
      expect(again.result.foods.updated).toBe(0);
    });

    it("reports the same in a dry run, whose block a person reads first, and stores nothing", async () => {
      await mod.runImport(suite.db, args(NO_RECIPE_FILE), T1);
      const before = await stored();
      const { release, result } = await mod.runImport(suite.db, { ...args(A), dryRun: true }, T2);
      expect(result.foods).toEqual({ inserted: 0, updated: 8, unchanged: 8, revived: 0, archived: 0 });
      expect(result.recipeCountsChanged).toBe(8);
      const report = mod.formatReport(A, release, result);
      expect(report).toContain("Stored counts changed: 8");
      expect(report).toContain("  Maito, rasvaton, d-vitamiinia 1 ug 5");
      expect(report).toContain("Dry run: nothing was written.");
      expect(await stored()).toEqual(before);
    });
  });

  describe("a database whose migrations have not all been run", () => {
    it("stops, says so and names the command, instead of showing a failed query", async () => {
      await mod.runImport(suite.db, args(NO_RECIPE_FILE), T1);
      const before = await stored();
      await suite.client.query("ALTER TABLE foods DROP COLUMN fineli_recipe_foods CASCADE");
      const error: string[] = [];
      const out = { log: () => {}, error: (l: string) => error.push(l) };
      try {
        expect(await mod.runCli(["release-a"], suite.db, out, { defaultDir: A, cwd: FIXTURES })).toBe(1);
      } finally {
        await suite.client.query(
          "ALTER TABLE foods ADD COLUMN fineli_recipe_foods integer, ADD CONSTRAINT foods_fineli_recipe_counts CHECK (fineli_recipe_uses >= 0 AND (fineli_recipe_foods IS NULL OR fineli_recipe_foods >= 0))",
        );
      }
      expect(error).toEqual([
        "Fineli import stopped. The database lacks a table or a column the import reads, so its migrations have not all been run. " +
          "Nothing was written. Run the migrations, then the import again. " +
          "On your own machine: pnpm --filter @hovimestari/backend db:migrate",
      ]);
      expect(await stored()).toEqual(before);
    });
  });

  describe("what the food routes answer", () => {
    it("is the same before and after the counts land, with no count in any answer", async () => {
      await mod.runImport(suite.db, args(NO_RECIPE_FILE), T1);
      const user = await signUp(suite.client);
      const read = async () => {
        const search = await request(suite.app).get("/api/v1/foods/search").query({ q: "maito" }).set(user.auth);
        const id = search.body.foods[0].id as string;
        const detail = await request(suite.app).get(`/api/v1/foods/${id}`).set(user.auth);
        return { search: search.body, detail: detail.body };
      };
      const before = await read();
      await mod.runImport(suite.db, args(A), T1);
      const after = await read();
      expect(after).toEqual(before);
      expect(JSON.stringify(after)).not.toMatch(/recipe/i);
    });
  });
});
