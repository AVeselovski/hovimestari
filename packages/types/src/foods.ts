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

export const FoodDetailSchema = FoodSummarySchema.extend({
  /** Only ever set on the user's own food. */
  barcode: z.string().nullable(),
  fineli: z.object({ id: z.number().int(), type: z.string(), process: z.string() }).nullable(),
  /** Fineli's first in a fixed unit order, then the user's by name. */
  portions: z.array(PortionSchema),
});

export const FoodListSchema = z.object({ foods: z.array(FoodSummarySchema) });

/** The query of `GET /foods/search`. A bad one answers invalid_request: no screen can send it. */
export const FoodSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).default(30),
});

/** The query of `GET /foods/favourites` and `GET /foods/own`. */
export const FoodListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
});

export const OwnFoodBodySchema = z.object({
  name: z
    .string({ error: "food_name_required" })
    .trim()
    .min(1, { error: "food_name_required" })
    .max(MAX_FOOD_NAME_LENGTH, { error: "food_name_too_long" }),
  per100g: Per100gSchema,
  barcode: z
    .string({ error: "barcode_invalid" })
    .trim()
    .regex(/^[0-9]{8,14}$/, { error: "barcode_invalid" })
    .nullable()
    .default(null),
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
export type FoodDetail = z.infer<typeof FoodDetailSchema>;
export type FoodList = z.infer<typeof FoodListSchema>;
export type FoodSearchQuery = z.infer<typeof FoodSearchQuerySchema>;
export type FoodListQuery = z.infer<typeof FoodListQuerySchema>;
export type OwnFoodBody = z.infer<typeof OwnFoodBodySchema>;
export type PortionBody = z.infer<typeof PortionBodySchema>;
