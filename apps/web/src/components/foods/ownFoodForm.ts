import { parseDecimalInput } from "@/lib/decimalInput";
import { formatDecimalForField } from "@/lib/foodFormat";
import {
  OwnFoodBodySchema,
  OwnFoodUpdateBodySchema,
  PortionBodySchema,
  type ErrorCode,
  type FoodDetail,
  type OwnFoodBody,
  type Portion,
  type PortionBody,
} from "@hovimestari/types";

// ---------------------------------------------------------------------------
// The own-food and portion forms as typed, and the one check each runs before
// it sends anything: every number through `parseDecimalInput` with the
// decimals its column holds, then the whole through the shared schema the
// server runs, so a field shows the code its server would answer. A number
// that may hold a thousands group gets its own line (`digit_group`), which
// is the form's, not the server's.
// ---------------------------------------------------------------------------

/** A field's error: a server code, or the form's own line for a possible thousands group. */
export type FieldError = ErrorCode | "digit_group";

export const OWN_FOOD_FIELDS = ["name", "energy", "protein", "carbs", "fat", "barcode"] as const;
export type OwnFoodField = (typeof OWN_FOOD_FIELDS)[number];
export type OwnFoodValues = Record<OwnFoodField, string>;
export type OwnFoodErrors = Partial<Record<OwnFoodField, FieldError>>;

/** The four values: their place in `per100g`, the decimals their column holds, the code for a bad one. */
const VALUES = {
  energy: { key: "energyKcal", decimals: 2, invalid: "food_energy_invalid" },
  protein: { key: "proteinG", decimals: 3, invalid: "food_macro_invalid" },
  carbs: { key: "carbsG", decimals: 3, invalid: "food_macro_invalid" },
  fat: { key: "fatG", decimals: 3, invalid: "food_macro_invalid" },
} as const;
type ValueField = keyof typeof VALUES;
const VALUE_FIELDS = Object.keys(VALUES) as ValueField[];

/** A new food's form: every field empty, so the app offers no number. */
export function emptyOwnFood(name = ""): OwnFoodValues {
  return { name, energy: "", protein: "", carbs: "", fat: "", barcode: "" };
}

/** An own food's form, from its detail: what was saved, as it would be typed. */
export function ownFoodValuesOf(food: FoodDetail): OwnFoodValues {
  return {
    name: food.name,
    energy: formatDecimalForField(food.per100g.energyKcal),
    protein: formatDecimalForField(food.per100g.proteinG),
    carbs: formatDecimalForField(food.per100g.carbsG),
    fat: formatDecimalForField(food.per100g.fatG),
    barcode: food.barcode ?? "",
  };
}

export type Parsed<B, E> = { ok: true; body: B } | { ok: false; errors: E };

/** What an edit started from: the form as it opened, and the food's saved figures. */
export interface SavedOwnFood {
  values: OwnFoodValues;
  per100g: FoodDetail["per100g"];
}

/**
 * Parses the form. `saved` is what an edit opened on.
 *
 * A value left as it opened keeps its saved figure and is not parsed. A
 * figure with three decimals, such as one an assistant saved, reads like a
 * thousands group when typed, and an edit of something else must not fail
 * on it.
 *
 * A name left as saved is not checked for search, as the server checks only
 * a changed one, so an edit of the values never fails on the name it has.
 */
export function parseOwnFood(values: OwnFoodValues, saved?: SavedOwnFood): Parsed<OwnFoodBody, OwnFoodErrors> {
  const errors: OwnFoodErrors = {};
  const per100g: Partial<Record<(typeof VALUES)[ValueField]["key"], number>> = {};
  for (const field of VALUE_FIELDS) {
    const { key, decimals, invalid } = VALUES[field];
    if (saved && values[field] === saved.values[field]) {
      per100g[key] = saved.per100g[key];
      continue;
    }
    const parsed = parseDecimalInput(values[field], { maxDecimals: decimals });
    if (parsed.kind === "empty") errors[field] = "food_value_required";
    else if (parsed.kind === "group") errors[field] = "digit_group";
    else if (parsed.kind === "invalid") errors[field] = invalid;
    else per100g[key] = parsed.value;
  }
  const barcode = values.barcode.trim();
  const keptName = saved !== undefined && values.name.trim() === saved.values.name.trim();
  const schema = keptName ? OwnFoodUpdateBodySchema : OwnFoodBodySchema;
  const result = schema.safeParse({ name: values.name, per100g, barcode: barcode === "" ? null : barcode });
  if (result.success && Object.keys(errors).length === 0) return { ok: true, body: result.data };
  for (const issue of result.success ? [] : result.error.issues) {
    const [first, second] = issue.path.map(String);
    const field =
      first === "per100g" ? VALUE_FIELDS.find((f) => VALUES[f].key === second) : (first as OwnFoodField | undefined);
    // A field that did not parse keeps the code that says why.
    if (field && OWN_FOOD_FIELDS.includes(field)) errors[field] ??= issue.message as ErrorCode;
  }
  return { ok: false, errors };
}

export type PortionField = "name" | "grams";
export type PortionValues = Record<PortionField, string>;
export type PortionErrors = Partial<Record<PortionField, FieldError>>;

export const EMPTY_PORTION: PortionValues = { name: "", grams: "" };

/** A portion's form, from the portion: what was saved, as it would be typed. */
export function portionValuesOf(portion: Portion): PortionValues {
  return { name: portion.name ?? "", grams: formatDecimalForField(portion.grams) };
}

export function parsePortion(values: PortionValues): Parsed<PortionBody, PortionErrors> {
  const errors: PortionErrors = {};
  const parsed = parseDecimalInput(values.grams, { maxDecimals: 1 });
  if (parsed.kind === "group") errors.grams = "digit_group";
  else if (parsed.kind !== "number") errors.grams = "portion_grams_invalid";
  const result = PortionBodySchema.safeParse({
    name: values.name,
    grams: parsed.kind === "number" ? parsed.value : undefined,
  });
  if (result.success && Object.keys(errors).length === 0) return { ok: true, body: result.data };
  for (const issue of result.success ? [] : result.error.issues) {
    const field = String(issue.path[0]) as PortionField;
    if (field === "name" || field === "grams") errors[field] ??= issue.message as ErrorCode;
  }
  return { ok: false, errors };
}

/** Which field a server refusal belongs to, or null for one that belongs to no field. */
export function ownFoodFieldOf(code: ErrorCode | undefined): OwnFoodField | null {
  switch (code) {
    case "food_name_required":
    case "food_name_too_long":
    case "food_name_not_searchable":
      return "name";
    case "barcode_invalid":
    case "barcode_taken":
      return "barcode";
    default:
      return null;
  }
}
