import { afterAll, describe, expect, it } from "@jest/globals";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ImportResult } from "../applyRelease.js";
import { readRelease, ReleaseError, type Release } from "../readRelease.js";
import type { RecipeCountsTable } from "../recipeCounts.js";
import { formatReport } from "../report.js";

// Where a release's recipe counts come from: the folder's own contribfood.csv,
// counts handed to readRelease, or nowhere. Release A holds twelve real
// recipes of release 18 (fixtures/README.md), and release-utf8 holds no
// recipe file. No database.

const FIXTURES = path.resolve("src/scripts/fineliImport/__tests__/fixtures");
const A = path.join(FIXTURES, "release-a");
const NO_RECIPE_FILE = path.join(FIXTURES, "release-utf8");
const temps: string[] = [];

/** A temp copy of release A, changed by `edit`. */
function copyOfA(edit: (dir: string) => void): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fineli-recipes-"));
  temps.push(dir);
  cpSync(A, dir, { recursive: true });
  edit(dir);
  return dir;
}
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** Counts for the egg, for a dish, and for an id no fixture release has. */
const SMALL_TABLE: RecipeCountsTable = {
  release: "18.0",
  rows: [
    [858, 7, null],
    [31924, 0, 3],
    [424242, 2, null],
  ],
};

const counts = (release: Release, fineliId: number) => {
  const food = release.foods.find((f) => f.fineliId === fineliId);
  return food && { uses: food.recipeUses, foods: food.recipeFoods };
};

/** A result with nothing in it: the report's recipe block reads the release. */
const NO_CHANGES: ImportResult = {
  dryRun: true,
  foods: { inserted: 0, updated: 0, unchanged: 0, revived: 0, archived: 0 },
  retired: { absent: 0, leftOut: [] },
  portions: { inserted: 0, updated: 0, unchanged: 0, removed: 0 },
  renamed: [],
  namesChangedInCaseOnly: 0,
  recipeCountsChanged: 0,
};
/** The report's lines from "Recipe counts:" to the blank line after the block. */
const recipeBlock = (release: Release, result = NO_CHANGES) => {
  const lines = formatReport("the folder", release, result).split("\n");
  const from = lines.findIndex((l) => l.startsWith("Recipe counts:"));
  return lines.slice(from, lines.indexOf("", from));
};

describe("a folder with a recipe file", () => {
  const release = readRelease(A);

  it("counts the recipes that use each food", () => {
    expect(release.recipeCounts?.source).toBe("release");
    expect(counts(release, 606)).toEqual({ uses: 5, foods: null });
    expect(counts(release, 858)).toEqual({ uses: 4, foods: null });
    expect(counts(release, 153)).toEqual({ uses: 3, foods: null });
    expect(counts(release, 752)).toEqual({ uses: 1, foods: null });
  });

  it("gives a food no recipe uses 0 and no recipe count", () => {
    expect(counts(release, 604)).toEqual({ uses: 0, foods: null });
  });

  it("says how many rows it read, how many foods have a count and how many ids the release lacks", () => {
    expect(release.recipeCounts).toEqual({
      // No row is left out as water or salt: this folder's food.csv lists neither (fixtures/README.md).
      source: "release",
      rowsRead: 40,
      rowsNotFood: 0,
      encoding: "utf-8",
      foodsWithCount: 9,
      idsNotInRelease: 22,
    });
  });

  it("ignores the counts it was handed", () => {
    const withFallback = readRelease(A, SMALL_TABLE);
    expect(withFallback.recipeCounts?.source).toBe("release");
    expect(counts(withFallback, 858)).toEqual({ uses: 4, foods: null });
    expect(counts(withFallback, 31924)).toEqual({ uses: 0, foods: null });
    expect(withFallback.foods).toEqual(release.foods);
  });

  // The dish 31924 gets a recipe of water, salt, oats and an id food.csv does not list.
  const RECIPE = [
    "31924;922;1,00;G;1,00;100;",
    "31924;30;1,00;G;1,00;100;",
    "31924;153;1,00;G;1,00;100;",
    "31924;99999;1,00;G;1,00;100;",
  ];
  const WATER_AND_SALT = [
    "30;Ruokasuola, jodioitu;FOOD;IND;100;SALT;INGRTOT;SPICES;MISCTOT",
    "922;Vesi, vesijohtovesi;FOOD;X;100;WATER;BEVTOT;DRWATER;BEVTOT",
  ];
  const withRecipe = (foodRows: string[]) =>
    readRelease(
      copyOfA((d) => {
        appendFileSync(path.join(d, "contribfood.csv"), RECIPE.map((r) => `${r}\r\n`).join(""));
        appendFileSync(path.join(d, "food.csv"), foodRows.map((r) => `${r}\r\n`).join(""));
      }),
    );

  it("leaves water and salt out of a recipe's foods, and counts an ingredient food.csv does not list", () => {
    expect(counts(withRecipe(WATER_AND_SALT), 31924)).toEqual({ uses: 0, foods: 2 });
  });

  it("reports the rows it left out as water or salt, and 0 when food.csv marks neither", () => {
    // The dish's two, and five rows of release A's own recipes that name water (922) or salt (30).
    expect(recipeBlock(withRecipe(WATER_AND_SALT))[1]).toBe("Recipe rows left out as water or salt: 7");
    expect(recipeBlock(withRecipe([]))[1]).toBe("Recipe rows left out as water or salt: 0");
  });

  it("counts water and salt as foods while food.csv does not list them, as it does any unknown id", () => {
    expect(counts(withRecipe([]), 31924)).toEqual({ uses: 0, foods: 4 });
  });

  it("stops on a recipe file without CONFDID, naming the file and the column", () => {
    const dir = copyOfA((d) => {
      const file = path.join(d, "contribfood.csv");
      writeFileSync(file, readFileSync(file, "latin1").replace("CONFDID", "INGREDIENT"), "latin1");
    });
    expect(() => readRelease(dir)).toThrow(ReleaseError);
    expect(() => readRelease(dir)).toThrow(
      "contribfood.csv has no CONFDID column. Its columns are: FOODID, INGREDIENT,",
    );
  });

  it("stops on an id that is not a number, naming the row", () => {
    const dir = copyOfA((d) => appendFileSync(path.join(d, "contribfood.csv"), "953;abc;1,00;G;1,00;100;\r\n"));
    expect(() => readRelease(dir)).toThrow(
      'contribfood.csv row 42 has CONFDID "abc", which is not a number. To import without recipe counts, move contribfood.csv out of the folder.',
    );
    expect(() => readRelease(dir, SMALL_TABLE)).toThrow(
      "To import with the committed counts of release 18.0 instead, move contribfood.csv out of the folder.",
    );
  });

  it("stops on a recipe file with a header and no rows, so a cut file never clears the stored counts", () => {
    const dir = copyOfA((d) => {
      const file = path.join(d, "contribfood.csv");
      writeFileSync(file, readFileSync(file, "latin1").split("\r\n")[0] + "\r\n", "latin1");
    });
    expect(() => readRelease(dir)).toThrow(ReleaseError);
    expect(() => readRelease(dir, SMALL_TABLE)).toThrow(
      "contribfood.csv has a header row and no recipe rows. The file looks cut off. " +
        "To import with the committed counts of release 18.0 instead, move contribfood.csv out of the folder.",
    );
  });

  describe("beside a food.csv without IGCLASS", () => {
    const withoutClass = (d: string) => {
      const file = path.join(d, "food.csv");
      writeFileSync(file, readFileSync(file, "latin1").replace(";IGCLASS;", ";INGCLASS;"), "latin1");
    };

    it("stops, naming the column and the recipe file that needs it", () => {
      const dir = copyOfA(withoutClass);
      expect(() => readRelease(dir)).toThrow(ReleaseError);
      expect(() => readRelease(dir, SMALL_TABLE)).toThrow(
        /^food\.csv has no IGCLASS column\. Its columns are: .*\. The recipes in contribfood\.csv need IGCLASS, which tells water and salt from foods\. To import with the committed counts of release 18\.0 instead, move contribfood\.csv out of the folder\.$/,
      );
    });

    it("reads the same folder once the recipe file is gone: IGCLASS is needed only for recipes", () => {
      const dir = copyOfA((d) => {
        withoutClass(d);
        unlinkSync(path.join(d, "contribfood.csv"));
      });
      expect(readRelease(dir, SMALL_TABLE).foods).toHaveLength(16);
    });
  });

  it("reports the folder as the source, with the five most used foods by name, ties in name order", () => {
    expect(recipeBlock(release)).toEqual([
      "Recipe counts: from contribfood.csv in the folder (40 rows read)",
      "Recipe rows left out as water or salt: 0",
      "Foods with a count: 9 of 18 read. Counts for ids not in this release: 22",
      "Most used:",
      "  Maito, rasvaton, d-vitamiinia 1 ug 5",
      "  Banaani, kuorittu 4",
      "  Kananmuna, kuoreton 4",
      "  Sokeri 4",
      "  Kaurahiutale 3",
      "Stored counts changed: 0",
    ]);
  });

  it("puts the block after the portions block, and names the recipe file among the encodings", () => {
    const lines = formatReport("the folder", release, NO_CHANGES).split("\n");
    const at = (start: string) => lines.findIndex((l) => l.startsWith(start));
    expect(at("Recipe counts:")).toBeGreaterThan(at("  Left out, unit PORTTBL"));
    expect(at("Recipe counts:")).toBeLessThan(at("Names changed in case only"));
    expect(lines[at("Encodings:")]).toContain("contribfood.csv utf-8");
  });
});

describe("a folder without a recipe file", () => {
  it("has no counts when it is handed none", () => {
    const release = readRelease(NO_RECIPE_FILE);
    expect(release.recipeCounts).toBeNull();
    expect(release.foods.every((f) => f.recipeUses === 0 && f.recipeFoods === null)).toBe(true);
    expect(recipeBlock(release)).toEqual(["Recipe counts: none. Stored counts are left as they are."]);
  });

  it("takes the counts it is handed, and counts the ids the release lacks", () => {
    const release = readRelease(NO_RECIPE_FILE, SMALL_TABLE);
    expect(counts(release, 858)).toEqual({ uses: 7, foods: null });
    expect(counts(release, 31924)).toEqual({ uses: 0, foods: 3 });
    expect(counts(release, 606)).toEqual({ uses: 0, foods: null });
    expect(release.recipeCounts).toEqual({
      source: "committed",
      release: "18.0",
      foodsWithCount: 2,
      idsNotInRelease: 1,
    });
  });

  it("reports the committed source with the folder's own release label", () => {
    expect(recipeBlock(readRelease(NO_RECIPE_FILE, SMALL_TABLE), { ...NO_CHANGES, recipeCountsChanged: 2 })).toEqual([
      "Recipe counts: committed counts of release 18.0. The folder has no contribfood.csv and is release 18.0",
      "Foods with a count: 2 of 18 read. Counts for ids not in this release: 1",
      "Most used:",
      "  Kananmuna, kuoreton 7",
      "Stored counts changed: 2",
    ]);
  });

  it("calls a folder without a release number an unnamed release", () => {
    const dir = copyOfA((d) => {
      unlinkSync(path.join(d, "contribfood.csv"));
      unlinkSync(path.join(d, "descript.txt"));
    });
    expect(recipeBlock(readRelease(dir, SMALL_TABLE))[0]).toBe(
      "Recipe counts: committed counts of release 18.0. The folder has no contribfood.csv and is an unnamed release",
    );
  });
});
