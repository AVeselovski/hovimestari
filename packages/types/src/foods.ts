import { z } from "zod";
import { hasAtMostDecimals } from "./numbers.js";

/** Where a food comes from. */
export const FOOD_SOURCES = ["fineli", "open_food_facts", "user"] as const;
/** The Fineli household measures the catalogue keeps, in the order a food's detail lists them. */
export const FINELI_PORTION_UNITS = [
  "KPL_S",
  "KPL_M",
  "KPL_L",
  "KPL_VALM",
  "PORTS",
  "PORTM",
  "PORTL",
  "DL",
  "RKL",
  "TL",
] as const;
/** The languages a user can read food names in. */
export const FOOD_NAME_LANGUAGES = ["fi", "en"] as const;

/** The longest own food name, in characters. */
export const MAX_FOOD_NAME_LENGTH = 120;
/** The longest portion name, in characters. */
export const MAX_PORTION_NAME_LENGTH = 60;
/** The heaviest portion, in grams. */
export const MAX_PORTION_GRAMS = 5000;
/** The most results a search answers. */
export const MAX_SEARCH_LIMIT = 50;
/** How many foods a favourites or own-foods list answers by default, and at most. */
export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 200;

/** A value per 100 g, from 0 to `max`, with at most the decimals its column holds. */
const value = (code: "food_energy_invalid" | "food_macro_invalid", max: number, decimals: number) =>
  z
    .number({ error: (issue) => (issue.input === undefined ? "food_value_required" : code) })
    .min(0, { error: code })
    .max(max, { error: code })
    .refine((v) => hasAtMostDecimals(v, decimals), { error: code });

/** Energy in kcal and the three macros in grams, per 100 g. */
export const Per100gSchema = z.object({
  energyKcal: value("food_energy_invalid", 1000, 2),
  proteinG: value("food_macro_invalid", 100, 3),
  carbsG: value("food_macro_invalid", 100, 3),
  fatG: value("food_macro_invalid", 100, 3),
});

/** The most protein, carbohydrate and fat an own food holds together, in grams per 100 g. */
export const MAX_MACRO_SUM_G = 100;
/** What the sum may pass that by: three label values, each rounded by up to 0.5 g. */
export const MACRO_SUM_ROUNDING_G = 1.5;

/**
 * Whether protein, carbohydrates and fat together are at most 100 g with the
 * rounding allowance, so 101.5 passes and 101.501 does not. The sum is taken
 * in thousandths, the macros' stored precision, so floating point cannot tip
 * it (30.1 + 34.2 + 37.2 adds to 101.50000000000001). The own-food body and
 * the barcode lookup's check of an Open Food Facts product both call it.
 */
export function macroSumWithinLimit(v: { proteinG: number; carbsG: number; fatG: number }): boolean {
  return (
    Math.round(v.proteinG * 1000) + Math.round(v.carbsG * 1000) + Math.round(v.fatG * 1000) <=
    (MAX_MACRO_SUM_G + MACRO_SUM_ROUNDING_G) * 1000
  );
}

/**
 * An own food's values: the shared shape, and its three macros within
 * `macroSumWithinLimit`. Reported on fat, the last macro, as a range reports
 * on its upper bound. It runs only once each macro passed its own check.
 * Reads keep `Per100gSchema`, so a food stored with a larger sum still reads.
 */
const OwnFoodPer100gSchema = Per100gSchema.refine(macroSumWithinLimit, {
  error: "food_macro_sum_too_high",
  path: ["fatG"],
  when: (payload) => payload.issues.length === 0,
});

/** A barcode as typed or scanned: spaces removed, 8 to 14 digits. The own-food body and the lookup read it one way. */
export const BarcodeSchema = z
  .string({ error: "barcode_invalid" })
  .transform((s) => s.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^[0-9]{8,14}$/, { error: "barcode_invalid" }));

/** A food as a list shows it. `name` is in the user's food-name language. */
export const FoodSummarySchema = z.object({
  id: z.uuid(),
  source: z.enum(FOOD_SOURCES),
  name: z.string(),
  /** The other language's name when it differs, else null. */
  otherName: z.string().nullable(),
  per100g: Per100gSchema,
  isFavourite: z.boolean(),
  isOwn: z.boolean(),
  retired: z.boolean(),
});

/** A way to enter grams: a Fineli measure (`unit`) or the user's own label (`name`). */
export const PortionSchema = z.object({
  id: z.uuid(),
  unit: z.enum(FINELI_PORTION_UNITS).nullable(),
  name: z.string().nullable(),
  grams: z.number(),
  isOwn: z.boolean(),
});

/**
 * The amount of a food's latest eaten entry, offered the next time. `portion`
 * is set when it was entered as a count of a portion, and its `id` is null
 * when that portion no longer exists.
 */
export const LastAmountSchema = z.object({
  grams: z.number(),
  portion: z
    .object({
      id: z.uuid().nullable(),
      unit: z.enum(FINELI_PORTION_UNITS).nullable(),
      name: z.string().nullable(),
      count: z.number(),
    })
    .nullable(),
});

export const FoodDetailSchema = FoodSummarySchema.extend({
  /** Set on an own food that has one and on every Open Food Facts food. */
  barcode: z.string().nullable(),
  fineli: z.object({ id: z.number().int(), type: z.string(), process: z.string() }).nullable(),
  /** Fineli's first in a fixed unit order, then the user's by name. */
  portions: z.array(PortionSchema),
  /** The amount the user last ate of it, or null. */
  lastAmount: LastAmountSchema.nullable(),
});

export const FoodListSchema = z.object({ foods: z.array(FoodSummarySchema) });

/** `GET /foods/search`. `near` holds foods with all words but one, and is empty unless few foods have them all. */
export const FoodSearchResultSchema = z.object({
  foods: z.array(FoodSummarySchema),
  near: z.array(FoodSummarySchema),
});

/** A favourite food with the amount the user last ate of it. */
export const FavouriteFoodSchema = FoodSummarySchema.extend({ lastAmount: LastAmountSchema.nullable() });
export const FavouriteFoodListSchema = z.object({ foods: z.array(FavouriteFoodSchema) });

/**
 * A control character search text may not hold: NUL, which Postgres refuses,
 * and the other C0 and C1 controls. White space is text here, so a tab or a
 * line break between words passes, and so does every format character: search
 * drops what is not a letter or a digit. Narrower than the rule for a
 * connection's name in `connections.ts`, which is stored and shown.
 */
const SEARCH_CONTROL = /(?!\s)\p{Cc}/u;

/** The query of `GET /foods/search`. A bad one answers invalid_request: no screen can send it. */
export const FoodSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((text) => !SEARCH_CONTROL.test(text)),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).default(30),
});

/** The query of `GET /foods/favourites` and `GET /foods/own`. */
export const FoodListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
});

/**
 * Whether `name` holds a word search can find: two letters or digits in a
 * row. Search drops shorter words, so a name without one could never be
 * found. The backend checks the same rule with the search's own SQL.
 */
export function hasSearchableWord(name: string): boolean {
  return /[\p{L}\p{Nd}]{2,}/u.test(name.normalize("NFC"));
}

/** An own food's name, trimmed and within its length. Searchability is checked where a name is new. */
const OwnFoodNameSchema = z
  .string({ error: "food_name_required" })
  .trim()
  .min(1, { error: "food_name_required" })
  .max(MAX_FOOD_NAME_LENGTH, { error: "food_name_too_long" });

/**
 * The body of `PUT /foods/:id`. The name is not checked for search here: the
 * service checks it only when it changes, so a food whose saved name search
 * cannot find can still have its values edited.
 */
export const OwnFoodUpdateBodySchema = z.object({
  name: OwnFoodNameSchema,
  per100g: OwnFoodPer100gSchema,
  barcode: BarcodeSchema.nullable().default(null),
});

/** The body of `POST /foods`: a new name must hold a word search can find. */
export const OwnFoodBodySchema = OwnFoodUpdateBodySchema.extend({
  name: OwnFoodNameSchema.refine(hasSearchableWord, { error: "food_name_not_searchable" }),
});

export const PortionBodySchema = z.object({
  name: z
    .string({ error: "portion_name_required" })
    .trim()
    .min(1, { error: "portion_name_required" })
    .max(MAX_PORTION_NAME_LENGTH, { error: "portion_name_too_long" }),
  grams: z
    .number({ error: "portion_grams_invalid" })
    .refine((v) => v > 0 && v <= MAX_PORTION_GRAMS && hasAtMostDecimals(v, 1), { error: "portion_grams_invalid" }),
});

export type FoodSource = (typeof FOOD_SOURCES)[number];
export type FineliPortionUnit = (typeof FINELI_PORTION_UNITS)[number];
export type FoodNameLanguage = (typeof FOOD_NAME_LANGUAGES)[number];
export type Per100g = z.infer<typeof Per100gSchema>;
export type FoodSummary = z.infer<typeof FoodSummarySchema>;
export type Portion = z.infer<typeof PortionSchema>;
export type LastAmount = z.infer<typeof LastAmountSchema>;
export type FoodDetail = z.infer<typeof FoodDetailSchema>;
export type FavouriteFood = z.infer<typeof FavouriteFoodSchema>;
export type FavouriteFoodList = z.infer<typeof FavouriteFoodListSchema>;
export type FoodList = z.infer<typeof FoodListSchema>;
export type FoodSearchResult = z.infer<typeof FoodSearchResultSchema>;
export type FoodSearchQuery = z.infer<typeof FoodSearchQuerySchema>;
export type FoodListQuery = z.infer<typeof FoodListQuerySchema>;
export type OwnFoodBody = z.infer<typeof OwnFoodBodySchema>;
export type PortionBody = z.infer<typeof PortionBodySchema>;
