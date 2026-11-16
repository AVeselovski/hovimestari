import type { ErrorCode } from "@hovimestari/types";
import type messages from "../../messages/en.json";

// ---------------------------------------------------------------------------
// Which error codes have their own line in the catalog (`errors.<code>`).
// A code listed here never reaches a screen as itself, for the reason given.
// lib/__tests__/errorCopy.test.ts fails when a code has neither copy nor an
// entry here, and when an entry here has copy, so this list cannot go stale.
// ---------------------------------------------------------------------------

export const CODES_WITHOUT_COPY = [
  // The forgot-password page shows its usual answer for a limited request too.
  "reset_rate_limited",
  // Foods: these get their copy with the food screens, which are the first
  // to send these requests. Until then no screen can receive them.
  "food_not_found",
  "food_read_only",
  "food_name_required",
  "food_name_too_long",
  "food_name_not_searchable",
  "food_value_required",
  "food_energy_invalid",
  "food_macro_invalid",
  "barcode_invalid",
  "barcode_taken",
  "portion_not_found",
  "portion_read_only",
  "portion_name_required",
  "portion_name_too_long",
  "portion_grams_invalid",
  // Only the app itself sends a time zone, from the device, on an app start
  // nobody asked to see. A refusal is dropped quietly (lib/deviceTimeZone.ts).
  "invalid_time_zone",
  // Days, entries and saved meals: these get their copy with the Day tab and
  // the log sheet, which are the first screens to send these requests. Until
  // then no screen can receive them.
  "entry_not_found",
  "entry_id_taken",
  "entry_kind_mismatch",
  "entry_eaten_in_future",
  "entry_grams_invalid",
  "entry_count_invalid",
  "figure_required",
  "figure_invalid",
  "name_required",
  "name_too_long",
  "note_too_long",
  "saved_meal_not_found",
  "saved_meal_id_taken",
  "meal_source_too_long",
] as const satisfies readonly ErrorCode[];

type CodeWithoutCopy = (typeof CODES_WITHOUT_COPY)[number];

/** An error code with its own catalog line. */
export type CopiedErrorCode = Exclude<ErrorCode, CodeWithoutCopy>;

/** Every key under `errors` in the catalog: one per copied code, and the fallback. */
export type ErrorCopyKey = keyof (typeof messages)["errors"];

const WITHOUT_COPY: ReadonlySet<string> = new Set(CODES_WITHOUT_COPY);

/**
 * The `errors` catalog key for a code, or the generic line for none. The
 * `satisfies` makes tsc fail when a copied code has no catalog entry.
 */
export function errorCopyKey(code: ErrorCode | undefined): ErrorCopyKey {
  if (code === undefined || WITHOUT_COPY.has(code)) return "fallback";
  return code as CopiedErrorCode satisfies ErrorCopyKey;
}
