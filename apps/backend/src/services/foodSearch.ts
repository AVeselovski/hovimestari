import { and, asc, isNull, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { foods } from "../db/schema/index.js";
import type { Db } from "../db/types.js";
import { byName, displayName, isFavourite, isOwn, summaryColumns } from "./foodRows.js";
import { visibleTo } from "./foodScope.js";

/** The fewest characters a search word needs. Shorter words are dropped. */
export const MIN_WORD_LENGTH = 2;
/** The most words a query is searched by. */
export const MAX_WORDS = 8;

/**
 * The words of a search query: normalised by the same SQL function that
 * builds the search columns, then split, with words under two characters and
 * duplicates dropped. A normalised word holds only letters and digits, so no
 * LIKE wildcard can reach the patterns built from it.
 */
export async function searchWords(db: Db, q: string): Promise<string[]> {
  const result = await db.execute<{ norm: string | null }>(sql`SELECT food_search_norm(${q}) AS norm`);
  const words = (result.rows[0]?.norm ?? "").split(" ").filter((w) => w.length >= MIN_WORD_LENGTH);
  return [...new Set(words)].slice(0, MAX_WORDS);
}

/**
 * The match tier of `w` against one name, from its head (`search_head`) and
 * its normalised words (`search_name`). Lower is better:
 * 1 the head is `w`, 2 the head ends with `w` (a Finnish compound),
 * 3 the head starts with `w`, 4 a word is `w` or ends with it,
 * 5 a word starts with `w`, 6 `w` occurs inside a word.
 * Every pattern is built here and bound as one parameter.
 */
function tierOf(head: AnyColumn, words: AnyColumn, w: string): SQL<number> {
  return sql<number>`CASE
    WHEN ${head} = ${w} THEN 1
    WHEN ${head} LIKE ${`%${w}`} THEN 2
    WHEN ${head} LIKE ${`${w}%`} THEN 3
    WHEN ${words} || ' ' LIKE ${`%${w} %`} THEN 4
    WHEN ' ' || ${words} LIKE ${`% ${w}%`} THEN 5
    ELSE 6 END`;
}

/**
 * The ranked search for `words` (at least one), as a query not yet run, so a
 * test can EXPLAIN exactly what the service runs. A food matches when every
 * word occurs in either name. Retired foods and other users' own foods never
 * match. First difference wins: the match tier of the first word over both
 * names, favourites then own foods then the rest, Fineli FOOD then DISH then
 * anything else, fewer parts in the display name, shorter display name, the
 * display name in Finnish alphabetical order, then the id.
 */
export function searchQuery(db: Db, userId: string, words: string[], limit: number) {
  const [w] = words;
  const display = displayName(userId);
  const tier = sql`LEAST(${tierOf(foods.searchHead, foods.searchName, w)}, ${tierOf(foods.searchHeadEn, foods.searchNameEn, w)})`;
  const standing = sql`CASE WHEN ${isFavourite(userId)} THEN 0 WHEN ${isOwn(userId)} THEN 1 ELSE 2 END`;
  const kind = sql`CASE WHEN ${foods.source} = 'fineli' AND ${foods.fineliType} = 'FOOD' THEN 0
    WHEN ${foods.source} = 'fineli' AND ${foods.fineliType} = 'DISH' THEN 1 ELSE 2 END`;
  return db
    .select(summaryColumns(userId))
    .from(foods)
    .where(
      and(
        visibleTo(userId),
        isNull(foods.retiredAt),
        ...words.map((word) => sql`${foods.searchAll} LIKE ${`%${word}%`}`),
      ),
    )
    .orderBy(
      tier,
      standing,
      kind,
      sql`array_length(string_to_array(${display}, ', '), 1)`,
      sql`char_length(${display})`,
      byName(display),
      asc(foods.id),
    )
    .limit(limit);
}
