import { z } from "zod";
import { IsoDateSchema } from "./dates.js";
import { hasAtMostDecimals } from "./numbers.js";

/** The largest calorie bound, in kcal. A storage limit, not a judgement. */
export const MAX_ENERGY_TARGET_KCAL = 99_999.9;
/** The largest protein bound, in grams. A storage limit, not a judgement. */
export const MAX_PROTEIN_TARGET_G = 9_999.9;

/**
 * One bound of a range. Refused codes: target_required (missing),
 * target_value_invalid (not a number, more than one decimal, above `max`),
 * target_not_positive (zero or below).
 */
const bound = (max: number) =>
  z
    .number({ error: (issue) => (issue.input === undefined ? "target_required" : "target_value_invalid") })
    .refine((v) => v > 0, { error: "target_not_positive" })
    .refine((v) => v <= max && hasAtMostDecimals(v, 1), { error: "target_value_invalid" });

/** A lower and an upper bound. Equal bounds are a valid range. */
const range = (max: number) =>
  z
    .object({ lower: bound(max), upper: bound(max) })
    .refine((r) => r.lower <= r.upper, { error: "target_lower_above_upper", path: ["upper"] });

/** Keyed by nutrient. Carbohydrate and fat arrive later as optional keys. */
export const TargetRangesSchema = z.object({
  energyKcal: range(MAX_ENERGY_TARGET_KCAL),
  proteinG: range(MAX_PROTEIN_TARGET_G),
});
export const SetTargetsBodySchema = z.object({ ranges: TargetRangesSchema });

/** One dated change: the complete set of targets in force from `effectiveFrom`. */
export const TargetChangeSchema = z.object({
  effectiveFrom: IsoDateSchema,
  ranges: TargetRangesSchema,
  updatedAt: z.iso.datetime(),
});

/**
 * The targets in force on `date`, every change, and the user's `today`.
 * `inForce` is null on a date before the first change, so it can be null
 * while `changes` is not empty, and always for a user with no changes.
 */
export const TargetsOverviewSchema = z.object({
  date: IsoDateSchema,
  today: IsoDateSchema,
  inForce: TargetChangeSchema.nullable(),
  changes: z.array(TargetChangeSchema),
});

/** The query of `GET /targets`. Without `date`, the user's today. */
export const TargetsQuerySchema = z.object({ date: IsoDateSchema.optional() });

export type TargetRange = { lower: number; upper: number };
export type TargetRanges = z.infer<typeof TargetRangesSchema>;
export type SetTargetsBody = z.infer<typeof SetTargetsBodySchema>;
export type TargetChange = z.infer<typeof TargetChangeSchema>;
export type TargetsOverview = z.infer<typeof TargetsOverviewSchema>;
export type TargetsQuery = z.infer<typeof TargetsQuerySchema>;
