import type { FineliPortionUnit, LastAmount, RecentItem } from "@hovimestari/types";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { entries, foodPortions, foods, savedMeals } from "../../db/schema/index.js";
import type { Db } from "../../db/types.js";
import { summaryColumns, summaryOf } from "../foodRows.js";
import { portionVisibleTo, visibleTo } from "../foodScope.js";
import type { ReadContext } from "./context.js";
import { savedMealOf } from "./savedMeals.js";

// Recent items and last amounts come from eaten entries only: what the user
// logged, not what they planned. The last amount is the latest eaten entry's,
// so an amount changed while marking eaten is the one remembered.

/** The portion hint as an entry carries it: read only when it is this food's portion and visible. */
const hintedPortion = (userId: string) =>
  and(eq(foodPortions.id, entries.portionId), eq(foodPortions.foodId, entries.foodId), portionVisibleTo(userId));

const amountColumns = {
  grams: entries.grams,
  portionId: foodPortions.id,
  portionUnit: entries.portionUnit,
  portionName: entries.portionName,
  portionCount: entries.portionCount,
};

type AmountRow = {
  grams: number | null;
  portionId: string | null;
  portionUnit: string | null;
  portionName: string | null;
  portionCount: number | null;
};

const lastAmountOf = (row: AmountRow): LastAmount => ({
  grams: row.grams!,
  portion:
    row.portionCount === null
      ? null
      : {
          id: row.portionId,
          unit: row.portionUnit as FineliPortionUnit | null,
          name: row.portionName,
          count: row.portionCount,
        },
});

/** The amount of the user's latest eaten entry of each food in `foodIds`. */
export async function lastAmountsOf(db: Db, userId: string, foodIds: string[]): Promise<Map<string, LastAmount>> {
  if (foodIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([entries.foodId], { foodId: entries.foodId, ...amountColumns })
    .from(entries)
    .leftJoin(foodPortions, hintedPortion(userId))
    .where(and(eq(entries.userId, userId), inArray(entries.foodId, foodIds), isNotNull(entries.eatenAt)))
    .orderBy(entries.foodId, desc(entries.eatenAt), desc(entries.position));
  return new Map(rows.map((r) => [r.foodId!, lastAmountOf(r)]));
}

/**
 * The user's latest eaten entry of each source they can still log, as a
 * derived table `walk (id, n)`, newest first by `n`, at most `limit` rows. A
 * recursive walk down entries_user_eaten_idx: each step takes the next older
 * eaten entry whose source is usable and not yet met. Ties on `eaten_at` (a
 * batch marked eaten at once) are broken by position, as the index orders
 * them. It stops once it has `limit` sources, so a long history costs little
 * while the user keeps logging the same foods. When the user has fewer usable
 * sources than `limit`, the last step reads the rest of the history.
 */
function walkOfLatestEaten(ctx: ReadContext, limit: number): SQL {
  const source = sql`coalesce(${entries.foodId}, ${entries.savedMealId})`;
  const usable = and(
    eq(entries.userId, ctx.userId),
    isNotNull(entries.eatenAt),
    or(
      and(isNotNull(entries.foodId), visibleTo(ctx.userId)),
      and(isNotNull(entries.savedMealId), isNull(savedMeals.archivedAt), isNull(savedMeals.deletedAt)),
    ),
  );
  const from = sql`${entries}
    LEFT JOIN ${foods} ON ${foods.id} = ${entries.foodId}
    LEFT JOIN ${savedMeals} ON ${savedMeals.id} = ${entries.savedMealId}`;
  // NULLS LAST as the index is built, so the walk reads it in order.
  const newest = sql`ORDER BY ${entries.eatenAt} DESC NULLS LAST, ${entries.position} DESC NULLS LAST LIMIT 1`;
  return sql`(
    WITH RECURSIVE walk AS (
      (SELECT ${entries.id} AS id, ${entries.eatenAt} AS eaten_at, ${entries.position} AS position,
              ARRAY[${source}] AS seen, 1 AS n
         FROM ${from}
        WHERE ${usable}
        ${newest})
      UNION ALL
      SELECT next.id, next.eaten_at, next.position, walk.seen || next.source, walk.n + 1
        FROM walk, LATERAL (
          SELECT ${entries.id} AS id, ${entries.eatenAt} AS eaten_at, ${entries.position} AS position, ${source} AS source
            FROM ${from}
           WHERE ${usable}
             AND (${entries.eatenAt}, ${entries.position}) < (walk.eaten_at, walk.position)
             AND ${source} <> ALL (walk.seen)
           ${newest}) next
       WHERE walk.n < ${limit})
    SELECT id, n FROM walk) AS walk`;
}

/**
 * The foods and saved meals the user ate most recently, newest first, each
 * once, with the amount of its latest eaten entry. A food the user can no
 * longer see, and an archived or deleted meal, is left out. A retired food
 * stays. One statement, so the walk and what it answers share one snapshot.
 */
export async function listRecents(ctx: ReadContext, { limit }: { limit: number }): Promise<RecentItem[]> {
  const rows = await ctx.db
    .select({
      foodId: entries.foodId,
      mealId: entries.savedMealId,
      mealCount: entries.mealCount,
      ...amountColumns,
      food: summaryColumns(ctx.userId),
      meal: savedMeals,
    })
    .from(entries)
    .innerJoin(walkOfLatestEaten(ctx, limit), sql`walk.id = ${entries.id}`)
    .leftJoin(foods, eq(foods.id, entries.foodId))
    .leftJoin(savedMeals, eq(savedMeals.id, entries.savedMealId))
    .leftJoin(foodPortions, hintedPortion(ctx.userId))
    .orderBy(sql`walk.n`);

  return rows.map((r): RecentItem =>
    r.foodId
      ? { kind: "food", food: summaryOf(r.food!), last: lastAmountOf(r) }
      : { kind: "saved_meal", meal: savedMealOf(r.meal!, r.mealCount), last: { count: r.mealCount! } },
  );
}
