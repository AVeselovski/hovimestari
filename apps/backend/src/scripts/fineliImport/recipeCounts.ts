// The two counts a Fineli food gets from the release's recipe rows
// (contribfood.csv). Pure: no files, no database. readRelease calls
// countRecipes on a folder's own recipe file, and buildRecipeCounts calls it
// to write the committed module, so the two cannot count differently.

/** The ingredient classes (food.csv IGCLASS) left out of a recipe's food count. */
export const NOT_A_FOOD_CLASSES: ReadonlySet<string> = new Set(["WATER", "SALT"]);

/** One row of contribfood.csv: the recipe's food (FOODID) and one ingredient food (CONFDID). */
export interface RecipeRow {
  foodId: number;
  ingredientId: number;
}

export interface RecipeCount {
  /** How many recipes list this food as an ingredient. */
  uses: number;
  /** For a food with a recipe: its ingredient rows besides water and salt. Null without a recipe. */
  foods: number | null;
}

/** One food's counts as the committed module holds them. */
export type RecipeCountRow = readonly [fineliId: number, recipeUses: number, recipeFoods: number | null];

/** How many of its most used foods a committed table names. */
export const MOST_USED_NAMED = 10;

/** One of a table's most used foods, by the Finnish name its release gives it. */
export type NamedFood = readonly [fineliId: number, name: string];

/** Counts kept apart from a release folder, for an import whose folder has no recipe file. */
export interface RecipeCountsTable {
  /** The Fineli release the counts were made from, as the report names it. */
  release: string;
  /**
   * The table's most used foods, most used first, by the Finnish name its
   * release gives them. The table holds ids and counts only, so these names
   * are what shows that an id still names the same food in another release.
   */
  mostUsed: ReadonlyArray<NamedFood>;
  rows: ReadonlyArray<RecipeCountRow>;
}

/** A most used food of a committed table whose name differs in the release at hand. */
export interface NameDifference {
  fineliId: number;
  /** The name in the table's release. */
  committed: string;
  /** The name in the release at hand, or null when it does not list the id. */
  here: string | null;
}

export interface RecipeCounts {
  /** Every food the rows name, as a recipe or as an ingredient, in id order. */
  counts: Map<number, RecipeCount>;
  /** Rows left out of their recipe's food count, because the ingredient is water or salt. */
  rowsNotFood: number;
}

/**
 * The counts of every food the recipe rows name, as a recipe or as an
 * ingredient. A food's uses are the distinct recipes that list it, whatever
 * the recipe's own food is, so a recipe that names itself is one use. A
 * recipe's foods are its rows whose ingredient is neither water nor salt by
 * `classOf`: rows, so an ingredient listed twice counts twice, and an
 * ingredient `classOf` does not know counts as a food.
 */
export function countRecipes(rows: Iterable<RecipeRow>, classOf: ReadonlyMap<number, string>): RecipeCounts {
  const usedBy = new Map<number, Set<number>>();
  const foodsOf = new Map<number, number>();
  let rowsNotFood = 0;
  for (const { foodId, ingredientId } of rows) {
    const recipes = usedBy.get(ingredientId);
    if (recipes) recipes.add(foodId);
    else usedBy.set(ingredientId, new Set([foodId]));
    const isFood = !NOT_A_FOOD_CLASSES.has(classOf.get(ingredientId) ?? "");
    foodsOf.set(foodId, (foodsOf.get(foodId) ?? 0) + (isFood ? 1 : 0));
    if (!isFood) rowsNotFood++;
  }
  const counts = new Map<number, RecipeCount>();
  for (const id of [...new Set([...usedBy.keys(), ...foodsOf.keys()])].sort((a, b) => a - b)) {
    counts.set(id, { uses: usedBy.get(id)?.size ?? 0, foods: foodsOf.get(id) ?? null });
  }
  return { counts, rowsNotFood };
}

/** The ids of the `MOST_USED_NAMED` foods most recipes use, most used first, ties by id. */
export function mostUsedIds(counts: ReadonlyMap<number, RecipeCount>): number[] {
  return [...counts]
    .filter(([, c]) => c.uses > 0)
    .sort(([a, x], [b, y]) => y.uses - x.uses || a - b)
    .slice(0, MOST_USED_NAMED)
    .map(([id]) => id);
}

/** A name with case and runs of spaces set aside: one release writes names in capitals, another does not. */
const plain = (name: string) => name.toLocaleLowerCase("fi").replace(/\s+/g, " ").trim();

/**
 * The most used foods of `table` that `nameHere` names differently, or does
 * not know. Case and spacing do not count as a difference.
 */
export function namesThatDiffer(
  table: RecipeCountsTable,
  nameHere: (fineliId: number) => string | null,
): NameDifference[] {
  const differences: NameDifference[] = [];
  for (const [fineliId, committed] of table.mostUsed) {
    const here = nameHere(fineliId);
    if (here === null || plain(here) !== plain(committed)) differences.push({ fineliId, committed, here });
  }
  return differences;
}

/** A table's rows as the map countRecipes answers. */
export function countsOfTable(table: RecipeCountsTable): Map<number, RecipeCount> {
  return new Map(table.rows.map(([id, uses, foods]) => [id, { uses, foods }]));
}
