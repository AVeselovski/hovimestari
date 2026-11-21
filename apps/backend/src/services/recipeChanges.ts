import type {
  Cook,
  CookFieldChange,
  Recipe,
  RecipeFieldChange,
  RecipeLine,
  RecipeLineChange,
  RecipeLineRecord,
} from "@hovimestari/types";
import { isDeepStrictEqual } from "node:util";

// ---------------------------------------------------------------------------
// What the record keeps of a recipe an assistant created or changed: the
// summary the Activity sheet reads. It names what differs and leaves the
// rest out, so a row stays short whatever the recipe's size. Lines are
// matched by id: a line added, a line removed, a line kept with what about
// it changed, and whether the kept ones moved. The method is compared by
// its steps' text: the steps added, removed, reworded in place and moved.
// The notes say only how they changed. Every value is one the recipe as
// read holds. Nothing here computes a figure.
// ---------------------------------------------------------------------------

/** A line as the record names it whole. */
const lineRecord = (l: RecipeLine): RecipeLineRecord => ({ name: lineName(l), grams: l.grams });

/** A line's name: its food's in the user's food-name language, else its own. */
const lineName = (l: RecipeLine): string => l.food?.name ?? l.name ?? "";

const portionOf = (l: RecipeLine) =>
  l.portion && { count: l.portion.count, unit: l.portion.unit, name: l.portion.name };

/** A part of a line before and after, or nothing when the two are the same. */
function part<T>(from: T, to: T): { from: T; to: T } | undefined {
  return isDeepStrictEqual(from, to) ? undefined : { from, to };
}

/** How a piece of text went from `from` to `to`, or nothing when it did not. */
function textChange(from: string | null, to: string | null): "added" | "changed" | "removed" | undefined {
  if (from === to) return undefined;
  return from === null ? "added" : to === null ? "removed" : "changed";
}

/** Everything a line holds, so a change no part of the record shows still counts as one. */
const whole = (l: RecipeLine) => ({ ...l, position: 0, food: l.food?.id ?? null });

/** A kept line's change, or null when it did not change. */
function lineChange(before: RecipeLine, after: RecipeLine): RecipeLineChange | null {
  if (isDeepStrictEqual(whole(before), whole(after))) return null;
  const sameFood = (before.food?.id ?? null) === (after.food?.id ?? null) && before.name === after.name;
  const change: RecipeLineChange = {
    name: lineName(after),
    food: sameFood ? undefined : { from: lineName(before) },
    grams: part(before.grams, after.grams),
    portion: part(portionOf(before), portionOf(after)),
    written: part(before.written, after.written),
    note: textChange(before.note, after.note),
  };
  // Keys left undefined are left out, so the stored row holds only what changed.
  return Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined)) as RecipeLineChange;
}

/**
 * The lines' change from `before` to `after`, or null when the lines are the
 * same. Lines are matched by id: the save gives a line sent again without
 * its id the id of the identical line it was.
 */
function linesChange(before: RecipeLine[], after: RecipeLine[]): RecipeFieldChange | null {
  const beforeById = new Map(before.map((l) => [l.id, l]));
  const afterIds = new Set(after.map((l) => l.id));
  const kept = after.filter((l) => beforeById.has(l.id));
  const change = {
    field: "lines" as const,
    added: after.filter((l) => !beforeById.has(l.id)).map(lineRecord),
    removed: before.filter((l) => !afterIds.has(l.id)).map(lineRecord),
    changed: kept.flatMap((l) => lineChange(beforeById.get(l.id)!, l) ?? []),
    reordered: !isDeepStrictEqual(
      before.filter((l) => afterIds.has(l.id)).map((l) => l.id),
      kept.map((l) => l.id),
    ),
  };
  const same = change.added.length + change.removed.length + change.changed.length === 0 && !change.reordered;
  return same ? null : change;
}

/** The pairs of indexes of a longest run of steps both lists hold in the same order. */
function sharedSteps(a: string[], b: string[]): [number, number][] {
  const len = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  const at = (i: number, j: number) => len[i]![j]!;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      len[i]![j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (at(i + 1, j) >= at(i, j + 1)) i++;
    else j++;
  }
  return pairs;
}

/** The indexes from `from` up to, not including, `to`. */
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => from + k);

/** Takes one `text` out of `texts`, and says whether there was one. */
function takeOne(texts: string[], text: string): boolean {
  const i = texts.indexOf(text);
  if (i >= 0) texts.splice(i, 1);
  return i >= 0;
}

/**
 * The method's change, or null when its steps are the same. The steps both
 * sides hold in order are lined up by their text. Between two of them, the
 * steps that left and the steps that came are the edit. A step that left
 * one place and came to another with the same text moved. When as many
 * came as left, or fewer, the steps that came are reworded in place, and
 * any left over were removed. When more came than left, none is named as
 * reworded, since the record cannot tell which is new: they count as added
 * and the ones that left as removed. A reworded step is numbered as in the
 * method after the edit.
 */
function stepsChange(before: string[], after: string[]): RecipeFieldChange | null {
  if (isDeepStrictEqual(before, after)) return null;
  // Each stretch between two shared steps: the indexes that left and the indexes that came.
  const stretches: { left: number[]; came: number[] }[] = [];
  let [i, j] = [0, 0];
  for (const [si, sj] of [...sharedSteps(before, after), [before.length, after.length] as const]) {
    stretches.push({ left: range(i, si), came: range(j, sj) });
    [i, j] = [si + 1, sj + 1];
  }
  const leftTexts = stretches.flatMap((s) => s.left.map((k) => before[k]!));
  const moved = new Set(stretches.flatMap((s) => s.came.filter((k) => takeOne(leftTexts, after[k]!))));
  const movedTexts = [...moved].map((k) => after[k]!);
  let [added, removed] = [0, 0];
  const changed: number[] = [];
  for (const s of stretches) {
    const left = s.left.filter((k) => !takeOne(movedTexts, before[k]!));
    const came = s.came.filter((k) => !moved.has(k));
    // More came than left: which of them is reworded and which is new cannot be told, so they are counted.
    const reworded = came.length > left.length && left.length > 0 ? 0 : Math.min(left.length, came.length);
    changed.push(...came.slice(0, reworded).map((k) => k + 1));
    added += came.length - reworded;
    removed += left.length - reworded;
  }
  return { field: "steps", from: before.length, to: after.length, added, removed, changed, reordered: moved.size > 0 };
}

/** What a create set: every field it gave a value. */
export function createdChanges(recipe: Recipe): RecipeFieldChange[] {
  const changes: (RecipeFieldChange | null)[] = [
    { field: "servings", from: null, to: recipe.servings },
    recipe.timeMinutes === null ? null : { field: "time", from: null, to: recipe.timeMinutes },
    { field: "lines", added: recipe.lines.map(lineRecord), removed: [], changed: [], reordered: false },
    recipe.steps.length === 0
      ? null
      : {
          field: "steps",
          from: null,
          to: recipe.steps.length,
          added: recipe.steps.length,
          removed: 0,
          changed: [],
          reordered: false,
        },
    recipe.notes === null ? null : { field: "notes", change: "added" },
    recipe.tags.length === 0 ? null : { field: "tags", from: null, to: recipe.tags },
  ];
  return changes.filter((c) => c !== null);
}

/**
 * The fields an edit changed, from `before` to `after`, each only when it
 * differs. An edit the service saw as a change with nothing here differing,
 * such as an own portion renamed since, still differs in its lines: the
 * portion's name is part of a line.
 */
export function editedChanges(before: Recipe, after: Recipe): RecipeFieldChange[] {
  const changes: (RecipeFieldChange | null)[] = [
    before.name === after.name ? null : { field: "name", from: before.name, to: after.name },
    before.servings === after.servings ? null : { field: "servings", from: before.servings, to: after.servings },
    before.timeMinutes === after.timeMinutes
      ? null
      : { field: "time", from: before.timeMinutes, to: after.timeMinutes },
    linesChange(before.lines, after.lines),
    stepsChange(before.steps, after.steps),
    textChange(before.notes, after.notes) === undefined
      ? null
      : { field: "notes", change: textChange(before.notes, after.notes)! },
    isDeepStrictEqual(before.tags, after.tags) ? null : { field: "tags", from: before.tags, to: after.tags },
  ];
  return changes.filter((c) => c !== null);
}

/** What the record keeps of a batch against its recipe. */
export interface CookRecord {
  changes: CookFieldChange[];
  lineNotes: string[];
}

/**
 * What a batch logged as made changed from its recipe as the recipe was
 * then, as the batch's `diff` counts a change, so the record and the day's
 * `differs` say the same thing: its servings when they differ, the lines it
 * added, the recipe lines it left out (under `removed`), and each line
 * `cookDiff` names as changed, with its parts as a recipe line's change. A
 * line's portion counts only beside its grams, and its note never: the same
 * grams typed another way made the same dish. `lineNotes` names apart the
 * lines on which the batch wrote a note of its own, a line it added and a
 * line from the recipe alike, since the assistant sent one, without calling
 * it a change from the recipe.
 */
export function cookChanges(recipe: Recipe, cook: Cook): CookRecord {
  const recipeLines = new Map(recipe.lines.map((l) => [l.id, l]));
  const cookLines = new Map(cook.lines.map((l) => [l.id, l]));
  const { diff } = cook;
  const added = new Set(diff.added);
  const leftOut = new Set(diff.leftOut);
  const changed = diff.changed.map(({ lineId, fromLineId, fields }): RecipeLineChange => {
    const line: RecipeLine = { ...cookLines.get(lineId)!, id: fromLineId };
    const change = lineChange(recipeLines.get(fromLineId)!, line) ?? { name: lineName(line) };
    delete change.note;
    if (!fields.includes("amount")) delete change.portion;
    return change;
  });
  const lines: CookFieldChange = {
    field: "lines",
    added: cook.lines.filter((l) => added.has(l.id)).map(lineRecord),
    removed: recipe.lines.filter((l) => leftOut.has(l.id)).map(lineRecord),
    changed,
    reordered: false,
  };
  const changes: (CookFieldChange | null)[] = [
    diff.servings === null ? null : { field: "servings", from: diff.servings.recipe, to: diff.servings.cook },
    lines.added.length + lines.removed.length + lines.changed.length > 0 ? lines : null,
  ];
  const noted = cook.lines.filter((l) => {
    if (l.note === null) return false;
    if (l.fromLineId === null || added.has(l.id)) return true;
    return l.note !== recipeLines.get(l.fromLineId)?.note;
  });
  return { changes: changes.filter((c) => c !== null), lineNotes: noted.map(lineName) };
}
