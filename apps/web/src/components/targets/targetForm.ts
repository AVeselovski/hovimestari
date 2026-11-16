import { parseDecimalInput } from "@/lib/decimalInput";
import { SetTargetsBodySchema, type ErrorCode, type SetTargetsBody } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// The four target fields as typed, and the one check both targets forms run
// before they send anything: each field parsed as a number with at most one
// decimal, then the whole through the same schema the server runs, so a
// field shows the code its server would answer, field by field.
// ---------------------------------------------------------------------------

export const TARGET_FIELDS = ["energyLower", "energyUpper", "proteinLower", "proteinUpper"] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

/** What is typed in each field, as typed. */
export type TargetFieldValues = Record<TargetField, string>;

/** The first error code of each field that has one. */
export type TargetFieldErrors = Partial<Record<TargetField, ErrorCode>>;

/** Every field empty. Every targets form starts here: the app offers no number. */
export const EMPTY_TARGET_FIELDS: TargetFieldValues = {
  energyLower: "",
  energyUpper: "",
  proteinLower: "",
  proteinUpper: "",
};

/** Where each field sits in `SetTargetsBody`. */
const PATHS: Record<TargetField, readonly [string, string]> = {
  energyLower: ["energyKcal", "lower"],
  energyUpper: ["energyKcal", "upper"],
  proteinLower: ["proteinG", "lower"],
  proteinUpper: ["proteinG", "upper"],
};

export type ParsedTargetFields = { ok: true; body: SetTargetsBody } | { ok: false; errors: TargetFieldErrors };

export function parseTargetFields(values: TargetFieldValues): ParsedTargetFields {
  const errors: TargetFieldErrors = {};
  const numbers: Partial<Record<TargetField, number>> = {};
  for (const field of TARGET_FIELDS) {
    const parsed = parseDecimalInput(values[field], { maxDecimals: 1 });
    if (parsed.kind === "empty") errors[field] = "target_required";
    else if (parsed.kind === "invalid") errors[field] = "target_value_invalid";
    else numbers[field] = parsed.value;
  }

  const result = SetTargetsBodySchema.safeParse({
    ranges: {
      energyKcal: { lower: numbers.energyLower, upper: numbers.energyUpper },
      proteinG: { lower: numbers.proteinLower, upper: numbers.proteinUpper },
    },
  });
  if (result.success && Object.keys(errors).length === 0) return { ok: true, body: result.data };

  for (const issue of result.success ? [] : result.error.issues) {
    const [, nutrient, bound] = issue.path.map(String);
    const field = TARGET_FIELDS.find((f) => PATHS[f][0] === nutrient && PATHS[f][1] === bound);
    // A field that did not parse keeps the code that says why.
    if (field) errors[field] ??= issue.message as ErrorCode;
  }
  return { ok: false, errors };
}

/** The first field with an error, in the order they sit on screen. */
export function firstInvalidField(errors: TargetFieldErrors): TargetField | undefined {
  return TARGET_FIELDS.find((f) => errors[f] !== undefined);
}
