import type { UnitChip } from "@/components/entries/amount";
import { GRAMS } from "@/components/entries/amount";
import type { FineliPortionUnit, LastAmount, Portion } from "@hovimestari/types";

/**
 * A food's unit chips: "g", then the last amount's own portion when it had
 * one (its weight from the food's portions when they are read, else from the
 * last amount), then the food's other portions. A portion that went away
 * since the chips were drawn (`gone`) is left out.
 */
export function foodChipsOf({
  last,
  portions,
  gone,
  label,
}: {
  last: LastAmount | null;
  portions: readonly Portion[] | undefined;
  gone: ReadonlySet<string>;
  label: (portion: { unit: FineliPortionUnit | null; name: string | null }) => string;
}): UnitChip[] {
  const list: UnitChip[] = [{ id: GRAMS, label: null }];
  const own = last?.portion?.id ? last.portion : null;
  if (own?.id && !gone.has(own.id)) {
    const current = portions?.find((p) => p.id === own.id);
    list.push({ id: own.id, label: label(own), grams: current?.grams ?? (last?.grams ?? 0) / own.count });
  }
  for (const portion of portions ?? []) {
    if (portion.id !== own?.id && !gone.has(portion.id)) {
      list.push({ id: portion.id, label: label(portion), grams: portion.grams });
    }
  }
  return list;
}
