import type { EntryFieldError } from "@/components/entries/amount";
import { parseFigures, type FigureField } from "@/components/entries/entryForm";
import {
  NameSchema,
  NoteSchema,
  SavedMealEditBodySchema,
  type ErrorCode,
  type Figures,
  type SavedMeal,
  type SavedMealEditBody,
} from "@hovimestari/types";

// ---------------------------------------------------------------------------
// The saved meal sheet's and the estimate sheet's fields, read with the
// shared schemas the server reads them with, so the sheet refuses on the
// device what the server would refuse, with the same codes. The figures read
// at one decimal through `parseFigures`, which also says when a value may be
// a thousands group.
// ---------------------------------------------------------------------------

export type MealField = "name" | "source" | FigureField;
export type MealFields = Record<MealField, string>;
export type MealFieldErrors = Partial<Record<MealField, EntryFieldError>>;

export type EstimateFormField = "name" | FigureField | "note";
export type EstimateFormFields = Record<EstimateFormField, string>;
export type EstimateFormErrors = Partial<Record<EstimateFormField, EntryFieldError>>;

/** Where a refused form puts focus: the first refused field, in the order they sit on screen. */
export function firstRefused<F extends string>(
  order: readonly F[],
  errors: Partial<Record<F, unknown>>,
): F | undefined {
  return order.find((f) => errors[f] !== undefined);
}

/** Which of `fields` a refusal from the server belongs to, if any. Every other refusal is the form's own. */
export function fieldOfCode<F extends string>(code: ErrorCode | undefined, fields: readonly F[]): F | null {
  const field =
    code === "name_required" || code === "name_too_long"
      ? "name"
      : code === "meal_source_too_long"
        ? "source"
        : code === "note_too_long"
          ? "note"
          : null;
  return fields.find((f) => f === field) ?? null;
}

export const MEAL_ORDER: readonly MealField[] = ["name", "source", "energy", "protein", "carbs", "fat"];
export const ESTIMATE_ORDER: readonly EstimateFormField[] = ["name", "energy", "protein", "carbs", "fat", "note"];

const codeOf = (issues: readonly { message: string }[]): ErrorCode => issues[0].message as ErrorCode;

/** A meal's fields as they open: empty for a new meal (a name the search typed aside), else the meal's own. */
export function mealFieldsOf(meal: SavedMeal | undefined, name: string): MealFields {
  if (!meal) return { name, source: "", energy: "", protein: "", carbs: "", fat: "" };
  const f = (n: number) => String(n);
  return {
    name: meal.name,
    source: meal.source ?? "",
    energy: f(meal.figures.energyKcal),
    protein: f(meal.figures.proteinG),
    carbs: f(meal.figures.carbsG),
    fat: f(meal.figures.fatG),
  };
}

/** The meal the fields describe, or each field's refusal. */
export function readMeal(
  fields: MealFields,
): { ok: true; body: SavedMealEditBody } | { ok: false; errors: MealFieldErrors } {
  const errors: MealFieldErrors = {};
  const name = NameSchema.safeParse(fields.name);
  if (!name.success) errors.name = codeOf(name.error.issues);
  const source = SavedMealEditBodySchema.shape.source.safeParse(fields.source);
  if (!source.success) errors.source = codeOf(source.error.issues);
  const typed = parseFigures(fields);
  Object.assign(errors, typed.errors);
  if (!name.success || !source.success || typed.figures === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, body: { name: name.data, source: source.data ?? null, figures: typed.figures } };
}

/** The estimate the fields describe, or each field's refusal. */
export function readEstimate(
  fields: EstimateFormFields,
): { ok: true; name: string; figures: Figures; note: string | null } | { ok: false; errors: EstimateFormErrors } {
  const errors: EstimateFormErrors = {};
  const name = NameSchema.safeParse(fields.name);
  if (!name.success) errors.name = codeOf(name.error.issues);
  const note = NoteSchema.safeParse(fields.note);
  if (!note.success) errors.note = codeOf(note.error.issues);
  const typed = parseFigures(fields);
  Object.assign(errors, typed.errors);
  if (!name.success || !note.success || typed.figures === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, name: name.data, figures: typed.figures, note: note.data };
}
