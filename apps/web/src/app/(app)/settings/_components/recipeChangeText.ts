import { portionName } from "@/components/entries/portionLabel";
import { formatCount } from "@/lib/entryFormat";
import { formatGrams } from "@/lib/foodFormat";
import type { RecipeFieldChange, RecipeLineChange, RecipeLineRecord } from "@hovimestari/types";
import type { useTranslations } from "next-intl";
import type { ChangeLine, ChangeWords } from "./changeText";

// ---------------------------------------------------------------------------
// A recipe change as the Activity sheet reads it, under its headline. A
// create reads what it set. An edit reads only what differs: the lines
// added and removed, each changed line under its own name with what about
// it changed, the steps added, removed, reworded or moved, and that the
// notes changed. Short values read before and after on one line. No line
// reads the same value on both sides: when nothing a line would show
// differs, it says the thing changed in plain words.
// ---------------------------------------------------------------------------

/** The most ingredient lines one row spells out before it says how many more. */
export const SHOWN_LINES = 8;

type T = ReturnType<typeof useTranslations<"settings.connectedAi.activitySheet">>;
type Lines = Extract<RecipeFieldChange, { field: "lines" }>;
type Steps = Extract<RecipeFieldChange, { field: "steps" }>;

const line = (parts: string[], label: string | null = null, names = false): ChangeLine =>
  names ? { label, parts, names: true } : { label, parts };

/** A line named whole: its name, and its grams when it counts. */
const linePart = (l: RecipeLineRecord, t: T): string =>
  l.grams === null ? l.name : t("part.lineGrams", { name: l.name, value: formatGrams(l.grams) });

/** A value before and after, on one line. */
const fromTo = (from: string, to: string, t: T): string => t("part.fromTo", { from, to });

/** What about one kept line changed, each part once, or "changed" when none of them shows. */
function lineChangeParts(change: RecipeLineChange, words: ChangeWords): string[] {
  const { t, units } = words;
  const parts: string[] = [];
  if (change.food) {
    parts.push(
      change.food.from === change.name ? t("part.anotherFood") : t("part.inPlaceOf", { name: change.food.from }),
    );
  }
  const portion = (p: NonNullable<RecipeLineChange["portion"]>["from"]): string => {
    const name = p && portionName(p, units);
    return p && name !== null ? t("part.portion", { count: formatCount(p.count), portion: name }) : t("part.none");
  };
  if (change.portion) {
    const [from, to] = [portion(change.portion.from), portion(change.portion.to)];
    if (from !== to) parts.push(fromTo(from, to, t));
  }
  if (change.grams) {
    const grams = (g: number | null) => (g === null ? t("part.none") : t("part.grams", { value: formatGrams(g) }));
    parts.push(fromTo(grams(change.grams.from), grams(change.grams.to), t));
  }
  if (change.written) {
    const written = (w: NonNullable<RecipeLineChange["written"]>["from"]) =>
      w === null ? t("part.none") : t(`writtenUnit.${w.unit}`, { count: w.amount, amount: formatCount(w.amount) });
    const [from, to] = [written(change.written.from), written(change.written.to)];
    if (from !== to) parts.push(t("part.asWritten", { from, to }));
  }
  if (change.note) parts.push(t(`part.note.${change.note}`));
  return parts.length > 0 ? parts : [t("part.changed")];
}

/**
 * The lines' change. A create reads its lines as one list. An edit reads
 * the lines added, then the lines removed, a list each, then each changed
 * line on its own, then whether the order changed. At most `SHOWN_LINES`
 * lines are spelled out, and the rest are counted, never as "1 more".
 */
function linesLines(change: Lines, words: ChangeWords, created: boolean): ChangeLine[] {
  const { t } = words;
  const total = change.added.length + change.removed.length + change.changed.length;
  let room = total > SHOWN_LINES + 1 ? SHOWN_LINES : total;
  const take = <L>(list: L[]): L[] => {
    const shown = list.slice(0, room);
    room -= shown.length;
    return shown;
  };
  const added = take(change.added);
  const removed = take(change.removed);
  const changed = take(change.changed);
  const out: ChangeLine[] = [];
  if (created) {
    if (added.length > 0)
      out.push(
        line(
          added.map((l) => linePart(l, t)),
          t("field.lines"),
          true,
        ),
      );
  } else {
    if (added.length > 0) {
      out.push(
        line(
          added.map((l) => linePart(l, t)),
          t("label.linesAdded", { count: change.added.length }),
          true,
        ),
      );
    }
    if (removed.length > 0) {
      const label = t("label.linesRemoved", { count: change.removed.length });
      out.push(
        line(
          removed.map((l) => linePart(l, t)),
          label,
          true,
        ),
      );
    }
    for (const c of changed) out.push(line(lineChangeParts(c, words), c.name));
  }
  const shown = added.length + removed.length + changed.length;
  // An edit's rest mixes lines added, removed and changed, so it counts them as changes.
  const more = created ? "part.moreLines" : "part.moreLineChanges";
  if (shown < total) out.push(line([t(more, { count: total - shown })]));
  if (!created && change.reordered) out.push(line([t("part.orderChanged")], t("field.lines")));
  return out.length > 0 ? out : [line([t("part.changed")], t("field.lines"))];
}

/**
 * The method: its count of steps before and after when it changed, the
 * steps added and removed when it gained some and lost others, the steps
 * reworded, and whether the steps moved.
 */
function stepsParts(change: Steps, t: T, created: boolean): string[] {
  const steps = (n: number) => (n === 0 ? t("part.none") : t("part.steps", { count: n }));
  if (created || change.from === null) return [steps(change.to)];
  const parts = change.from === change.to ? [] : [fromTo(steps(change.from), steps(change.to), t)];
  // Only one of the two alone is the difference of the counts, said already.
  if (change.added > 0 && change.removed > 0) {
    parts.push(t("part.stepsAdded", { count: change.added }), t("part.stepsRemoved", { count: change.removed }));
  }
  const [first] = change.changed;
  if (change.changed.length === 1 && first !== undefined) {
    parts.push(t("part.stepChanged", { number: formatCount(first) }));
  }
  if (change.changed.length > 1) parts.push(t("part.stepsChanged", { count: change.changed.length }));
  if (change.reordered) parts.push(t("part.orderChanged"));
  return parts.length > 0 ? parts : [t("part.changed")];
}

/** One field of a recipe change, as its lines. */
function fieldLines(change: RecipeFieldChange, words: ChangeWords, created: boolean): ChangeLine[] {
  const { t } = words;
  const label = t(`field.${change.field}`);
  switch (change.field) {
    case "name":
      return [line([fromTo(change.from, change.to, t)], label)];
    case "servings": {
      const to = formatCount(change.to);
      return [line([change.from === null ? to : fromTo(formatCount(change.from), to, t)], label)];
    }
    case "time": {
      const minutes = (m: number | null) =>
        m === null ? t("part.none") : t("part.minutes", { value: formatCount(m) });
      if (created) return [line([minutes(change.to)], label)];
      if (change.from !== null && change.to !== null) {
        return [line([t("part.minutesRange", { from: formatCount(change.from), to: formatCount(change.to) })], label)];
      }
      return [line([fromTo(minutes(change.from), minutes(change.to), t)], label)];
    }
    case "lines":
      return linesLines(change, words, created);
    case "steps":
      return [line(stepsParts(change, t, created), label)];
    case "notes":
      return [line([t(`part.${change.change}`)], label)];
    case "tags": {
      const tags = (list: string[]) => (list.length === 0 ? [t("part.none")] : list);
      if (change.from === null) return [line(tags(change.to), label, true)];
      return [
        line(tags(change.from), t("label.before", { field: label }), true),
        line(tags(change.to), t("label.after", { field: label }), true),
      ];
    }
  }
}

/** A recipe change's lines, for a create or an edit. */
export const recipeChangeLines = (changes: RecipeFieldChange[], words: ChangeWords, created: boolean): ChangeLine[] =>
  changes.flatMap((c) => fieldLines(c, words, created));
