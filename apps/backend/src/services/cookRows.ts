import { cookDiff, cookDiffers, type DiffLine } from "@hovimestari/types";
import { sql } from "drizzle-orm";
import { cookIngredients, cooks, recipeIngredients, recipes } from "../db/schema/index.js";
import type { Db } from "../db/types.js";

// Whether each cook differs from its recipe as the recipe is now, for the
// entries a read answers. One query for any number of cooks: the lines of
// those cooks and the lines of their recipes, with both servings. A read
// with no cook entry runs none.

/** What the one query answers per line, raw. Numbers arrive as text from a raw query. */
type DiffRow = {
  side: "cook" | "recipe";
  cook_id: string;
  servings: number;
  id: string | null;
  from_line_id: string | null;
  food_id: string | null;
  grams: string | null;
  written_amount: string | null;
  written_unit: string | null;
  name: string | null;
};

const numberOrNull = (value: string | null): number | null => (value === null ? null : Number(value));

const diffLineOf = (row: DiffRow): DiffLine & { fromLineId: string | null } => ({
  id: row.id!,
  fromLineId: row.from_line_id,
  foodId: row.food_id,
  grams: numberOrNull(row.grams),
  written:
    row.written_amount === null ? null : { amount: Number(row.written_amount), unit: row.written_unit as string },
  name: row.name,
});

/** For each of the user's cooks among `cookIds`, whether it differs from its recipe now. One query. */
export async function cookDiffersOf(db: Db, userId: string, cookIds: readonly string[]): Promise<Map<string, boolean>> {
  if (cookIds.length === 0) return new Map();
  const ids = sql.join(
    cookIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const { rows } = await db.execute<DiffRow>(sql`
    SELECT 'cook' AS side, ${cooks.id} AS cook_id, ${cooks.servings} AS servings, ${cookIngredients.id} AS id,
           ${cookIngredients.fromLineId} AS from_line_id, ${cookIngredients.foodId} AS food_id,
           ${cookIngredients.grams} AS grams, ${cookIngredients.writtenAmount} AS written_amount,
           ${cookIngredients.writtenUnit} AS written_unit, ${cookIngredients.name} AS name
      FROM ${cooks} LEFT JOIN ${cookIngredients} ON ${cookIngredients.cookId} = ${cooks.id}
     WHERE ${cooks.userId} = ${userId} AND ${cooks.id} IN (${ids})
    UNION ALL
    SELECT 'recipe', ${cooks.id}, ${recipes.servings}, ${recipeIngredients.id}, NULL, ${recipeIngredients.foodId},
           ${recipeIngredients.grams}, ${recipeIngredients.writtenAmount}, ${recipeIngredients.writtenUnit},
           ${recipeIngredients.name}
      FROM ${cooks}
      JOIN ${recipes} ON ${recipes.id} = ${cooks.recipeId}
      LEFT JOIN ${recipeIngredients} ON ${recipeIngredients.recipeId} = ${recipes.id}
     WHERE ${cooks.userId} = ${userId} AND ${cooks.id} IN (${ids})`);
  const byCook = new Map<string, { cook: DiffRow[]; recipe: DiffRow[] }>();
  for (const row of rows) {
    const sides = byCook.get(row.cook_id) ?? { cook: [], recipe: [] };
    sides[row.side].push(row);
    byCook.set(row.cook_id, sides);
  }
  const differs = new Map<string, boolean>();
  for (const [cookId, { cook, recipe }] of byCook) {
    const lines = (side: DiffRow[]) => side.filter((r) => r.id !== null).map(diffLineOf);
    const diff = cookDiff(lines(recipe), Number(recipe[0]!.servings), lines(cook), Number(cook[0]!.servings));
    differs.set(cookId, cookDiffers(diff));
  }
  return differs;
}
