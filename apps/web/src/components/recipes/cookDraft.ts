import { parseCount, type EntryFieldError } from "@/components/entries/amount";
import { addDays, isIsoDate } from "@/lib/localDate";
import { newId } from "@/lib/newId";
import {
  CookBodySchema,
  cookDiff,
  MAX_COOK_ENTRIES,
  type Cook,
  type CookBody,
  type DiffLine,
  type Entry,
  type EntryStatus,
  type ErrorCode,
  type Figures,
  type Recipe,
  type RecipeLine,
} from "@hovimestari/types";
import { draftLineOf, lineBodyOf, liveFigures, servingsOf, type DraftLine } from "./recipeDraft";

// ---------------------------------------------------------------------------
// A batch as the "log as made" sheet holds it while it is typed: the
// recipe's lines as the batch had them, the servings it gave, the day it was
// made and the servings it puts on days. Nothing here computes a figure of
// its own. The figures come from `liveFigures`, which runs the shared
// `recipeBasis` on the lines the batch keeps, and what the batch changed
// comes from the shared `cookDiff`, the function the server answers with.
// ---------------------------------------------------------------------------

/** A line of the batch: a recipe line as the batch had it, or one the batch added. */
export type CookDraftLine = DraftLine & {
  /** The recipe line it started as, or null for a line the batch added. */
  fromLineId: string | null;
  /** Left out of the batch. It keeps its place in the list, and is not sent. */
  leftOut: boolean;
};

/** New servings from the batch on a day, as typed. */
export interface AddRow {
  /** The new entry's id, made with the row and kept across resends. */
  id: string;
  date: string;
  servings: string;
  /** Eaten or planned as chosen, or null while the row keeps its start. */
  chosen: EntryStatus | null;
}

/** The recipe's lines as a new batch starts with them, each under an id of its own. */
export function cookLinesOf(recipe: Recipe): CookDraftLine[] {
  return recipe.lines.map((line) => ({ ...draftLineOf(line, true), fromLineId: line.id, leftOut: false }));
}

/**
 * Whether a batch may be made on `date`, as a refusal or null. The one place
 * the sheet asks. Today any real date passes, a day ahead included: whether
 * a batch may be dated ahead is the owner's open question (`TODO.md`), and a
 * rule against it goes here, where `today` is at hand.
 */
export function cookDateRefusal(date: string, _today: string | null): ErrorCode | null {
  return isIsoDate(date) ? null : "invalid_date";
}

/** Whether `date` is after today, so it holds planned entries only. */
export const isFuture = (date: string, today: string | null): boolean =>
  today !== null && isIsoDate(date) && date > today;

/** The state an entry on `date` takes: planned on a future day, else what was chosen, else eaten. */
export const statusOn = (date: string, today: string | null, chosen: EntryStatus | null): EntryStatus =>
  isFuture(date, today) ? "planned" : (chosen ?? "eaten");

const recipeDiffLine = (line: RecipeLine): DiffLine => ({
  id: line.id,
  foodId: line.food?.id ?? null,
  grams: line.grams,
  written: line.written,
  name: line.food === null ? line.name : null,
});

const cookDiffLine = (line: CookDraftLine): DiffLine & { fromLineId: string | null } => ({
  id: line.id,
  foodId: line.kind === "counted" ? line.food.id : null,
  grams: line.kind === "counted" ? line.grams : null,
  written: line.written,
  name: line.kind === "plain" ? line.name : null,
  fromLineId: line.fromLineId,
});

/** Each line the batch keeps, in the order it is sent: a refusal's `line` is an index into these. */
export const keptLines = (lines: readonly CookDraftLine[]): CookDraftLine[] => lines.filter((l) => !l.leftOut);

/** What a line's row says about it. */
export type LineMark = { kind: "added" } | { kind: "changed" | "leftOutChanged"; from: RecipeLine };

/**
 * The mark under each line, by line id: "Added" for a line the batch added,
 * and for a line that differs from the recipe line it started as, that
 * recipe line. A line left out is compared as if it were put back, so its
 * row keeps the line it had and its height.
 */
export function lineMarks(recipe: Recipe, lines: readonly CookDraftLine[]): Map<string, LineMark> {
  const diff = cookDiff(recipe.lines.map(recipeDiffLine), recipe.servings, lines.map(cookDiffLine), recipe.servings);
  const byId = new Map(recipe.lines.map((l) => [l.id, l]));
  const leftOut = new Set(lines.filter((l) => l.leftOut).map((l) => l.id));
  const marks = new Map<string, LineMark>();
  for (const id of diff.added) marks.set(id, { kind: "added" });
  for (const change of diff.changed) {
    const from = byId.get(change.fromLineId);
    if (from) marks.set(change.lineId, { kind: leftOut.has(change.lineId) ? "leftOutChanged" : "changed", from });
  }
  return marks;
}

/** One serving's figures and the whole batch's, from the lines it keeps, or null while the servings are not valid. */
export function batchFigures(
  lines: readonly CookDraftLine[],
  servings: number | null,
): { perServing: Figures; whole: Figures; basis: Figures } | null {
  return liveFigures(keptLines(lines), servings);
}

/** What a submit refused, by field. */
export interface CookErrors {
  date?: ErrorCode;
  servings?: ErrorCode;
  lines?: ErrorCode;
  /** One serving past what an entry can hold. */
  figures?: ErrorCode;
  /** The servings on days: none chosen, or too many. */
  entries?: ErrorCode;
  /** Each refused added row, by its id. */
  rows?: Record<string, { date?: ErrorCode; servings?: EntryFieldError }>;
  /** A refusal that belongs to no field. */
  form?: ErrorCode;
}

/** What the sheet holds when Log as made is pressed. */
export interface CookDraft {
  /** The batch's id, made when the sheet opens. */
  id: string;
  recipe: Recipe;
  date: string;
  servings: string;
  lines: readonly CookDraftLine[];
  /** The entry the sheet opened from, with the state chosen for it. */
  opening: { entry: Entry; chosen: EntryStatus | null } | null;
  /** The other planned servings ticked, as their entries. */
  ticked: readonly Entry[];
  rows: readonly AddRow[];
  today: string | null;
}

/** Whether the batch can take one more serving, a row or a tick: the server takes 20 entries in one request, attached and added. */
export const canAddRow = (attached: number, rows: number): boolean => attached + rows < MAX_COOK_ENTRIES;

/** The most servings one batch takes, for the line that says so. */
export const MOST_SERVINGS = MAX_COOK_ENTRIES;

/**
 * The day a new row starts on: the first day from the day the batch was
 * made that holds no serving of the recipe on the sheet, so a row never
 * starts on top of one already there. `taken` holds the dates of the
 * opening entry, the planned servings listed, ticked or not, and the rows.
 */
export function nextRowDate(madeOn: string, taken: ReadonlySet<string>): string {
  let date = madeOn;
  // A window of servings is seven days and a batch takes 20 rows: a free day is always near.
  for (let i = 0; i < 60 && taken.has(date); i += 1) date = addDays(date, 1);
  return date;
}

/** Whether a row has servings a batch can put on a day. */
export const rowHasServings = (row: AddRow): boolean => typeof parseCount(row.servings) === "number";

/**
 * The batch as `POST /cooks` takes it, with the dates of every entry it
 * touches, or the refusals of its fields. The opening entry and each ticked
 * serving are attached. The opening entry's state is sent when it differs
 * from the one the entry has. The schema the server runs has the last word.
 */
export function readCook(
  draft: CookDraft,
):
  | { ok: true; body: CookBody; dates: string[]; lines: CookDraftLine[]; opening: OpeningState | null }
  | { ok: false; errors: CookErrors } {
  const errors: CookErrors = {};
  const dateRefusal = cookDateRefusal(draft.date, draft.today);
  if (dateRefusal) errors.date = dateRefusal;
  const servings = servingsOf(draft.servings);
  if (servings === null) errors.servings = "recipe_servings_invalid";
  const kept = keptLines(draft.lines);
  if (kept.length === 0) errors.lines = "recipe_lines_required";

  const rows: NonNullable<CookErrors["rows"]> = {};
  const add: CookBody["add"] = [];
  for (const row of draft.rows) {
    const count = parseCount(row.servings);
    const refused: { date?: ErrorCode; servings?: EntryFieldError } = {};
    if (!isIsoDate(row.date)) refused.date = "invalid_date";
    if (typeof count !== "number") refused.servings = count;
    if (refused.date || refused.servings) rows[row.id] = refused;
    else if (typeof count === "number") {
      add.push({ id: row.id, date: row.date, status: statusOn(row.date, draft.today, row.chosen), servings: count });
    }
  }
  if (Object.keys(rows).length > 0) errors.rows = rows;

  const opening = draft.opening;
  const attach = [...(opening ? [opening.entry.id] : []), ...draft.ticked.map((e) => e.id)];
  const openingStatus = opening ? statusOn(opening.entry.date, draft.today, opening.chosen) : null;
  const attachStatus =
    opening && openingStatus !== null && openingStatus !== opening.entry.status
      ? [{ id: opening.entry.id, status: openingStatus }]
      : [];
  if (attach.length + draft.rows.length === 0) errors.entries = "cook_entries_required";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const parsed = CookBodySchema.safeParse({
    id: draft.id,
    recipeId: draft.recipe.id,
    date: draft.date,
    servings: servings ?? 0,
    lines: kept.map((line) => ({ ...lineBodyOf(line), fromLineId: line.fromLineId })),
    attach,
    add,
    attachStatus,
  });
  if (!parsed.success) {
    const codes = parsed.error.issues.map((issue) => issue.message as ErrorCode);
    if (codes.includes("recipe_lines_too_many")) return { ok: false, errors: { lines: "recipe_lines_too_many" } };
    return {
      ok: false,
      errors: { form: codes.includes("cook_entry_invalid") ? "cook_entry_invalid" : "invalid_request" },
    };
  }
  const dates = [
    ...(opening ? [opening.entry.date] : []),
    ...draft.ticked.map((e) => e.date),
    ...add.map((a) => a.date),
  ];
  return {
    ok: true,
    body: parsed.data,
    dates,
    lines: kept,
    opening: opening && openingStatus !== null ? { id: opening.entry.id, status: openingStatus } : null,
  };
}

/** The entry a sheet opened from, and the state the sheet means for it. */
export interface OpeningState {
  id: string;
  status: EntryStatus;
}

const sameWritten = (a: { amount: number; unit: string } | null, b: { amount: number; unit: string } | null): boolean =>
  a?.amount === b?.amount && a?.unit === b?.unit;

/**
 * Whether the batch the server holds is the one `body` asked for: the day,
 * the servings, each line and each entry the request named. Asked when a
 * request is answered as a replay, which writes nothing: the batch was
 * stored by an earlier press whose answer never came, and the sheet may
 * have changed since. `opening` is the state the sheet means for the entry
 * it opened from. The request marks that entry only when the state differs
 * from the entry as the sheet first saw it, so a state chosen, stored and
 * then put back sends no mark, and only the meant state can tell it from
 * the one stored.
 *
 * The lines are compared by index, which relies on the server answering a
 * batch's lines in their stored position: `cookLinesOf` in
 * `apps/backend/src/services/reads/cooks.ts` orders them by `position`,
 * and the write stores them in the order the request carried them.
 */
export function sameBatch(body: CookBody, held: Cook, opening: OpeningState | null): boolean {
  if (held.date !== body.date || held.servings !== body.servings || held.lines.length !== body.lines.length) {
    return false;
  }
  const linesMatch = body.lines.every((sent, i) => {
    const line = held.lines[i];
    if (line.id !== sent.id || line.fromLineId !== sent.fromLineId) return false;
    if (!sameWritten(line.written, sent.written ?? null) || line.note !== (sent.note ?? null)) return false;
    if (!sent.counted) return line.food === null && line.name === sent.name;
    if (line.food?.id !== sent.foodId) return false;
    return "grams" in sent.amount
      ? line.portion === null && line.grams === sent.amount.grams
      : line.portion?.id === sent.amount.portionId && line.portion.count === sent.amount.count;
  });
  if (!linesMatch) return false;
  const entries = new Map(held.entries.map((e) => [e.id, e]));
  if (entries.size !== body.attach.length + body.add.length) return false;
  return (
    body.attach.every((id) => entries.has(id)) &&
    body.attachStatus.every((mark) => entries.get(mark.id)?.status === mark.status) &&
    (opening === null || entries.get(opening.id)?.status === opening.status) &&
    body.add.every((add) => {
      const entry = entries.get(add.id);
      return entry?.date === add.date && entry.status === add.status && entry.servings === add.servings;
    })
  );
}

/** A new row of servings on `date`, with 1 serving to start. */
export const newRow = (date: string, servings = "1", chosen: EntryStatus | null = null): AddRow => ({
  id: newId(),
  date,
  servings,
  chosen,
});
