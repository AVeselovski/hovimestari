import { firstNames } from "./nameCase.js";
import {
  countRecipes,
  countsOfTable,
  type RecipeCount,
  type RecipeCountsTable,
  type RecipeRow,
} from "./recipeCounts.js";
import { findFile, readColumns, ReleaseError, type Encoding } from "./releaseFiles.js";

// Reads a release's recipe rows and ingredient classes, and picks where an
// import's recipe counts come from.

/**
 * The release's recipe rows: which foods each Fineli recipe is made of. The
 * file is optional, because not every download holds it. When the folder has
 * it, food.csv must also give IGCLASS, the ingredient class that marks water
 * and salt.
 */
export const RECIPE_FILE = "contribfood.csv";
const RECIPE_COLUMNS = ["FOODID", "CONFDID"] as const;
const CLASS_COLUMNS = ["FOODID", "IGCLASS"] as const;

/** A Fineli food id of `file`'s `column`, or a ReleaseError naming the row. */
function idOf(raw: string, file: string, column: string, n: number): number {
  if (!/^\d+$/.test(raw)) throw new ReleaseError(`${file} row ${n + 2} has ${column} "${raw}", which is not a number.`);
  return Number(raw);
}

/**
 * The recipe rows of the recipe file at `full`. A file with a header and no
 * rows is refused: read as a release without recipes, it would clear every
 * stored count.
 */
export function readRecipeRows(full: string): { rows: RecipeRow[]; encoding: Encoding } {
  const { rows, encoding } = readColumns(full, RECIPE_FILE, RECIPE_COLUMNS);
  if (rows.length === 0)
    throw new ReleaseError(`${RECIPE_FILE} has a header row and no recipe rows. The file looks cut off.`);
  return {
    rows: rows.map((row, n) => ({
      foodId: idOf(row.FOODID, RECIPE_FILE, "FOODID", n),
      ingredientId: idOf(row.CONFDID, RECIPE_FILE, "CONFDID", n),
    })),
    encoding,
  };
}

/** Each food's ingredient class, from the food.csv at `full`. */
export function readIngredientClasses(full: string): Map<number, string> {
  const { rows } = readColumns(full, "food.csv", CLASS_COLUMNS);
  return new Map(rows.map((row, n) => [idOf(row.FOODID, "food.csv", "FOODID", n), row.IGCLASS]));
}

/** The Finnish name of each food, from the foodname_FI.csv at `full`, in sentence case as the import stores it. */
export function readFinnishNames(full: string): Map<number, string> {
  const { rows } = readColumns(full, "foodname_FI.csv", ["FOODID", "FOODNAME"]);
  rows.forEach((row, n) => idOf(row.FOODID, "foodname_FI.csv", "FOODID", n));
  return new Map([...firstNames(rows, "fi")].map(([id, name]) => [Number(id), name]));
}

/** Where a release's recipe counts came from, and what the report says about that source. */
export type RecipeSource =
  | {
      from: "release";
      /** Rows read from the folder's recipe file. */
      rowsRead: number;
      /** Of them, the rows left out of a recipe's foods as water or salt. 0 means IGCLASS marks neither here. */
      rowsNotFood: number;
      encoding: Encoding;
    }
  | {
      from: "committed";
      /** The release the handed counts were made from. */
      release: string;
    };

/**
 * The counts of the release in `dir`: from its own recipe file when it has
 * one, else from `fallback`, else none, with a null source. A recipe file
 * that cannot be read stops the import, and the message says how to go on
 * without it.
 */
export function recipeCountsOf(
  dir: string,
  fallback: RecipeCountsTable | undefined,
): { counts: Map<number, RecipeCount>; source: RecipeSource | null } {
  const full = findFile(dir, RECIPE_FILE);
  if (!full) {
    if (!fallback) return { counts: new Map(), source: null };
    return { counts: countsOfTable(fallback), source: { from: "committed", release: fallback.release } };
  }
  const goOn = fallback
    ? `To import with the committed counts of release ${fallback.release} instead, move ${RECIPE_FILE} out of the folder.`
    : `To import without recipe counts, move ${RECIPE_FILE} out of the folder.`;
  /** Runs `read`, and adds `why` and how to go on to a ReleaseError. */
  const reading = <T>(read: () => T, why = ""): T => {
    try {
      return read();
    } catch (err) {
      if (err instanceof ReleaseError) throw new ReleaseError(`${err.message} ${why}${goOn}`);
      throw err;
    }
  };
  const { rows, encoding } = reading(() => readRecipeRows(full));
  // readRelease has read food.csv and checked every FOODID by now, so what can fail here is the IGCLASS column.
  const classes = reading(
    () => readIngredientClasses(findFile(dir, "food.csv") as string),
    `The recipes in ${RECIPE_FILE} need IGCLASS, which tells water and salt from foods. `,
  );
  const { counts, rowsNotFood } = countRecipes(rows, classes);
  return { counts, source: { from: "release", rowsRead: rows.length, rowsNotFood, encoding } };
}
