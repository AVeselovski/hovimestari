import { barcodeOf, sameBarcode } from "@/lib/barcode";
import { parseDecimalInput } from "@/lib/decimalInput";
import { compareNames } from "@/lib/foodCache";
import { formatDecimalForField } from "@/lib/foodFormat";
import {
  hasSearchableWord,
  isWellFormedBarcode,
  MAX_NEW_FOOD_PORTIONS,
  OwnFoodUpdateBodySchema,
  PortionBodySchema,
  type ErrorCode,
  type FoodDetail,
  type FoodSource,
  type OwnFoodUpdateBody,
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

/** What Open Food Facts gave for a value: a number, or null when it had none. */
type StartPer100g = Partial<Record<(typeof VALUES)[ValueField]["key"], number | null>>;

/**
 * What a new own food's form starts from: a name typed in the search, what
 * a barcode lookup or a kept product brought back (the barcode, the product's
 * name, any value that is a number), or a Fineli or Open Food Facts food
 * copied with its portions. Every part is optional. `from` says whose values
 * the form opens with, so it asks to check them against the label.
 * `copied` marks a copy of a whole food, whose values are all there, so the
 * form says whose they are rather than asking to copy them from the label.
 * `portions` are the ones the new food comes with, saved with it.
 */
export interface OwnFoodStart {
  name?: string;
  barcode?: string;
  per100g?: StartPer100g;
  from?: "open_food_facts" | "fineli";
  copied?: true;
  portions?: PortionBody[];
}

export type Parsed<B, E> = { ok: true; body: B } | { ok: false; errors: E };

/**
 * What the form opened on: the form as it opened, the figures its values
 * stand for, and whether it is a saved food (an edit) or a start, whose name
 * and barcode are new.
 */
export interface OwnFoodBaseline {
  values: OwnFoodValues;
  per100g: Partial<FoodDetail["per100g"]>;
  saved: boolean;
}

/**
 * What a form opens on, from a start: each value that is a number, as it
 * would be typed, and the rest empty, with the figures `parseOwnFood` reads
 * an untouched value from, so 3.125 g saves as 3.125 g. A start's name is a
 * new name.
 */
export function startOf(start: OwnFoodStart = {}): OwnFoodBaseline {
  const values = { ...emptyOwnFood(start.name ?? ""), barcode: start.barcode ?? "" };
  const per100g: OwnFoodBaseline["per100g"] = {};
  for (const field of VALUE_FIELDS) {
    const value = start.per100g?.[VALUES[field].key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    values[field] = formatDecimalForField(value);
    per100g[VALUES[field].key] = value;
  }
  return { values, per100g, saved: false };
}

/** An edit's baseline: the food as saved, built as a start is, with its name kept as saved. */
export function savedBaselineOf(food: FoodDetail): OwnFoodBaseline {
  return {
    ...startOf({ name: food.name, barcode: food.barcode ?? undefined, per100g: food.per100g }),
    saved: true,
  };
}

/** A food Copy to my foods takes: one from Fineli or Open Food Facts, which nobody edits. */
export type CopyableFood = FoodDetail & { source: Exclude<FoodSource, "user"> };

/** Whether Copy to my foods takes `food`: not the user's own, which is edited instead. */
export function isCopyable(food: FoodDetail): food is CopyableFood {
  return food.source !== "user";
}

/**
 * The start Copy to my foods opens the form with: the food's name, its
 * figures, its barcode and its portions, marked by where they came from, so
 * the form asks to check each value against the label. Each portion is named
 * by `label`: a Fineli measure by the catalog's name for it, such as
 * Tablespoon, an own portion by its own name. Only the portions the server
 * takes are kept, at most `MAX_NEW_FOOD_PORTIONS`, Fineli's first, so a save
 * never meets a portion refusal the person cannot see or fix. They are then
 * listed by name, in the order the saved food lists its own portions, so the
 * list does not reshuffle across Save.
 */
export function copyStartOf(food: CopyableFood, label: (portion: Portion) => string): OwnFoodStart {
  const portions: PortionBody[] = [];
  for (const portion of food.portions) {
    const parsed = PortionBodySchema.safeParse({ name: label(portion), grams: portion.grams });
    if (parsed.success) portions.push(parsed.data);
  }
  return {
    name: food.name,
    barcode: food.barcode ?? undefined,
    per100g: food.per100g,
    from: food.source,
    copied: true,
    portions: portions.slice(0, MAX_NEW_FOOD_PORTIONS).sort((a, b) => compareNames(a.name, b.name)),
  };
}

/**
 * Parses the form against what it opened on.
 *
 * A value left as it opened keeps the figure it stands for and is not
 * parsed. A figure with three decimals, such as one an assistant saved or
 * one Open Food Facts gave, reads like a thousands group when typed, and a
 * save must not fail on a value the person never touched. The figure then
 * takes the same ranges and sum as a typed one.
 *
 * A saved name left as it was is not checked for search, and a saved
 * barcode left as it was is not checked for its last digit, as the server
 * checks only a changed one, so an edit of the values never fails on the
 * name or the barcode it has. A barcode counts as left when it is the same
 * code padded to 14 digits, the server's rule. A start's name and barcode
 * are new and are always checked.
 */
export function parseOwnFood(
  values: OwnFoodValues,
  baseline?: OwnFoodBaseline,
): Parsed<OwnFoodUpdateBody, OwnFoodErrors> {
  const errors: OwnFoodErrors = {};
  const per100g: Partial<Record<(typeof VALUES)[ValueField]["key"], number>> = {};
  for (const field of VALUE_FIELDS) {
    const { key, decimals, invalid } = VALUES[field];
    const kept = baseline?.per100g[key];
    if (baseline && kept !== undefined && values[field] === baseline.values[field]) {
      per100g[key] = kept;
      continue;
    }
    const parsed = parseDecimalInput(values[field], { maxDecimals: decimals });
    if (parsed.kind === "empty") errors[field] = "food_value_required";
    else if (parsed.kind === "group") errors[field] = "digit_group";
    else if (parsed.kind === "invalid") errors[field] = invalid;
    else per100g[key] = parsed.value;
  }
  const barcode = values.barcode.trim();
  // Any name and any 8 to 14 digits parse, as for an edit on the server.
  const result = OwnFoodUpdateBodySchema.safeParse({
    name: values.name,
    per100g,
    barcode: barcode === "" ? null : barcode,
  });
  for (const issue of result.success ? [] : result.error.issues) {
    const [first, second] = issue.path.map(String);
    const field =
      first === "per100g" ? VALUE_FIELDS.find((f) => VALUES[f].key === second) : (first as OwnFoodField | undefined);
    // A field that did not parse keeps the code that says why.
    if (field && OWN_FOOD_FIELDS.includes(field)) errors[field] ??= issue.message as ErrorCode;
  }
  // What is new then takes the check a new food's takes, each on its own, so
  // a rename never fails on a barcode the food already holds, nor a new
  // barcode on the name it has.
  const saved = baseline?.saved === true ? baseline.values : null;
  const name = values.name.trim();
  if (saved?.name.trim() !== name && !hasSearchableWord(name)) errors.name ??= "food_name_not_searchable";
  const code = barcodeOf(barcode);
  const barcodeChanged = saved === null || !sameBarcode(code, barcodeOf(saved.barcode));
  if (code !== null && barcodeChanged && !isWellFormedBarcode(code)) errors.barcode ??= "barcode_wrong_digits";
  if (result.success && Object.keys(errors).length === 0) return { ok: true, body: result.data };
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
    case "barcode_wrong_digits":
      return "barcode";
    case "food_macro_sum_too_high":
      return "fat";
    default:
      return null;
  }
}

/** The three macros, which one refusal can be about together. */
const MACRO_FIELDS = ["protein", "carbs", "fat"] as const satisfies readonly OwnFoodField[];

/**
 * The fields a set of errors marks invalid, in the form's order. The macros'
 * sum is refused under Fat, the last of the three, and marks all three, so
 * the eye and a screen reader both see the line is about the three together.
 */
export function markedFields(errors: OwnFoodErrors): OwnFoodField[] {
  const sum = errors.fat === "food_macro_sum_too_high";
  return OWN_FOOD_FIELDS.filter(
    (f) => errors[f] !== undefined || (sum && (MACRO_FIELDS as readonly OwnFoodField[]).includes(f)),
  );
}

/** True when a field shares the macros' sum line under Fat rather than a line of its own. */
export function sharesSumLine(field: OwnFoodField, errors: OwnFoodErrors): boolean {
  return errors.fat === "food_macro_sum_too_high" && (field === "protein" || field === "carbs");
}
