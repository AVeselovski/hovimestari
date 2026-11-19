import { z } from "zod";
import { BarcodeSchema, FoodDetailSchema } from "./foods.js";

/**
 * The barcode formats a camera decoder reports for an 8-digit code. An
 * 8-digit code can be a valid EAN-8 and a valid UPC-E at once, and the
 * format decides which it is. A typed code has none.
 */
export const BARCODE_FORMATS = ["ean_8", "upc_e"] as const;

/**
 * The body of `POST /foods/lookup`. `format` is sent by a scan only. It
 * settles only an 8-digit code, which can read two ways. At 12 to 14 digits
 * a code reads one way and `format` is ignored, so a scan may send the
 * decoder's format with any code.
 */
export const BarcodeLookupBodySchema = z.object({
  barcode: BarcodeSchema,
  format: z.enum(BARCODE_FORMATS, { error: "barcode_invalid" }).optional(),
});

/** What Open Food Facts had for a product, any value possibly missing or out of range. */
export const ProductValuesSchema = z.object({
  energyKcal: z.number().nullable(),
  proteinG: z.number().nullable(),
  carbsG: z.number().nullable(),
  fatG: z.number().nullable(),
});

/** Why a product from Open Food Facts was not kept. */
export const INCOMPLETE_REASONS = ["missing_values", "implausible_values"] as const;

/** What `POST /foods/lookup` answers. */
export const BarcodeLookupSchema = z.discriminatedUnion("result", [
  /**
   * `newlyVisible`: this lookup made the food visible to this user (their
   * `food_lookups` row was inserted, not updated), so their cached searches
   * are stale. Never says whether another user looked the product up.
   */
  z.object({ result: z.literal("found"), food: FoodDetailSchema, newlyVisible: z.boolean() }),
  /** Open Food Facts has the product without four usable values. Nothing is kept. */
  z.object({
    result: z.literal("incomplete"),
    barcode: z.string(),
    reason: z.enum(INCOMPLETE_REASONS),
    product: z.object({ name: z.string().nullable(), per100g: ProductValuesSchema }),
  }),
  z.object({ result: z.literal("not_found"), barcode: z.string() }),
  /** A shop's own number for a weighed or priced item. Never sent, never stored. */
  z.object({ result: z.literal("in_store"), barcode: z.string() }),
]);

export type BarcodeFormat = (typeof BARCODE_FORMATS)[number];
export type BarcodeLookupBody = z.infer<typeof BarcodeLookupBodySchema>;
export type ProductValues = z.infer<typeof ProductValuesSchema>;
export type IncompleteReason = (typeof INCOMPLETE_REASONS)[number];
export type BarcodeLookup = z.infer<typeof BarcodeLookupSchema>;
