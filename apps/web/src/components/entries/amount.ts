import { parseDecimalInput, type ParsedDecimal } from "@/lib/decimalInput";
import { formatDecimalForField } from "@/lib/foodFormat";
import { EntryCountSchema, EntryGramsSchema, gramsForPortion, type ErrorCode } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// An amount as typed: grams, a count of one of a food's portions, or a count
// of meals. Every number goes through `parseDecimalInput`, then the shared
// schema the server runs, so a field shows the code its server would answer.
// Shared by the entry sheet and the log block, with no PATCH logic.
// ---------------------------------------------------------------------------

/** The amount field's unit chip: grams, or one of the food's portions by id. */
export const GRAMS = "g";

/** One unit chip. `grams` is the portion's weight, absent on the grams chip. */
export interface UnitChip {
  id: string;
  label: string | null;
  grams?: number;
}

/** An error code, or `digit_group` for a number that may hold a thousands group. */
export type EntryFieldError = ErrorCode | "digit_group";

/** A parsed number, or the code for its field: `empty` for nothing typed, `invalid` for anything unreadable. */
export function numberOrError(parsed: ParsedDecimal, invalid: ErrorCode, empty: ErrorCode): number | EntryFieldError {
  switch (parsed.kind) {
    case "empty":
      return empty;
    case "group":
      return "digit_group";
    case "invalid":
      return invalid;
    case "number":
      return parsed.value;
  }
}

/** A portion count, or grams, as typed, checked against the schema the server runs. */
export function parseAmount(raw: string, unit: string): number | EntryFieldError {
  if (unit === GRAMS) {
    const n = numberOrError(parseDecimalInput(raw, { maxDecimals: 1 }), "entry_grams_invalid", "entry_grams_invalid");
    if (typeof n !== "number") return n;
    return EntryGramsSchema.safeParse(n).success ? n : "entry_grams_invalid";
  }
  return parseCount(raw);
}

/**
 * A count as typed: of a food's portions, of meals or of servings. A count is
 * at most 100 with two decimals, so a number that may hold a thousands group
 * ("1,255") is out of range whichever way it reads. It takes the range's
 * code, never `digit_group`, whose line would tell a comma keypad not to use
 * its comma although "1,5" is a count.
 */
export function parseCount(raw: string): number | EntryFieldError {
  const parsed = parseDecimalInput(raw, { maxDecimals: 2 });
  if (parsed.kind === "group") return "entry_count_invalid";
  const n = numberOrError(parsed, "entry_count_invalid", "entry_count_invalid");
  if (typeof n !== "number") return n;
  return EntryCountSchema.safeParse(n).success ? n : "entry_count_invalid";
}

/**
 * The grams the server will compute for what is typed: the grams themselves,
 * or the count times the portion's current grams. Null for an amount that
 * does not parse.
 */
export function gramsOf(raw: string, chip: UnitChip): number | null {
  const n = parseAmount(raw, chip.id);
  if (typeof n !== "number") return null;
  if (chip.id === GRAMS) return n;
  if (chip.grams === undefined) return null;
  const grams = gramsForPortion(n, chip.grams);
  return EntryGramsSchema.safeParse(grams).success ? grams : null;
}

/**
 * What the amount field holds after a chip switch. To grams from a portion,
 * a valid count becomes its weight. To a portion, the count becomes 1. An
 * empty or refused value stays as typed.
 */
export function switchUnit(raw: string, from: UnitChip, to: UnitChip): string {
  if (from.id === to.id) return raw;
  if (to.id === GRAMS) {
    const grams = gramsOf(raw, from);
    return grams === null ? raw : formatDecimalForField(grams, "en");
  }
  const parsed = parseAmount(raw, from.id);
  return typeof parsed === "number" ? "1" : raw;
}
