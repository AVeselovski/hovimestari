import {
  MAX_FOOD_NAME_LENGTH,
  macroSumWithinLimit,
  type IncompleteReason,
  type ProductValues,
} from "@hovimestari/types";
import { z } from "zod";

// From an Open Food Facts answer to a food. Pure: the client parses the body
// with `OffBodySchema`, and `foodOf` decides what is kept.

/** A number, or a string that holds one. Anything else counts as missing. */
const lenientNumber = z.unknown().transform((v): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^\s*-?[0-9]+(\.[0-9]+)?\s*$/.test(v)) return Number(v);
  return null;
});

/** A string, else null. An empty one stays empty: `tidy` and the name fallback handle it. */
const lenientString = z.unknown().transform((v): string | null => (typeof v === "string" ? v : null));

/** The product fields the lookup asks for. A field of the wrong type counts as missing. */
const OffProductSchema = z.object({
  code: lenientString.optional(),
  product_name: lenientString.optional(),
  product_name_fi: lenientString.optional(),
  product_name_en: lenientString.optional(),
  brands: lenientString.optional(),
  no_nutrition_data: z.unknown().optional(),
  nutriments: z
    .unknown()
    .transform((v) => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}))
    .optional(),
});

/**
 * An answer of `GET /api/v2/product/{code}`. Its top-level `code` echoes the
 * code asked for and is not read: only `product.code` is the product's own.
 */
export const OffBodySchema = z.object({
  status: lenientNumber,
  product: z
    .unknown()
    .transform((v) => OffProductSchema.safeParse(v))
    .transform((r) => (r.success ? r.data : null))
    .optional(),
});

export type OffProduct = NonNullable<NonNullable<z.infer<typeof OffBodySchema>["product"]>>;

/** What a stored Open Food Facts food holds. */
export interface KeptFood {
  name: string;
  nameEn: string | null;
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export type ProductOutcome =
  | { kind: "complete"; food: KeptFood }
  | { kind: "incomplete"; reason: IncompleteReason; name: string | null; per100g: ProductValues };

/** Kilojoules per kilocalorie, as the Fineli import converts. */
const KJ_PER_KCAL = 4.184;

const round = (v: number, decimals: number) => Math.round(v * 10 ** decimals) / 10 ** decimals;
/**
 * C0 and C1 control characters, and the bidi controls (U+200E, U+200F,
 * U+061C, U+202A to U+202E, U+2066 to U+2069). Names are edited by anyone at
 * Open Food Facts: Postgres refuses a NUL in text, and a bidi control
 * reorders a name on screen.
 */
const CONTROLS = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
/** White space as single spaces, controls dropped, trimmed. A name of controls only ends up empty. */
const tidy = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, " ").replace(CONTROLS, "").replace(/ {2,}/g, " ").trim();
const folded = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en");

/** Cut at a word boundary to the food name's length, with no trailing comma or space. */
function cut(name: string): string {
  if (name.length <= MAX_FOOD_NAME_LENGTH) return name;
  const head = name.slice(0, MAX_FOOD_NAME_LENGTH + 1);
  const space = head.lastIndexOf(" ");
  const kept = space > 0 ? head.slice(0, space) : name.slice(0, MAX_FOOD_NAME_LENGTH);
  return kept.replace(/[\s,]+$/, "");
}

/** `name` with the first brand after a comma, unless the name already holds it. */
function withBrand(name: string, brands: string | null | undefined): string {
  const brand = tidy((brands ?? "").split(",")[0]);
  if (!brand || folded(name).includes(folded(brand))) return cut(name);
  return cut(`${name}, ${brand}`);
}

/** The names a product is kept under: Finnish first, then the product's own, then English. */
export function namesOf(product: OffProduct): { name: string | null; nameEn: string | null } {
  const base = [product.product_name_fi, product.product_name, product.product_name_en].map(tidy).find(Boolean);
  if (!base) return { name: null, nameEn: null };
  const en = tidy(product.product_name_en);
  return {
    name: withBrand(base, product.brands),
    nameEn: en && en !== base ? withBrand(en, product.brands) : null,
  };
}

const NO_DATA_OFF = new Set(["", "0", "off", "false", "no"]);

/** Whether Open Food Facts marks the product as having no nutrition facts. */
function hasNoNutritionData(v: unknown): boolean {
  if (v === undefined || v === null || v === false || v === 0) return false;
  return typeof v === "string" ? !NO_DATA_OFF.has(v.trim().toLowerCase()) : true;
}

/** The four values per 100 g, each null when missing. Energy from kJ when no kcal is given. */
export function valuesOf(product: OffProduct): ProductValues {
  const n = product.nutriments ?? {};
  const read = (key: string) => lenientNumber.parse(n[key]);
  const kcal = read("energy-kcal_100g");
  const kj = read("energy-kj_100g");
  const energy = kcal ?? (kj === null ? null : kj / KJ_PER_KCAL);
  const macro = (key: string) => {
    const v = read(key);
    return v === null ? null : round(v, 3);
  };
  return {
    energyKcal: energy === null ? null : round(energy, 2),
    proteinG: macro("proteins_100g"),
    carbsG: macro("carbohydrates_100g"),
    fatG: macro("fat_100g"),
  };
}

/** Whether the four values can all be right: in the catalogue's ranges and within the own-food macro sum. */
function plausible(v: { energyKcal: number; proteinG: number; carbsG: number; fatG: number }): boolean {
  const macros = [v.proteinG, v.carbsG, v.fatG];
  return v.energyKcal >= 0 && v.energyKcal <= 1000 && macros.every((m) => m >= 0 && m <= 100) && macroSumWithinLimit(v);
}

/** What to keep of a product: a complete food, or what was there for the own-food form to start from. */
export function foodOf(product: OffProduct): ProductOutcome {
  const { name, nameEn } = namesOf(product);
  const per100g = valuesOf(product);
  const { energyKcal, proteinG, carbsG, fatG } = per100g;
  if (
    name === null ||
    hasNoNutritionData(product.no_nutrition_data) ||
    energyKcal === null ||
    proteinG === null ||
    carbsG === null ||
    fatG === null
  ) {
    return { kind: "incomplete", reason: "missing_values", name, per100g };
  }
  const values = { energyKcal, proteinG, carbsG, fatG };
  if (!plausible(values)) return { kind: "incomplete", reason: "implausible_values", name, per100g };
  return { kind: "complete", food: { name, nameEn, ...values } };
}
