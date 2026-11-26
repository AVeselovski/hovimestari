import { and, asc, isNull, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { foods } from "../db/schema/index.js";
import type { Db } from "../db/types.js";
import { byName, displayName, isFavourite, summaryColumns } from "./foodRows.js";
import { visibleTo } from "./foodScope.js";
import { formsOf } from "./foodSearchForms.js";

/** The fewest characters a search word needs. Shorter words are dropped. */
export const MIN_WORD_LENGTH = 2;
/** The most words a query is searched by. */
export const MAX_WORDS = 8;
/** A search of two words or more that finds fewer foods than this, or than its limit when that is lower, also answers the near list. */
export const NEAR_BELOW = 8;
/** The most foods the near list holds. */
export const NEAR_LIMIT = 8;

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

// How one word meets one name, from the name's head (`search_head`) and its
// normalised words (`search_name`). Lower is better, and NULL means the name
// does not hold the word:
// 0 the head is the word, 1 the head ends with it (a Finnish compound),
// 2 a later word is the word, 3 a later word ends with it,
// 4 the head starts with it, 5 a later word starts with it, 6 it sits inside a word.
// Every pattern is built here and bound as one parameter.

/** A typed word, which may be any part of a word. */
function tWord(head: AnyColumn, name: AnyColumn, w: string): SQL {
  return sql`CASE WHEN ${name} NOT LIKE ${`%${w}%`} THEN NULL
    WHEN ${head} = ${w} THEN 0
    WHEN ${head} LIKE ${`%${w}`} THEN 1
    WHEN ' ' || ${name} || ' ' LIKE ${`% ${w} %`} THEN 2
    WHEN ${name} || ' ' LIKE ${`%${w} %`} THEN 3
    WHEN ${head} LIKE ${`${w}%`} THEN 4
    WHEN ' ' || ${name} LIKE ${`% ${w}%`} THEN 5
    ELSE 6 END`;
}

/** A base form reached from its typed genitive. It must start a word, and ranks as a word that does. */
function tForm(head: AnyColumn, name: AnyColumn, f: string): SQL {
  return sql`CASE WHEN ' ' || ${name} NOT LIKE ${`% ${f}%`} THEN NULL
    WHEN ${head} = ${f} THEN 0
    WHEN ' ' || ${name} || ' ' LIKE ${`% ${f} %`} THEN 2
    WHEN ${head} LIKE ${`${f}%`} THEN 4
    ELSE 5 END`;
}

/**
 * A changed-stem genitive reached from its typed base. It must start a word.
 * At the start of a longer word it is a compound's first part, and counts as
 * a compound's end does: "Naudanpaisti" for "nauta" as "Kananmuna" for "muna".
 */
function tGen(head: AnyColumn, name: AnyColumn, g: string): SQL {
  return sql`CASE WHEN ' ' || ${name} NOT LIKE ${`% ${g}%`} THEN NULL
    WHEN ${head} = ${g} THEN 0
    WHEN ${head} LIKE ${`${g}%`} THEN 1
    WHEN ' ' || ${name} || ' ' LIKE ${`% ${g} %`} THEN 2
    ELSE 3 END`;
}

/** How `word` meets a food: the better of its two names, the best of the word and its listed forms. NULL when neither name holds any. */
function tOf(word: string): SQL {
  const names = [
    [foods.searchHead, foods.searchName],
    [foods.searchHeadEn, foods.searchNameEn],
  ] as const;
  const cases = names.map(([head, name]) => tWord(head, name, word));
  for (const { form, compound } of formsOf(word)) {
    for (const [head, name] of names) cases.push((compound ? tGen : tForm)(head, name, form));
  }
  return sql`LEAST(${sql.join(cases, sql`, `)})`;
}

/**
 * Whether a food holds `word` or a listed form of it, in either name. The
 * word may be any part of a word. A form must start a word, and the plain
 * LIKE beside that test is there so the trigram index still serves the OR.
 */
function holds(word: string): SQL {
  const tests = [sql`${foods.searchAll} LIKE ${`%${word}%`}`];
  for (const { form } of formsOf(word)) {
    tests.push(sql`(${foods.searchAll} LIKE ${`%${form}%`} AND ' ' || ${foods.searchAll} LIKE ${`% ${form}%`})`);
  }
  return sql`(${sql.join(tests, sql` OR `)})`;
}

/**
 * The foods that hold `words` and their rank, as a query not yet run. `held`
 * is the test on the words. A word a food does not hold has a NULL `t`, which
 * LEAST and GREATEST skip, so the rank is over the words the food does hold.
 */
function ranked(db: Db, userId: string, words: string[], held: SQL, limit: number) {
  const display = displayName(userId);
  const t = (i: number) => sql.raw(`"t"."t${i}"`);
  const all = (fn: (i: number) => SQL) =>
    sql.join(
      words.map((_, i) => fn(i)),
      sql`, `,
    );
  // One `t` per word.
  const perWord = sql`LATERAL (SELECT ${sql.join(
    words.map((w, i) => sql`${tOf(w)} AS ${sql.raw(`"t${i}"`)}`),
    sql`, `,
  )}) AS "t"`;
  // `s`: 0 when every word is met strongly (0 to 3), 1 when the worst starts a word (4 or 5), 2 when any sits
  // inside one. `best`: the best word's `t`. `dish`: a Fineli dish whose recipe is not exactly one food.
  const perFood = sql`LATERAL (SELECT
    GREATEST(${all((i) => sql`CASE WHEN ${t(i)} <= 3 THEN 0 WHEN ${t(i)} <= 5 THEN 1 WHEN ${t(i)} = 6 THEN 2 END`)}) AS "s",
    LEAST(${all(t)}) AS "best",
    (${foods.source} = 'fineli' AND ${foods.fineliType} = 'DISH' AND ${foods.fineliRecipeFoods} IS DISTINCT FROM 1) AS "dish"
  ) AS "k"`;
  const s = sql.raw(`"k"."s"`);
  const best = sql.raw(`"k"."best"`);
  const dish = sql.raw(`"k"."dish"`);
  return db
    .select(summaryColumns(userId))
    .from(foods)
    .crossJoin(perWord)
    .crossJoin(perFood)
    .where(and(visibleTo(userId), isNull(foods.retiredAt), held))
    .orderBy(
      // 1 The group.
      sql`CASE WHEN ${s} = 0 AND NOT ${dish} THEN 0 WHEN ${s} = 0 AND ${best} <= 1 THEN 1 WHEN ${s} = 1 AND NOT ${dish} THEN 2
        WHEN ${s} = 0 THEN 3 WHEN ${s} = 1 THEN 4 WHEN NOT ${dish} THEN 5 ELSE 6 END`,
      // 2 Yours: a favourite, then an own food or a scanned product, then the rest.
      sql`CASE WHEN ${isFavourite(userId)} THEN 0 WHEN ${foods.source} <> 'fineli' THEN 1 ELSE 2 END`,
      // 3 The position.
      sql`CASE WHEN ${s} = 0 THEN ${best} WHEN ${s} = 1 THEN CASE WHEN ${best} IN (0, 1, 4) THEN 4 ELSE 5 END ELSE 6 END`,
      // 4 Fineli foods and the user's foods before one-food dishes.
      sql`(${foods.source} = 'fineli' AND ${foods.fineliType} = 'DISH')`,
      // 5 Recipe uses, for basic foods only.
      sql`CASE WHEN ${dish} THEN 0 ELSE ${foods.fineliRecipeUses} END DESC`,
      sql`array_length(string_to_array(${display}, ', '), 1)`,
      sql`char_length(${display})`,
      byName(display),
      asc(foods.id),
    )
    .limit(limit);
}

/**
 * The ranked search for `words` (at least one), as a query not yet run, so a
 * test can EXPLAIN exactly what the service runs. A food matches when every
 * word, or a listed form of it, occurs in either name. Retired foods and
 * other users' foods never match.
 *
 * A basic food is a Fineli FOOD, an own food, a scanned product, or a Fineli
 * DISH whose recipe is one food besides water and salt. Every other Fineli
 * DISH is a dish. First difference wins:
 *
 * 1. The group: a basic food met strongly, a dish whose head is or ends with
 *    a word, a basic food where a word only starts a word, a dish with the
 *    word later in its name, a dish where a word only starts a word, a basic
 *    food with a word inside a word, then such a dish.
 * 2. Yours: a favourite, then an own food or a scanned product, then the rest.
 * 3. The position of the best word in the name.
 * 4. Fineli foods and the user's foods before one-food dishes.
 * 5. Among basic foods, the one more of Fineli's recipes use.
 * 6. Fewer parts in the display name, the shorter display name, the display
 *    name in Finnish alphabetical order, then the id.
 */
export function searchQuery(db: Db, userId: string, words: string[], limit: number) {
  return ranked(db, userId, words, and(...words.map(holds))!, limit);
}

/**
 * The foods that hold all of `words` (two at least) but exactly one, ranked
 * by the search rule over the words each does hold, at most `limit`. A food
 * that holds every word is never among them. It reads every visible food.
 * The service takes the default. The script that builds the tests' sample
 * reads deeper.
 */
export function nearQuery(db: Db, userId: string, words: string[], limit = NEAR_LIMIT) {
  const count = sql.join(
    words.map((w) => sql`${holds(w)}::int`),
    sql` + `,
  );
  return ranked(db, userId, words, sql`(${count}) = ${words.length - 1}`, limit);
}
