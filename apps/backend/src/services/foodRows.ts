import type { FoodSummary, Portion } from "@hovimestari/types";
import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { foodFavourites, foodPortions, foods, users } from "../db/schema/index.js";

// The one selection every food read answers with, so a list, a search and a
// detail name a food the same way. The user's food-name language is read in
// the same query as the foods.

/** The user's food-name language, as a scalar subquery. */
const languageOf = (userId: string): SQL =>
  sql`(SELECT ${users.foodNameLanguage} FROM ${users} WHERE ${users.id} = ${userId})`;

/** The name in the user's language: the English name for "en" where there is one, else the Finnish. */
export const displayName = (userId: string): SQL<string> =>
  sql<string>`CASE WHEN ${languageOf(userId)} = 'en' THEN coalesce(${foods.nameEn}, ${foods.name}) ELSE ${foods.name} END`;

/**
 * `name` in Finnish alphabetical order (å, ä and ö after z), the same on every
 * server whatever its default locale. ICU's `fi-x-icu` exists wherever
 * Postgres is built with ICU: the official image, Fly's and the agent
 * container's. Every alphabetical ORDER BY on a food or portion name uses it.
 */
export const byName = (name: SQL | AnyColumn): SQL => sql`${name} COLLATE "fi-x-icu"`;

/** The other language's name when it differs from the display name, else null. */
const otherName = (userId: string): SQL<string | null> =>
  sql<string | null>`CASE WHEN ${foods.nameEn} IS NULL OR ${foods.nameEn} = ${foods.name} THEN NULL
    WHEN ${languageOf(userId)} = 'en' THEN ${foods.name} ELSE ${foods.nameEn} END`;

export const isFavourite = (userId: string): SQL<boolean> =>
  sql<boolean>`EXISTS (SELECT 1 FROM ${foodFavourites} WHERE ${foodFavourites.userId} = ${userId} AND ${foodFavourites.foodId} = ${foods.id})`;

export const isOwn = (userId: string): SQL<boolean> => sql<boolean>`coalesce(${foods.userId} = ${userId}, false)`;

/** The columns of a food summary, for `db.select(...)`. */
export const summaryColumns = (userId: string) => ({
  id: foods.id,
  source: foods.source,
  name: displayName(userId),
  otherName: otherName(userId),
  energyKcal: foods.energyKcal,
  proteinG: foods.proteinG,
  carbsG: foods.carbsG,
  fatG: foods.fatG,
  isFavourite: isFavourite(userId),
  isOwn: isOwn(userId),
  retired: sql<boolean>`${foods.retiredAt} IS NOT NULL`,
});

type SummaryRow = {
  id: string;
  source: FoodSummary["source"];
  name: string;
  otherName: string | null;
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isFavourite: boolean;
  isOwn: boolean;
  retired: boolean;
};

/** A selected row as the API shows it. */
export const summaryOf = (row: SummaryRow): FoodSummary => ({
  id: row.id,
  source: row.source,
  name: row.name,
  otherName: row.otherName,
  per100g: { energyKcal: row.energyKcal, proteinG: row.proteinG, carbsG: row.carbsG, fatG: row.fatG },
  isFavourite: row.isFavourite,
  isOwn: row.isOwn,
  retired: row.retired,
});

/**
 * A portion row as the API shows it, for `userId`. A CHECK keeps
 * `fineli_unit` to the units the API names, so the cast is safe.
 */
export const portionOf = (row: typeof foodPortions.$inferSelect, userId: string): Portion => ({
  id: row.id,
  unit: row.fineliUnit as Portion["unit"],
  name: row.name,
  grams: row.grams,
  isOwn: row.userId === userId,
});
