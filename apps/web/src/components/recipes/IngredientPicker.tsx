"use client";

import { GRAMS, gramsOf, parseAmount } from "@/components/entries/amount";
import { usePortionChipLabel } from "@/components/entries/portionLabel";
import { CopyToOwnButton } from "@/components/foods/CopyToOwnButton";
import { FoodDetailHeader } from "@/components/foods/FoodDetail";
import { FoodList } from "@/components/foods/FoodSearchView";
import { useFoodFinder } from "@/components/foods/useFoodFinder";
import { foodChipsOf } from "@/components/log/foodChips";
import { releaseHeldLists } from "@/components/log/heldList";
import { useStatusMessage } from "@/components/log/StatusLine";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PromptSheetBody } from "@/components/ui/PromptSheetBody";
import { btnPrimary, btnText, btnTextDanger, statusLineClass } from "@/components/ui/styles";
import { useArmedAtRest } from "@/hooks/useArmedAtRest";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePressGuard } from "@/hooks/usePressGuard";
import { formatCount } from "@/lib/entryFormat";
import { formatDecimalForField } from "@/lib/foodFormat";
import { detailUnavailable, favouriteFoodsQuery, foodDetailQuery, ownFoodsQuery } from "@/lib/queryOptions";
import { entryFigures, MAX_LINE_NOTE_LENGTH, type FoodSummary, type LastAmount } from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { useLineAmount } from "./lineAmount";
import { PickerAmountForm, type AmountErrors, type AmountFields } from "./PickerAmountForm";
import type { CountedDraft, DraftFood } from "./recipeDraft";
import { readWritten, writtenFieldsOf } from "./WrittenFields";

// ---------------------------------------------------------------------------
// IngredientPicker: one tall sheet stacked on the recipe editor, which finds
// a food and takes its amount. Two views in the one sheet, so its top edge
// never moves:
//
// - Search: the header's first line says "Adding to Shakshuka", or for six
//   seconds after an add "Added 4 × Medium piece · 220 g of Kananmuna.", the
//   amount first, since the line is cut at the sheet's width and the amount
//   is what confirms the add. Under it the food search (`useFoodFinder`),
//   its field pinned in the header, browsing the person's favourite foods
//   and own foods while fewer than two characters are typed. Its scanner and
//   own-food sheets stack on this one. Done in the footer closes the picker.
// - Amount, after a tap on a food: Back and the food's name, on two lines,
//   in the header, and the form (`PickerAmountForm`). It opens on grams with
//   the field empty, since a recipe's amount is not the last amount logged.
//   Add in the footer, or for a line opened from the editor, Save with
//   Remove ingredient beside it. For a food from Fineli or Open Food Facts,
//   Copy to my foods under the form opens the
//   own-food form filled in from it (`CopyToOwnButton`), so a close food can
//   become the person's own with their changes, and with the barcode the
//   search carries from a miss. Saved, it opens on its amount with the
//   amount typed kept, as any own food saved here does.
//
// The dialog is named after what it shows: "Add ingredient" on the search,
// "Change ingredient" on the search of a line being changed, and the food's
// name on the amount, since the header's own copy of the name is hidden
// from assistive technology.
//
// After Add the line is already in the editor behind the picker, and the
// picker returns to its search, empty, focus in the field, and a barcode
// carried from a miss is dropped, since a food was chosen without it, so five
// ingredients are five searches and five amounts with no sheet opening or
// closing. Back and Change food put focus in the search field too. A food
// saved from the own-food sheet goes straight to its amount.
//
// The amount appears under the finger that pressed a row, in the search or
// in the editor. Its body and footer take no press for the half second after
// (`usePressGuard`), so the second tap of a double tap lands on nothing. The
// amount field takes its tap as focus at the pointerdown, which the hold
// leaves alone. No row sits under the header, so Back takes a press at once.
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
  /**
   * What the picker says where the lines do not go to a recipe, such as a
   * batch logged as made: the status line while adding and while changing,
   * and `takeOut`, the label of the action in Remove ingredient's place when
   * it takes the line out and deletes nothing, such as Leave out. That one
   * is drawn in ink, as a plain action.
   */
  words?: { adding?: string; changing?: string; takeOut?: string };
}

type View = { kind: "search" } | { kind: "amount"; food: DraftFood };

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
  words,
}: IngredientPickerProps): ReactElement {
  const t = useTranslations("recipes.picker");
  const tFoods = useTranslations("foods.sheet");
  const tLists = useTranslations("lists");
  const errorCopy = useErrorCopy();
  const client = useQueryClient();
  const isMobile = useIsMobile();
  // The picker slides up under the finger that pressed Add ingredient: its results wait until it is at rest.
  const armed = useArmedAtRest(open, isMobile);
  // A row's press opened the amount, the editor's line on show or a food in the search: it waits out a double tap.
  const opened = usePressGuard(editing !== null);
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
  const [errors, setErrors] = useState<AmountErrors>({});
  // The grams of the amount typed, kept across Change food.
  const kept = useRef<number | null>(null);
  // Focus goes to the search field after an add, Back or Change food, once the search view is back on screen.
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
   * `held`: a press in the search picked it, so the amount waits out a double tap.
   */
  function pick(picked: FoodSummary, held = true): void {
    if (held) opened.hold();
    status.clear();
    setErrors({});
    setFields((prev) =>
      prev.unit === GRAMS
        ? prev
        : { ...prev, unit: GRAMS, amount: kept.current === null ? "" : formatDecimalForField(kept.current, "en") },
    );
    setView({ kind: "amount", food: foodOf(picked) });
  }
  const finder = useFoodFinder({
    open,
    canPick: view.kind === "search",
    inputRef,
    contentRef,
    say: (note) => status.say(note, "note"),
    onPick: (picked) => pick(picked),
    onSavedOwnFood: (saved) => {
      releaseHeldLists(client);
      // Not held: the own-food sheet closing over the picker takes the second tap of a double tap on Save.
      pick(saved, false);
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
      focusSearch.current = true;
      setView({ kind: "search" });
    }
  }

  /** Change food: the search again, the amount typed kept in grams for the food picked next. */
  function changeFood(): void {
    kept.current = grams;
    focusSearch.current = true;
    setView({ kind: "search" });
  }

  function submit(): void {
    if (!food) return;
    const n = parseAmount(fields.amount, unit);
    const written = readWritten(fields.written);
    const note = fields.note.trim();
    const next: AmountErrors = {
      amount: typeof n !== "number" ? n : grams === null ? ("entry_grams_invalid" as const) : undefined,
      written: written.ok ? undefined : written.refusal,
      note: note.length > MAX_LINE_NOTE_LENGTH ? errorCopy.forCode("line_note_too_long") : undefined,
    };
    if (next.amount || next.written || next.note) {
      setErrors(next);
      // Focus goes to the first refused field.
      const first = next.amount ? fieldId : next.written ? `${id}-written-${next.written}` : `${id}-note`;
      document.getElementById(first)?.focus();
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
    status.say(t("added", { amount: amountOf(line), name: food.name }), "note");
    setFields(EMPTY);
    setErrors({});
    finder.reset();
    finder.endCarry();
    focusSearch.current = true;
    setView({ kind: "search" });
  }

  const named = recipeName.trim();
  const statusText =
    status.message?.text ??
    (editing
      ? (words?.changing ?? (named ? t("changing", { name: named }) : t("addingNew")))
      : (words?.adding ?? (named ? t("adding", { name: named }) : t("addingNew"))));
  const header = (
    <div className="space-y-1.5">
      <p
        aria-live="polite"
        data-status-line=""
        className={`${statusLineClass} ${status.message ? "text-ink" : "text-ink-muted"}`}
      >
        {statusText}
      </p>
      {view.kind === "search" ? (
        finder.field
      ) : (
        <FoodDetailHeader name={view.food.name} backRef={backRef} onBack={back} wide />
      )}
    </div>
  );

  const footer =
    view.kind === "search" ? (
      <button type="button" onClick={onClose} className={`${btnPrimary} w-full`}>
        {t("done")}
      </button>
    ) : (
      <div className="contents" {...opened.guardProps}>
        {editing ? (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onRemove(editing.id);
                onClose();
              }}
              className={words?.takeOut ? btnText : btnTextDanger}
            >
              {words?.takeOut ?? t("remove")}
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
      </div>
    );

  const favourites = useQuery({ ...favouriteFoodsQuery(), enabled: view.kind === "search" });
  const own = useQuery({ ...ownFoodsQuery(), enabled: view.kind === "search" });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      ariaLabel={view.kind === "amount" ? view.food.name : editing ? t("nameChange") : t("name")}
      header={header}
      size="tall"
      keyboardAware
      dismissible={view.kind === "search" || fields.amount === ""}
      returnFocusTo={returnFocusTo}
      panelClassName="md:max-w-lg"
      footer={footer}
      stacked={finder.stacked}
      onOpened={armed.onOpened}
    >
      <PromptSheetBody focusSelf={isMobile && view.kind === "search"}>
        <div ref={contentRef}>
          {view.kind === "search" ? (
            <div {...armed.guardProps}>
              {finder.results({
                notice: null,
                browse: (
                  <div className="space-y-6">
                    <FoodList
                      list="picker-favourites"
                      title={tFoods("favourites")}
                      empty={t("favouritesEmpty")}
                      foods={favourites.data?.foods}
                      onOpen={(f) => pick(f)}
                    />
                    <FoodList
                      list="picker-own"
                      title={tLists("myFoods")}
                      empty={tFoods("ownFoodsEmpty")}
                      foods={own.data?.foods}
                      onOpen={(f) => pick(f)}
                    />
                    <button
                      type="button"
                      onClick={(e) => finder.ownSheet.open(e.currentTarget, { start: { name: "" } })}
                      className={btnText}
                    >
                      {tLists("newFood")}
                    </button>
                  </div>
                ),
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-6" {...opened.guardProps}>
              <PickerAmountForm
                id={id}
                formId={formId}
                fieldId={fieldId}
                fields={fields}
                errors={errors}
                chips={chips}
                unit={unit}
                chip={chip}
                preview={preview}
                autoFocus={!isMobile || editing === null}
                onFields={setFields}
                onErrors={setErrors}
                onChangeFood={changeFood}
                onSubmit={submit}
              />
              {food && (
                <CopyToOwnButton
                  source={food.source}
                  detail={detail.data}
                  unavailable={detailUnavailable(detail)}
                  copy={finder.copy}
                />
              )}
            </div>
          )}
        </div>
      </PromptSheetBody>
    </BottomSheet>
  );
}
