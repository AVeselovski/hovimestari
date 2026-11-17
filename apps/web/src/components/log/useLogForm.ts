"use client";

import {
  GRAMS,
  gramsOf,
  parseAmount,
  parseCount,
  switchUnit,
  type EntryFieldError,
  type UnitChip,
} from "@/components/entries/amount";
import { usePortionChipLabel } from "@/components/entries/portionLabel";
import { focusField } from "@/components/form/focus";
import type { AddDone, AddRequest, EntryActions } from "@/hooks/useEntryActions";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { formatCount } from "@/lib/entryFormat";
import { getErrorCode } from "@/lib/errors";
import { formatDecimalForField, formatGrams } from "@/lib/foodFormat";
import { newId } from "@/lib/newId";
import {
  entryFigures,
  type EntryStatus,
  type Figures,
  type FoodDetail,
  type FoodSummary,
  type LastAmount,
  type SavedMeal,
} from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// useLogForm: the log block's state, for the food view and the meal view.
// The block sits in the sheet's body and Log in its footer, so the state
// lives here, with the sheet, and both read it.
//
// - Prefilled from the last amount: a food's last grams or portion count (a
//   portion that is gone gives its grams), a meal's last count, else 1 meal.
//   A food opened from a list that does not carry its last amount (a search
//   result, your foods) takes it from the food's detail when that answers,
//   while nothing has been typed or chosen. A food never logged opens empty.
// - The chips are "g", the last amount's own portion at once, then the
//   food's other portions when its detail answers, after the chips shown.
// - The figures are `entryFigures` on the food's per-100 g values or the
//   meal's figures, the values the server takes for a new entry, so the
//   figures shown are the ones Log stores.
// - Eaten or planned: Eaten on today and past days, Planned and fixed on a
//   future day, read from the sheet's date against today at each render.
// - The entry's id is minted when the view opens and kept across every Log
//   until one is answered, so a Log after a timeout cannot add twice. An id
//   another account holds (`entry_id_taken`) is replaced for the next Log.
// - The submit runs through `useSubmitGuard`, so a double tap logs once.
// ---------------------------------------------------------------------------

/** What a log block logs. */
export type LogTarget =
  | {
      kind: "food";
      food: FoodSummary;
      /** The last amount the opening row carried, null for never logged, undefined when the row did not say. */
      last: LastAmount | null | undefined;
      detail: FoodDetail | undefined;
    }
  | { kind: "meal"; meal: SavedMeal; lastCount: number | null };

interface Fields {
  unit: string;
  amount: string;
}

export interface LogForm {
  formId: string;
  fieldId: string;
  kind: LogTarget["kind"];
  chips: UnitChip[];
  unit: string;
  amount: string;
  error: EntryFieldError | undefined;
  /** The state shown: Planned on a future day whatever was chosen. */
  status: EntryStatus;
  future: boolean;
  /** The figures for what is typed, or null for nothing that parses. */
  preview: Figures | null;
  /** Nothing is typed: Log waits. */
  empty: boolean;
  /** The amount differs from its prefill, or the state was changed. */
  dirty: boolean;
  submitting: boolean;
  /** The refusal no field owns, for the footer. */
  formError: string | null;
  setUnit: (chip: UnitChip) => void;
  setAmount: (raw: string) => void;
  setStatus: (status: EntryStatus) => void;
  submit: () => void;
}

export interface UseLogFormOptions {
  /** Changes when another food or meal opens: the form starts again. */
  key: string;
  target: LogTarget | null;
  date: string;
  today: string | null;
  actions: Pick<EntryActions, "add" | "holding">;
  /** The add was answered: close the sheet, then `done.announce()`. */
  onLogged: (done: AddDone) => void;
  onGone: (kind: LogTarget["kind"], id: string) => void;
}

/** The field values a last amount fills in. */
function fieldsOfLast(last: LastAmount | null): Fields {
  if (last === null) return { unit: GRAMS, amount: "" };
  if (last.portion?.id) return { unit: last.portion.id, amount: formatCount(last.portion.count, "en") };
  return { unit: GRAMS, amount: formatDecimalForField(last.grams, "en") };
}

export function useLogForm({ key, target, date, today, actions, onLogged, onGone }: UseLogFormOptions): LogForm {
  const failureLine = useFailureLine("form");
  const tRow = useTranslations("day.row");
  const errorCopy = useErrorCopy();
  const chipLabel = usePortionChipLabel();
  const id = useId();
  const guard = useSubmitGuard();

  // Everything the user typed or chose, reset when another food or meal opens.
  const [formKey, setFormKey] = useState(key);
  const [fields, setFields] = useState<Fields | null>(null);
  const [chosen, setChosen] = useState<EntryStatus | null>(null);
  const [error, setError] = useState<EntryFieldError | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [goneChips, setGoneChips] = useState<ReadonlySet<string>>(new Set());
  const [entryId, setEntryId] = useState(() => newId());
  if (formKey !== key) {
    setFormKey(key);
    setFields(null);
    setChosen(null);
    setError(undefined);
    setFormError(null);
    setSubmitting(false);
    setGoneChips(new Set());
    setEntryId(newId());
  }

  const prefill = useMemo<Fields | null>(() => {
    if (target === null) return null;
    if (target.kind === "meal") return { unit: GRAMS, amount: formatCount(target.lastCount ?? 1, "en") };
    if (target.last !== undefined) return fieldsOfLast(target.last);
    return target.detail ? fieldsOfLast(target.detail.lastAmount) : null;
  }, [target]);

  const chips = useMemo<UnitChip[]>(() => {
    const list: UnitChip[] = [{ id: GRAMS, label: null }];
    if (target?.kind !== "food") return list;
    const last = target.last ?? target.detail?.lastAmount ?? null;
    const own = last?.portion?.id ? last.portion : null;
    if (own?.id && !goneChips.has(own.id)) {
      const current = target.detail?.portions.find((p) => p.id === own.id);
      list.push({ id: own.id, label: chipLabel(own), grams: current?.grams ?? (last?.grams ?? 0) / own.count });
    }
    for (const portion of target.detail?.portions ?? []) {
      if (portion.id !== own?.id && !goneChips.has(portion.id)) {
        list.push({ id: portion.id, label: chipLabel(portion), grams: portion.grams });
      }
    }
    return list;
  }, [target, goneChips, chipLabel]);

  const shown: Fields = fields ?? prefill ?? { unit: GRAMS, amount: "" };
  const unit = chips.some((c) => c.id === shown.unit) ? shown.unit : GRAMS;
  const chip = chips.find((c) => c.id === unit) ?? chips[0];
  const future = today !== null && date > today;
  const status: EntryStatus = future ? "planned" : (chosen ?? "eaten");

  let preview: Figures | null = null;
  if (target?.kind === "food") {
    const grams = gramsOf(shown.amount, chip);
    preview = grams === null ? null : entryFigures(target.food.per100g, { per: "100g", grams });
  } else if (target?.kind === "meal") {
    const count = parseCount(shown.amount);
    preview = typeof count === "number" ? entryFigures(target.meal.figures, { per: "meal", count }) : null;
  }

  const empty = shown.amount.trim() === "";
  const dirty =
    (fields !== null && (prefill === null || fields.unit !== prefill.unit || fields.amount !== prefill.amount)) ||
    chosen !== null;

  function change(next: Fields): void {
    setFields(next);
    setError(undefined);
  }

  /**
   * How the amount reads in the toast. It reads the unit and the shown amount as they are when it
   * is called, so a caller that needs the label later (the toast's "Log another") keeps the string
   * it got at the press and never calls this again.
   */
  function amountLabel(n: number): string {
    if (target?.kind === "meal") return tRow("meals", { count: n });
    if (unit === GRAMS) return tRow("grams", { grams: formatGrams(n) });
    return tRow("portion", {
      count: formatCount(n),
      portion: chip.label ?? "",
      grams: formatGrams(gramsOf(shown.amount, chip) ?? 0),
    });
  }

  function requestFor(id: string, n: number): AddRequest | null {
    if (target === null) return null;
    const common = { id, date, status };
    const body =
      target.kind === "meal"
        ? { kind: "saved_meal" as const, savedMealId: target.meal.id, count: n, ...common }
        : {
            kind: "food" as const,
            foodId: target.food.id,
            amount: unit === GRAMS ? { grams: n } : { portionId: unit, count: n },
            ...common,
          };
    const name = target.kind === "meal" ? target.meal.name : target.food.name;
    return {
      body,
      name,
      amount: amountLabel(n),
      again: () => requestFor(newId(), n)!,
    };
  }

  async function send(): Promise<void> {
    if (target === null || actions.holding) return;
    setFormError(null);
    const n = target.kind === "meal" ? parseCount(shown.amount) : parseAmount(shown.amount, unit);
    if (typeof n !== "number") {
      setError(n);
      focusField(`${id}-amount`);
      return;
    }
    const request = requestFor(entryId, n);
    if (request === null) return;
    setSubmitting(true);
    try {
      const done = await actions.add(request);
      if (done === "held") {
        setSubmitting(false);
        return;
      }
      // Still busy: the sheet slides out showing what was on screen.
      onLogged(done);
    } catch (err) {
      setSubmitting(false);
      const code = getErrorCode(err);
      if (code === "food_not_found" || code === "saved_meal_not_found") {
        onGone(target.kind, target.kind === "meal" ? target.meal.id : target.food.id);
      } else if (code === "entry_grams_invalid" || code === "entry_count_invalid") {
        setError(code);
        focusField(`${id}-amount`);
      } else if (code === "portion_not_found") {
        // The portion went away since the chips were drawn: grams from here on.
        const grams = gramsOf(shown.amount, chip);
        setGoneChips((prev) => new Set(prev).add(unit));
        setFields({ unit: GRAMS, amount: grams === null ? "" : formatDecimalForField(grams, "en") });
        setFormError(errorCopy.forCode("portion_not_found"));
      } else {
        // An id another account holds can never succeed: the next Log sends a new one.
        if (code === "entry_id_taken") setEntryId(newId());
        setFormError(failureLine(err));
      }
    }
  }

  return {
    formId: `${id}-form`,
    fieldId: `${id}-amount`,
    kind: target?.kind ?? "food",
    chips,
    unit,
    amount: shown.amount,
    error,
    status,
    future,
    preview,
    empty,
    dirty,
    submitting,
    formError,
    setUnit: (next) => change({ unit: next.id, amount: switchUnit(shown.amount, chip, next) }),
    setAmount: (raw) => change({ unit, amount: raw }),
    setStatus: setChosen,
    submit: () => {
      if (submitting || actions.holding || empty) return;
      guard.run(send);
    },
  };
}
