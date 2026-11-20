import { parseDecimalInput } from "@/lib/decimalInput";
import { newId } from "@/lib/newId";
import {
  entryFigures,
  recipeBasis,
  RecipeEditBodySchema,
  type ErrorCode,
  type Figures,
  type FineliPortionUnit,
  type FoodSource,
  type IngredientLineBody,
  type IngredientUnit,
  type Recipe,
  type RecipeEditBody,
  type RecipeLine,
} from "@hovimestari/types";

// ---------------------------------------------------------------------------
// A recipe as the editor holds it while it is typed: each field as text, and
// each line with what the screen needs to show it and compute with it. The
// figures come from `recipeBasis`, the function the server runs on the same
// lines, so the figures in the editor are the figures the save stores.
// ---------------------------------------------------------------------------

/** A line's food, as the editor needs it: its name to show and its values to compute with. */
export interface DraftFood {
  id: string;
  name: string;
  source: FoodSource;
  per100g: Figures;
  retired: boolean;
  deleted: boolean;
}

/** An amount as a count of one of the food's portions. */
export interface DraftPortion {
  id: string;
  unit: FineliPortionUnit | null;
  name: string | null;
  count: number;
}

/** The recipe's own words for an amount, shown beside the grams. */
export interface DraftWritten {
  amount: number;
  unit: IngredientUnit;
}

/** A line that counts: a food and its weight, the weight typed in grams or as a count of a portion. */
export interface CountedDraft {
  kind: "counted";
  id: string;
  food: DraftFood;
  grams: number;
  portion: DraftPortion | null;
  written: DraftWritten | null;
  note: string | null;
}

/** A line not counted, such as salt: a name, and the recipe's words for its amount. */
export interface PlainDraft {
  kind: "plain";
  id: string;
  name: string;
  written: DraftWritten | null;
  note: string | null;
}

export type DraftLine = CountedDraft | PlainDraft;

/** The editor's fields. */
export interface RecipeDraft {
  name: string;
  servings: string;
  time: string;
  lines: DraftLine[];
  /** One step per line. */
  method: string;
  notes: string;
  tags: string[];
}

/** A field a refusal can land under. */
export type DraftField = "name" | "servings" | "time" | "lines" | "figures" | "method" | "notes" | "tags";

/** The order the fields come in, so focus goes to the first refused one. */
export const DRAFT_ORDER: readonly DraftField[] = [
  "name",
  "servings",
  "time",
  "lines",
  "figures",
  "method",
  "notes",
  "tags",
];

/** Which field each refusal of a save belongs under. A code not listed goes to the footer. */
export const DRAFT_FIELD_OF: Partial<Record<ErrorCode, DraftField>> = {
  name_required: "name",
  name_too_long: "name",
  recipe_servings_invalid: "servings",
  recipe_time_invalid: "time",
  recipe_lines_required: "lines",
  recipe_lines_too_many: "lines",
  recipe_serving_too_large: "figures",
  step_too_long: "method",
  steps_too_many: "method",
  notes_too_long: "notes",
  tag_invalid: "tags",
  tags_too_many: "tags",
};

/** A recipe's line as the editor holds it. A line made new for a copy takes a new id. */
export function draftLineOf(line: RecipeLine, freshId = false): DraftLine {
  const id = freshId ? newId() : line.id;
  if (line.food === null || line.grams === null) {
    return { kind: "plain", id, name: line.name ?? "", written: line.written, note: line.note };
  }
  return {
    kind: "counted",
    id,
    food: line.food,
    grams: line.grams,
    portion: line.portion?.id ? { ...line.portion, id: line.portion.id } : null,
    written: line.written,
    note: line.note,
  };
}

/** The editor's fields for a new recipe, for a recipe to edit, or for a copy of one. */
export function draftOf(recipe?: Recipe, copy = false): RecipeDraft {
  if (!recipe) return { name: "", servings: "2", time: "", lines: [], method: "", notes: "", tags: [] };
  return {
    name: recipe.name,
    servings: String(recipe.servings),
    time: recipe.timeMinutes === null ? "" : String(recipe.timeMinutes),
    lines: recipe.lines.map((line) => draftLineOf(line, copy)),
    method: recipe.steps.join("\n"),
    notes: recipe.notes ?? "",
    tags: [...recipe.tags],
  };
}

/** A whole number typed in a field, or null for anything else. */
function wholeNumber(raw: string): number | null {
  const parsed = parseDecimalInput(raw, { maxDecimals: 0 });
  return parsed.kind === "number" && Number.isInteger(parsed.value) ? parsed.value : null;
}

/** The servings as typed, or null while they are not a whole number from 1 to 100. */
export function servingsOf(raw: string): number | null {
  const n = wholeNumber(raw);
  return n !== null && n >= 1 && n <= 100 ? n : null;
}

/** One serving's figures and the whole recipe's, from its counted lines, or null while the servings are not valid. */
export function liveFigures(
  lines: readonly DraftLine[],
  servings: number | null,
): { perServing: Figures; whole: Figures; basis: Figures } | null {
  if (servings === null) return null;
  const counted = lines.flatMap((l) => (l.kind === "counted" ? [{ per100g: l.food.per100g, grams: l.grams }] : []));
  const basis = recipeBasis(counted, servings);
  return {
    basis,
    perServing: entryFigures(basis, { per: "serving", count: 1 }),
    whole: entryFigures(basis, { per: "serving", count: servings }),
  };
}

/** A line as the save sends it. */
export function lineBodyOf(line: DraftLine): IngredientLineBody {
  if (line.kind === "plain") {
    return { counted: false, id: line.id, name: line.name, written: line.written, note: line.note };
  }
  return {
    counted: true,
    id: line.id,
    foodId: line.food.id,
    amount: line.portion ? { portionId: line.portion.id, count: line.portion.count } : { grams: line.grams },
    written: line.written,
    note: line.note,
  };
}

/**
 * The whole recipe as the save sends it, every field every time, since a
 * field left out of an edit is cleared. Or the refusals of the fields the
 * schema the server runs refuses.
 */
export function readDraft(
  draft: RecipeDraft,
): { ok: true; body: RecipeEditBody } | { ok: false; errors: Partial<Record<DraftField, ErrorCode>> } {
  const errors: Partial<Record<DraftField, ErrorCode>> = {};
  const servings = servingsOf(draft.servings);
  if (servings === null) errors.servings = "recipe_servings_invalid";
  let time: number | null = null;
  if (draft.time.trim() !== "") {
    time = wholeNumber(draft.time);
    if (time === null || time < 1 || time > 1440) errors.time = "recipe_time_invalid";
  }
  const raw = {
    name: draft.name,
    servings: servings ?? 0,
    timeMinutes: time,
    lines: draft.lines.map(lineBodyOf),
    steps: draft.method
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s !== ""),
    notes: draft.notes,
    tags: draft.tags,
  };
  const parsed = RecipeEditBodySchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = DRAFT_FIELD_OF[issue.message as ErrorCode];
      if (field && errors[field] === undefined) errors[field] = issue.message as ErrorCode;
      else if (issue.path[0] === "name" && errors.name === undefined) errors.name = "name_required";
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) {
    return { ok: false, errors: Object.keys(errors).length > 0 ? errors : { name: "name_required" } };
  }
  return { ok: true, body: parsed.data };
}

/**
 * The lines with the ids a save answered. The answer holds the lines in the
 * order they were sent, and a line sent under an id the recipe did not hold
 * may come back under the id of an identical line it held. The editor's next
 * save sends these ids, so an edited line stays the same line.
 */
export function withAnsweredIds(lines: readonly DraftLine[], answered: readonly RecipeLine[]): DraftLine[] {
  const ordered = [...answered].sort((a, b) => a.position - b.position);
  return lines.map((line, i) => (ordered[i] ? { ...line, id: ordered[i].id } : line));
}
