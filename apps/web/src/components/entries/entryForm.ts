import { parseDecimalInput } from "@/lib/decimalInput";
import { formatDecimalForField } from "@/lib/foodFormat";
import {
  NameSchema,
  NoteSchema,
  TypedFiguresSchema,
  entryFigures,
  type Entry,
  type EntryPatchBody,
  type EntryStatus,
  type ErrorCode,
  type Figures,
} from "@hovimestari/types";
import { GRAMS, gramsOf, numberOrError, parseAmount, parseCount, type EntryFieldError, type UnitChip } from "./amount";

// ---------------------------------------------------------------------------
// The entry sheet's fields, as typed, and what it sends. Every number goes
// through `parseDecimalInput`, then the shared schema the server runs, so a
// field shows the code its server would answer. The amount itself is in
// amount.ts, shared with the log block. Save sends only the fields
// that changed. Undo sends the exact inverse, computed from the entry before
// the save and the entry the save answered, never from what was sent: the
// server can change a field it was not sent (a move of an eaten entry to a
// future date plans it).
//
// Two limits of the inverse, stated in quick-logging.md's undo section:
// - An old amount entered as a portion goes back as `{ portionId, count }`,
//   which the server weighs at the portion's grams at the time of the Undo.
//   When the portion is gone (its id is null) it goes back as `{ grams }`.
// - A status round trip records a new time of eating.
// ---------------------------------------------------------------------------

export interface EntryFields {
  date: string;
  /** The state chosen. On a future date the state saved is planned whatever this holds. */
  status: EntryStatus;
  /** A food entry's unit chip: `GRAMS` or a portion id. */
  unit: string;
  /** A food entry's amount, or a saved meal entry's count, as typed. */
  amount: string;
  name: string;
  energy: string;
  protein: string;
  carbs: string;
  fat: string;
  note: string;
}

export type EntryField = "date" | "amount" | "name" | "energy" | "protein" | "carbs" | "fat" | "note";
/** The four typed figures of an estimate or a saved meal, in their order on screen. */
export type FigureField = "energy" | "protein" | "carbs" | "fat";
export type EntryFieldErrors = Partial<Record<EntryField, EntryFieldError>>;

/**
 * The kinds whose amount is a count, one row each: the entry's field that
 * holds the count, which is also the field a PATCH sends, and what the basis
 * is per, which scales the preview. A new counted kind is one more row.
 */
const COUNTED = {
  saved_meal: { field: "count", per: "meal" },
  recipe: { field: "servings", per: "serving" },
} as const satisfies Partial<Record<Entry["kind"], { field: "count" | "servings"; per: "meal" | "serving" }>>;

type Counted = (typeof COUNTED)[keyof typeof COUNTED];

/** The entry's count row, or null for a kind whose amount is not a count. */
function countedOf(entry: Entry): Counted | null {
  return entry.kind in COUNTED ? COUNTED[entry.kind as keyof typeof COUNTED] : null;
}

/** The fields as the entry holds them: every field prefilled from the entry itself. */
export function fieldsOf(entry: Entry): EntryFields {
  const portion = entry.portion?.id ? entry.portion : null;
  const counted = countedOf(entry);
  const amount =
    entry.kind === "food"
      ? formatDecimalForField(portion ? portion.count : (entry.grams ?? 0), "en")
      : counted
        ? formatDecimalForField(entry[counted.field] ?? 0, "en")
        : "";
  const typed = entry.kind === "estimate";
  return {
    date: entry.date,
    status: entry.status,
    unit: portion?.id ?? GRAMS,
    amount,
    name: typed ? entry.name : "",
    energy: typed ? formatDecimalForField(entry.figures.energyKcal, "en") : "",
    protein: typed ? formatDecimalForField(entry.figures.proteinG, "en") : "",
    carbs: typed ? formatDecimalForField(entry.figures.carbsG, "en") : "",
    fat: typed ? formatDecimalForField(entry.figures.fatG, "en") : "",
    note: typed ? (entry.note ?? "") : "",
  };
}

/** The state that will be saved: planned on a date after today, whatever is chosen. */
export function effectiveStatus(fields: EntryFields, today: string | null): EntryStatus {
  return today !== null && fields.date > today ? "planned" : fields.status;
}

const FIGURE_FIELDS = [
  ["energy", "energyKcal"],
  ["protein", "proteinG"],
  ["carbs", "carbsG"],
  ["fat", "fatG"],
] as const;

/** An estimate's four figures as typed, or the first error of each field. */
export function parseFigures(fields: Pick<EntryFields, FigureField>): {
  figures: Figures | null;
  errors: EntryFieldErrors;
} {
  const errors: EntryFieldErrors = {};
  const values: Partial<Record<keyof Figures, number>> = {};
  for (const [field, key] of FIGURE_FIELDS) {
    const n = numberOrError(parseDecimalInput(fields[field], { maxDecimals: 1 }), "figure_invalid", "figure_required");
    if (typeof n === "number") values[key] = n;
    else errors[field] = n;
  }
  const result = TypedFiguresSchema.safeParse(values);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = FIGURE_FIELDS.find(([, key]) => key === issue.path[0])?.[0];
      if (field) errors[field] ??= issue.message as ErrorCode;
    }
  }
  return { figures: result.success && Object.keys(errors).length === 0 ? result.data : null, errors };
}

const sameFigures = (a: Figures, b: Figures) =>
  a.energyKcal === b.energyKcal && a.proteinG === b.proteinG && a.carbsG === b.carbsG && a.fatG === b.fatG;

/** The amount on the entry, as the field would send it back. */
function amountOfEntry(entry: Entry): { grams: number } | { portionId: string; count: number } {
  return entry.portion?.id ? { portionId: entry.portion.id, count: entry.portion.count } : { grams: entry.grams ?? 0 };
}

export type BuiltPatch = { ok: true; patch: EntryPatchBody } | { ok: false; errors: EntryFieldErrors };

/**
 * The PATCH of every field that differs from the entry, checked first. An
 * empty patch means nothing changed. A planned entry's amount and the state
 * Eaten go in one PATCH.
 */
export function buildPatch(entry: Entry, fields: EntryFields, today: string | null): BuiltPatch {
  const errors: EntryFieldErrors = {};
  const patch: EntryPatchBody = {};
  if (fields.date !== entry.date) patch.date = fields.date;
  const status = effectiveStatus(fields, today);
  if (status !== entry.status) patch.status = status;

  const counted = countedOf(entry);
  if (entry.kind === "food") {
    const n = parseAmount(fields.amount, fields.unit);
    if (typeof n !== "number") errors.amount = n;
    else {
      const was = amountOfEntry(entry);
      const now = fields.unit === GRAMS ? { grams: n } : { portionId: fields.unit, count: n };
      if (JSON.stringify(was) !== JSON.stringify(now)) patch.amount = now;
    }
  } else if (counted) {
    const n = parseCount(fields.amount);
    if (typeof n !== "number") errors.amount = n;
    else if (n !== entry[counted.field]) patch[counted.field] = n;
  } else {
    const name = NameSchema.safeParse(fields.name);
    if (!name.success) errors.name = name.error.issues[0].message as ErrorCode;
    else if (name.data !== entry.name) patch.name = name.data;
    const typed = parseFigures(fields);
    Object.assign(errors, typed.errors);
    if (typed.figures && !sameFigures(typed.figures, entry.figures)) patch.figures = typed.figures;
    const note = NoteSchema.safeParse(fields.note);
    if (!note.success) errors.note = note.error.issues[0].message as ErrorCode;
    else if (note.data !== entry.note) patch.note = note.data;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, patch };
}

/**
 * The PATCH that puts back every field that differs between the entry before
 * a save and the entry the save answered. Empty when nothing differs.
 */
export function inverseOf(before: Entry, after: Entry): EntryPatchBody {
  const inverse: EntryPatchBody = {};
  if (after.date !== before.date) inverse.date = before.date;
  if (after.status !== before.status) inverse.status = before.status;
  if (before.kind === "food") {
    const portionChanged =
      (after.portion?.id ?? null) !== (before.portion?.id ?? null) || after.portion?.count !== before.portion?.count;
    if (after.grams !== before.grams || portionChanged) inverse.amount = amountOfEntry(before);
  }
  for (const { field } of Object.values(COUNTED)) {
    const was = before[field];
    if (after[field] !== was && was !== null) inverse[field] = was;
  }
  if (before.kind === "estimate") {
    if (after.name !== before.name) inverse.name = before.name;
    if (!sameFigures(after.figures, before.figures)) {
      inverse.figures = before.figures;
    }
    if (after.note !== before.note) inverse.note = before.note;
  }
  return inverse;
}

/** The entry's figures for what the sheet holds: the server's own while the amount is as saved, else computed from the basis. */
export function previewOf(entry: Entry, fields: EntryFields, chips: readonly UnitChip[]): Figures | null {
  const initial = fieldsOf(entry);
  if (entry.kind === "food") {
    if (fields.amount === initial.amount && fields.unit === initial.unit) return entry.figures;
    const chip = chips.find((c) => c.id === fields.unit);
    const grams = chip ? gramsOf(fields.amount, chip) : null;
    return grams === null ? null : entryFigures(entry.basis, { per: "100g", grams });
  }
  const counted = countedOf(entry);
  if (counted) {
    if (fields.amount === initial.amount) return entry.figures;
    const count = parseCount(fields.amount);
    return typeof count === "number" ? entryFigures(entry.basis, { per: counted.per, count }) : null;
  }
  const { figures } = parseFigures(fields);
  return figures === null ? null : entryFigures(figures, { per: "whole" });
}

/** The first field with an error, in the order they sit on screen. */
export function firstInvalidField(errors: EntryFieldErrors): EntryField | undefined {
  const order: EntryField[] = ["amount", "name", "energy", "protein", "carbs", "fat", "note", "date"];
  return order.find((f) => errors[f] !== undefined);
}
