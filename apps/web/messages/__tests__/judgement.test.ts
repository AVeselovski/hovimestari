import messages from "../en.json";

// ---------------------------------------------------------------------------
// No judgement words on the screens that show a day. A day's copy states
// figures, positions and distances: never good, bad, over, failed or on
// track, never room left to spend, and no exclamation. This walks the copy of
// those screens and the error lines they can show.
// ---------------------------------------------------------------------------

type Tree = { readonly [key: string]: string | Tree };

/** Every string under `tree`, with its key path. */
export function leaves(tree: Tree, prefix: string): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}.${key}`, value] as [string, string]] : leaves(value, `${prefix}.${key}`),
  );
}

const NAMESPACES = ["day", "entries", "log", "meals", "toast", "figures"] as const;

/** The error codes the day's screens can render. */
const CODES = [
  "entry_not_found",
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
  "food_not_found",
  "portion_not_found",
  "user_not_found",
  "invalid_request",
  "fallback",
] as const;

const WORDS = [
  "good",
  "bad",
  "over",
  "under",
  "great",
  "well done",
  "failed",
  "on track",
  "too much",
  "too little",
  "left",
  "remaining",
  "warning",
  "goal",
];

/** The judgement words `text` holds as whole words, case-folded, and any "!". */
export function judgementIn(text: string): string[] {
  const folded = text.toLowerCase();
  const found = WORDS.filter((w) => new RegExp(`(?<![\\p{L}\\p{N}])${w}(?![\\p{L}\\p{N}])`, "u").test(folded));
  return folded.includes("!") ? [...found, "!"] : found;
}

const catalog = messages as unknown as Tree;
const errors = catalog.errors as Tree;

const strings: [string, string][] = [
  ...NAMESPACES.flatMap((ns) => (catalog[ns] === undefined ? [] : leaves(catalog[ns] as Tree, ns))),
  ...CODES.flatMap((code): [string, string][] =>
    typeof errors[code] === "string" ? [[`errors.${code}`, errors[code] as string]] : [],
  ),
];

describe("the day's copy", () => {
  it("covers the day, entry, toast and figure strings and the error lines they show", () => {
    expect(strings.some(([key]) => key.startsWith("day.summary."))).toBe(true);
    expect(strings.some(([key]) => key.startsWith("toast."))).toBe(true);
    expect(strings.some(([key]) => key === "errors.entry_not_found")).toBe(true);
  });

  it("holds no judgement word and no exclamation", () => {
    expect(strings.filter(([, text]) => judgementIn(text).length > 0)).toEqual([]);
  });

  it("finds each word whole, in any case, and not inside another word", () => {
    expect(judgementIn("You are On Track.")).toEqual(["on track"]);
    expect(judgementIn("120 kcal over the range")).toEqual(["over"]);
    expect(judgementIn("Undo")).toEqual([]);
    expect(judgementIn("Moved to tomorrow, a leftover")).toEqual([]);
    expect(judgementIn("Saved!")).toEqual(["!"]);
  });
});
