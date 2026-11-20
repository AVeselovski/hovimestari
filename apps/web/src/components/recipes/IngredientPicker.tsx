"use client";

import { GRAMS, gramsOf, parseAmount, switchUnit, type EntryFieldError } from "@/components/entries/amount";
import { AmountField } from "@/components/entries/AmountField";
import { usePortionChipLabel } from "@/components/entries/portionLabel";
import { FoodDetailHeader } from "@/components/foods/FoodDetail";
import { FoodList } from "@/components/foods/FoodSearchView";
import { useFoodFinder } from "@/components/foods/useFoodFinder";
import { Field } from "@/components/form/Field";
import { AmountFigures } from "@/components/log/AmountFigures";
import { foodChipsOf } from "@/components/log/foodChips";
import { releaseHeldLists } from "@/components/log/heldList";
import { useStatusMessage } from "@/components/log/StatusLine";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PromptSheetBody } from "@/components/ui/PromptSheetBody";
import { btnPrimary, btnText, btnTextDanger } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useIsMobile } from "@/hooks/useIsMobile";
import { formatCount } from "@/lib/entryFormat";
import { formatDecimalForField } from "@/lib/foodFormat";
import { favouriteFoodsQuery, foodDetailQuery, ownFoodsQuery } from "@/lib/queryOptions";
import {
  entryFigures,
  MAX_LINE_NOTE_LENGTH,
  type ErrorCode,
  type FoodSummary,
  type LastAmount,
} from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { useLineAmount } from "./lineAmount";
import type { CountedDraft, DraftFood } from "./recipeDraft";
import { readWritten, WrittenFields, writtenFieldsOf, type WrittenFieldValues } from "./WrittenFields";

// ---------------------------------------------------------------------------
// IngredientPicker: one tall sheet stacked on the recipe editor, which finds
// a food and takes its amount. Two views in the one sheet, so its top edge
// never moves:
//
// - Search: the header's first line says "Adding to Shakshuka", or for six
//   seconds after an add "Added Kananmuna, 4 × Medium piece · 240 g.". Under
//   it the food search (`useFoodFinder`), its field pinned in the header,
//   browsing the person's favourite foods and own foods while fewer than two
//   characters are typed. Its scanner and own-food sheets stack on this one.
//   Done in the footer closes the picker.
// - Amount, after a tap on a food: Back and the food's name in the header.
//   Change food, then the amount (`AmountField`: grams, or a count of one of
//   the food's portions), opening on grams with the field empty, since a
//   recipe's amount is not the last amount logged. "For this amount" and its
//   figures, then As written and Note. Add in the footer, or for a line
//   opened from the editor, Save with Remove ingredient beside it.
//
// After Add the line is already in the editor behind the picker, and the
// picker returns to its search, empty, focus in the field, so five
// ingredients are five searches and five amounts with no sheet opening or
// closing. A food saved from the own-food sheet goes straight to its amount.
// ---------------------------------------------------------------------------

export interface IngredientPickerProps {
  open: boolean;
  /** Done, and every dismissal. */
  onClose: () => void;
  returnFocusTo: HTMLElement | null;
  /** The recipe's name as typed, for the status line. */
  recipeName: string;
  /** A line to change, opened on its amount. Null to add new lines. */
  editing: CountedDraft | null;
  /** A new line, with an id of its own. */
  onAdd: (line: Omit<CountedDraft, "id">) => void;
  /** The line being changed, as it now is. */
  onSave: (line: CountedDraft) => void;
  onRemove: (id: string) => void;
}

type View = { kind: "search" } | { kind: "amount"; food: DraftFood };

interface AmountFields {
  unit: string;
  amount: string;
  written: WrittenFieldValues;
  note: string;
}

const EMPTY: AmountFields = { unit: GRAMS, amount: "", written: { amount: "", unit: "" }, note: "" };

function fieldsOfLine(line: CountedDraft): AmountFields {
  return {
    unit: line.portion?.id ?? GRAMS,
    amount: line.portion ? formatCount(line.portion.count, "en") : formatDecimalForField(line.grams, "en"),
    written: writtenFieldsOf(line.written),
    note: line.note ?? "",
  };
}

const foodOf = (food: FoodSummary): DraftFood => ({
  id: food.id,
  name: food.name,
  source: food.source,
  per100g: food.per100g,
  retired: food.retired,
  deleted: false,
});

export function IngredientPicker({
  open,
  onClose,
  returnFocusTo,
  recipeName,
  editing,
  onAdd,
  onSave,
  onRemove,
}: IngredientPickerProps): ReactElement {
  const t = useTranslations("recipes.picker");
  const tFoods = useTranslations("foods.sheet");
  const errorCopy = useErrorCopy();
  const client = useQueryClient();
  const isMobile = useIsMobile();
  const chipLabel = usePortionChipLabel();
  const amountOf = useLineAmount();
  const status = useStatusMessage();
  const id = useId();
  const formId = `${id}-form`;
  const fieldId = `${id}-amount`;

  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<View>(() => (editing ? { kind: "amount", food: editing.food } : { kind: "search" }));
  const [fields, setFields] = useState<AmountFields>(() => (editing ? fieldsOfLine(editing) : EMPTY));
  const [errors, setErrors] = useState<{ amount?: EntryFieldError; written?: ErrorCode; note?: ErrorCode }>({});
  // Focus goes to the search field after an add, once the search view is back on screen.
  const focusSearch = useRef(false);
  useLayoutEffect(() => {
    if (view.kind !== "search" || !focusSearch.current) return;
    focusSearch.current = false;
    inputRef.current?.focus({ preventScroll: true });
  });

  const food = view.kind === "amount" ? view.food : null;
  const detail = useQuery({ ...foodDetailQuery(food?.id ?? ""), enabled: food !== null });
  const portionOfLine = editing && food?.id === editing.food.id ? editing.portion : null;
  const last: LastAmount | null = portionOfLine ? { grams: editing!.grams, portion: portionOfLine } : null;
  const chips = foodChipsOf({ last, portions: detail.data?.portions, gone: new Set(), label: chipLabel });
  const unit = chips.some((c) => c.id === fields.unit) ? fields.unit : GRAMS;
  const chip = chips.find((c) => c.id === unit) ?? chips[0];
  const grams = gramsOf(fields.amount, chip);
  const preview = food && grams !== null ? entryFigures(food.per100g, { per: "100g", grams }) : null;

  /**
   * Opens a food's amount. After Change food the amount typed is kept, in
   * grams, since the new food has portions of its own. After an add the
   * fields are empty, so a new line starts on grams with the field empty.
   */
  function pick(picked: FoodSummary): void {
    status.clear();
    setErrors({});
    setFields((prev) =>
      prev.unit === GRAMS
        ? prev
        : { ...prev, unit: GRAMS, amount: kept.current === null ? "" : formatDecimalForField(kept.current, "en") },
    );
    setView({ kind: "amount", food: foodOf(picked) });
  }
  // The grams of the amount typed, kept across Change food.
  const kept = useRef<number | null>(null);

  const finder = useFoodFinder({
    open,
    canPick: view.kind === "search",
    inputRef,
    contentRef,
    say: (note) => status.say(note, "note"),
    onPick: (picked) => pick(picked),
    onSavedOwnFood: (saved) => {
      releaseHeldLists(client);
      pick(saved);
    },
    onOwnFoodDeleted: () => finder.reset(),
    onFoodGone: () => setView({ kind: "search" }),
    label: t("search"),
  });

  /** Back from the amount: to the search for a new line, out of the picker for a line opened to change. */
  function back(): void {
    if (editing) onClose();
    else {
      setFields(EMPTY);
      setErrors({});
      setView({ kind: "search" });
    }
  }

  function submit(): void {
    if (!food) return;
    const n = parseAmount(fields.amount, unit);
    const written = readWritten(fields.written);
    const note = fields.note.trim();
    const next = {
      amount: typeof n !== "number" ? n : grams === null ? ("entry_grams_invalid" as const) : undefined,
      written: written.ok ? undefined : written.error,
      note: note.length > MAX_LINE_NOTE_LENGTH ? ("line_note_too_long" as const) : undefined,
    };
    if (next.amount || next.written || next.note) {
      setErrors(next);
      if (next.amount) document.getElementById(fieldId)?.focus();
      return;
    }
    const portion =
      unit === GRAMS || typeof n !== "number"
        ? null
        : {
            id: unit,
            unit: detail.data?.portions.find((p) => p.id === unit)?.unit ?? portionOfLine?.unit ?? null,
            name: detail.data?.portions.find((p) => p.id === unit)?.name ?? portionOfLine?.name ?? null,
            count: n,
          };
    const line = {
      kind: "counted" as const,
      food,
      grams: grams!,
      portion,
      written: written.ok ? written.value : null,
      note: note === "" ? null : note,
    };
    if (editing) {
      onSave({ ...line, id: editing.id });
      onClose();
      return;
    }
    onAdd(line);
    status.say(t("added", { name: food.name, amount: amountOf(line) }), "note");
    setFields(EMPTY);
    setErrors({});
    finder.reset();
    focusSearch.current = true;
    setView({ kind: "search" });
  }

  const named = recipeName.trim();
  const statusText =
    status.message?.text ??
    (editing && named ? t("changing", { name: named }) : named ? t("adding", { name: named }) : t("addingNew"));
  const header = (
    <div className="space-y-1.5">
      <p
        aria-live="polite"
        data-status-line=""
        className={`h-5 truncate text-sm leading-5 ${status.message ? "text-ink" : "text-ink-muted"}`}
      >
        {statusText}
      </p>
      {view.kind === "search" ? (
        finder.field
      ) : (
        <FoodDetailHeader name={view.food.name} backRef={backRef} onBack={back} />
      )}
    </div>
  );

  const footer =
    view.kind === "search" ? (
      <button type="button" onClick={onClose} className={`${btnPrimary} w-full`}>
        {t("done")}
      </button>
    ) : (
      <>
        {editing ? (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onRemove(editing.id);
                onClose();
              }}
              className={btnTextDanger}
            >
              {t("remove")}
            </button>
            <button type="submit" form={formId} className={`${btnPrimary} w-full`}>
              {t("save")}
            </button>
          </div>
        ) : (
          <button type="submit" form={formId} className={`${btnPrimary} w-full`}>
            {t("add")}
          </button>
        )}
      </>
    );

  const favourites = useQuery({ ...favouriteFoodsQuery(), enabled: view.kind === "search" });
  const own = useQuery({ ...ownFoodsQuery(), enabled: view.kind === "search" });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      ariaLabel={t("name")}
      header={header}
      size="tall"
      keyboardAware
      dismissible={view.kind === "search" || fields.amount === ""}
      returnFocusTo={returnFocusTo}
      panelClassName="md:max-w-lg"
      footer={footer}
      stacked={finder.stacked}
    >
      <PromptSheetBody focusSelf={isMobile && view.kind === "search"}>
        <div ref={contentRef}>
          {view.kind === "search" ? (
            finder.results({
              notice: null,
              browse: (
                <div className="space-y-6">
                  <FoodList
                    list="picker-favourites"
                    title={tFoods("favourites")}
                    empty={tFoods("favouritesEmpty")}
                    foods={favourites.data?.foods}
                    onOpen={(f) => pick(f)}
                  />
                  <FoodList
                    list="picker-own"
                    title={tFoods("ownFoods")}
                    empty={tFoods("ownFoodsEmpty")}
                    foods={own.data?.foods}
                    onOpen={(f) => pick(f)}
                  />
                  <button
                    type="button"
                    onClick={(e) => finder.ownSheet.open(e.currentTarget, { start: { name: "" } })}
                    className={`${btnText}`}
                  >
                    {tFoods("addOwn")}
                  </button>
                </div>
              ),
            })
          ) : (
            <form
              id={formId}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="space-y-4"
              data-picker-amount=""
            >
              <button
                type="button"
                onClick={() => {
                  kept.current = grams;
                  setView({ kind: "search" });
                }}
                className={btnText}
              >
                {t("changeFood")}
              </button>
              <AmountField
                id={fieldId}
                chips={chips}
                unit={unit}
                amount={fields.amount}
                onUnit={(next) => setFields((f) => ({ ...f, unit: next.id, amount: switchUnit(f.amount, chip, next) }))}
                onAmount={(raw) => {
                  setFields((f) => ({ ...f, amount: raw }));
                  setErrors((e) => ({ ...e, amount: undefined }));
                }}
                error={errors.amount}
                autoFocus={!isMobile || editing === null}
                layout="beside"
                hint={t("amountHint")}
              />
              <AmountFigures preview={preview} empty={fields.amount.trim() === ""} />
              <WrittenFields
                idPrefix={id}
                values={fields.written}
                error={errors.written ? errorCopy.forCode(errors.written) : null}
                onChange={(written) => {
                  setFields((f) => ({ ...f, written }));
                  setErrors((e) => ({ ...e, written: undefined }));
                }}
              />
              <NoteField
                id={`${id}-note`}
                value={fields.note}
                error={errors.note ? errorCopy.forCode(errors.note) : null}
                onChange={(note) => setFields((f) => ({ ...f, note }))}
              />
            </form>
          )}
        </div>
      </PromptSheetBody>
    </BottomSheet>
  );
}

function NoteField({
  id,
  value,
  error,
  onChange,
}: {
  id: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}): ReactElement {
  const t = useTranslations("recipes.picker");
  return (
    <Field
      id={id}
      name="note"
      label={t("note")}
      hint={t("noteHint")}
      error={error}
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
