"use client";

import { MacroFigures } from "@/components/figures/MacroFigures";
import { focusField } from "@/components/form/focus";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { NativeDateInput, dateHintId } from "@/components/ui/NativeDateInput";
import { btnText, labelClass, noticeClass, sectionStart } from "@/components/ui/styles";
import type { EntryActions } from "@/hooks/useEntryActions";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useFormDirty } from "@/hooks/useFormDirty";
import { useToday } from "@/hooks/useToday";
import { getErrorCode } from "@/lib/errors";
import { isIsoDate } from "@/lib/localDate";
import { foodDetailQuery } from "@/lib/queryOptions";
import { isPlainPress, keepDayPlace, markOpenedInApp } from "@/lib/recipeNav";
import type { Entry, ErrorCode } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useMemo, useState, type ReactElement } from "react";
import { GRAMS, switchUnit, type UnitChip } from "./amount";
import { AmountField } from "./AmountField";
import { CountField } from "./CountField";
import {
  buildPatch,
  fieldsOf,
  firstInvalidField,
  previewOf,
  type EntryField,
  type EntryFieldErrors,
  type EntryFields,
} from "./entryForm";
import { EstimateFields, estimateFieldId } from "./EstimateFields";
import { usePortionChipLabel } from "./portionLabel";
import { StateChoice } from "./StateChoice";

// ---------------------------------------------------------------------------
// EntrySheet: one entry, to change its amount, date or state, or remove it.
// Its title is the entry's name. Every field is prefilled from the entry
// itself when the sheet opens, and nothing that loads later rewrites a field
// or moves the chip the person sees: a food's other portions join the chip
// row after the chips already shown once its detail answers.
//
// The preview is the server's own figures while the amount is as saved, and
// `entryFigures` on the entry's stored basis once it changes, so it is the
// figure Save will store. Save sends only what changed, and closes the sheet
// with a toast that can undo it. A failure keeps the sheet open with the
// typed values and says why under the form. A recipe entry has Open recipe
// under its figures, which leaves for the recipe's page, and keeps the day's
// place for the way back (lib/recipeNav.ts). While the sheet holds unsaved
// changes it is dimmed and does nothing, as Escape, a drag and a press
// outside do nothing then: only Cancel and Save leave a changed sheet. A
// line beside it says so, "Save or cancel first.", and describes the link.
// ---------------------------------------------------------------------------

export interface EntrySheetProps extends FormSheetCallerProps {
  entry: Entry;
  actions: EntryActions;
  /** Where focus goes after Remove entry, read while the row is still on the page. */
  focusAfterRemove: () => HTMLElement | null;
}

/** Which field an answered error code belongs to, if any. */
function fieldOfCode(code: ErrorCode | undefined): EntryField | null {
  switch (code) {
    case "entry_grams_invalid":
    case "entry_count_invalid":
      return "amount";
    case "name_required":
    case "name_too_long":
      return "name";
    case "note_too_long":
      return "note";
    case "invalid_date":
      return "date";
    default:
      return null;
  }
}

export function EntrySheet({
  open,
  returnFocusTo,
  onClose,
  onSaved,
  entry,
  actions,
  focusAfterRemove,
}: EntrySheetProps): ReactElement {
  const t = useTranslations("entries.sheet");
  const tAmount = useTranslations("entries.amount");
  const errorCopy = useErrorCopy();
  const failureLine = useFailureLine("form");
  const { today } = useToday();
  const id = useId();
  const chipLabel = usePortionChipLabel();

  const [fields, setFields] = useState<EntryFields>(() => fieldsOf(entry));
  const [errors, setErrors] = useState<EntryFieldErrors>({});
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { dirty } = useFormDirty(JSON.stringify(fields), true);

  // The food's portions, for its other chips. A hidden food reads nothing.
  const food = entry.kind === "food" ? entry.food : null;
  const readDetail = food !== null && !food.deleted && entry.portion?.id !== null;
  const { data: detail } = useQuery({ ...foodDetailQuery(food?.id ?? ""), enabled: readDetail && open });

  const chips = useMemo<UnitChip[]>(() => {
    const list: UnitChip[] = [{ id: GRAMS, label: null }];
    if (food === null || food.deleted) return list;
    const own = entry.portion?.id ? entry.portion : null;
    if (own?.id) {
      const current = detail?.portions.find((p) => p.id === own.id);
      list.push({
        id: own.id,
        label: chipLabel(own),
        grams: current?.grams ?? (entry.grams ?? 0) / own.count,
      });
    }
    if (own === null && entry.portion !== null) return list;
    for (const portion of detail?.portions ?? []) {
      if (portion.id !== own?.id) list.push({ id: portion.id, label: chipLabel(portion), grams: portion.grams });
    }
    return list;
  }, [food, entry, detail, chipLabel]);

  const future = today !== null && isIsoDate(fields.date) && fields.date > today;
  const preview = previewOf(entry, fields, chips);
  const ownChipAwaitsDetail =
    entry.kind === "food" &&
    fields.unit !== GRAMS &&
    fields.unit === entry.portion?.id &&
    detail === undefined &&
    readDetail;
  const changedAmount = JSON.stringify(previewOf(entry, fieldsOf(entry), chips)) !== JSON.stringify(preview);
  // "Enter an amount" only for an empty field: an amount out of range has its own line.
  const amountEmpty = entry.kind !== "estimate" && fields.amount.trim() === "";
  const caption =
    preview === null
      ? amountEmpty
        ? tAmount("enterAmount")
        : null
      : ownChipAwaitsDetail && changedAmount
        ? t("figuresOnSave")
        : tAmount("forAmount");

  // Holding (the app asks the server for today) stops Save and Remove only.
  // Cancel and dismissal stay free.
  const busy = saving || removing;
  const held = actions.holding;
  const fieldId = (field: EntryField) =>
    field === "amount" ? `${id}-amount` : field === "date" ? `${id}-date` : estimateFieldId(id, field);

  /** Changes fields, and clears their errors: a corrected field no longer shows the old refusal. */
  function change(patch: Partial<EntryFields>): void {
    setFields((prev) => ({ ...prev, ...patch }));
    const touched = Object.keys(patch).map((k) => (k === "unit" ? "amount" : k)) as EntryField[];
    setErrors((prev) => {
      if (!touched.some((f) => prev[f] !== undefined)) return prev;
      const next = { ...prev };
      for (const f of touched) delete next[f];
      return next;
    });
  }

  async function handleSubmit(): Promise<void> {
    if (busy || held) return;
    setFormError(null);
    const dateError = isIsoDate(fields.date) ? null : "invalid_date";
    const built = buildPatch(entry, fields, today);
    const nextErrors: EntryFieldErrors = built.ok ? {} : built.errors;
    if (dateError) nextErrors.date = dateError;
    setErrors(nextErrors);
    const first = firstInvalidField(nextErrors);
    if (first) {
      focusField(fieldId(first));
      return;
    }
    if (!built.ok) return;
    if (Object.keys(built.patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    let outcome;
    try {
      outcome = await actions.save(entry, built.patch);
    } catch (err) {
      const code = getErrorCode(err);
      const field = fieldOfCode(code);
      if (field && code) {
        setErrors({ [field]: code });
        focusField(fieldId(field));
      } else {
        setFormError({ line: failureLine(err), cause: err });
      }
      setSaving(false);
      return;
    }
    if (outcome === "held") {
      // Nothing was sent: the sheet stays as it is, for Save again.
      setSaving(false);
      return;
    }
    // Still busy: the sheet slides out showing what was on screen.
    if (outcome === "done") onSaved?.();
    onClose();
  }

  async function handleRemove(): Promise<void> {
    if (busy || held) return;
    setFormError(null);
    // Read while the row is on the page: it leaves with the answer.
    const target = focusAfterRemove();
    setRemoving(true);
    let outcome;
    try {
      // The sheet closes as the answer arrives, before the row leaves the page.
      outcome = await actions.remove(entry, onClose);
    } catch (err) {
      setFormError({ line: failureLine(err), cause: err });
      setRemoving(false);
      return;
    }
    if (outcome === "held") setRemoving(false);
    else if (outcome === "gone") onClose();
    else target?.focus();
  }

  const dateLine = errors.date ? errorCopy.forCode(errors.date) : null;
  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={entry.name}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={busy}
      held={held}
      onSubmit={handleSubmit}
      formError={formError}
      idle={t("save")}
      busy={saving ? t("saving") : t("save")}
      // Nobody removes an entry while typing: the row gives its room to the keyboard.
      footerStart={{ label: t("remove"), onPress: () => void handleRemove(), yieldsToKeyboard: true }}
      // A long name keeps two lines, so the fields under the title stay in reach.
      sheet={{ panelClassName: "md:max-w-md", titleClassName: "line-clamp-2 break-words" }}
    >
      {({ autoFocus }) => (
        <>
          {entry.kind === "food" && entry.food?.deleted && <p className={noticeClass}>{t("foodGone")}</p>}
          {entry.kind === "saved_meal" && entry.savedMeal?.deleted && <p className={noticeClass}>{t("mealGone")}</p>}
          {entry.kind === "recipe" && entry.recipe?.deleted && <p className={noticeClass}>{t("recipeGone")}</p>}
          {/* Eaten or planned comes first, for every kind: marking a planned
              entry eaten is this sheet's main job, so it is in the first
              screen of a phone even over an estimate's six fields. */}
          <StateChoice
            id={`${id}-state`}
            value={fields.status}
            onChange={(status) => change({ status })}
            future={future}
            reason={{ id: dateHintId(fieldId("date")), shown: dateLine === null }}
          />
          {entry.kind === "food" && (
            <AmountField
              id={fieldId("amount")}
              chips={chips}
              unit={fields.unit}
              amount={fields.amount}
              onUnit={(chip) => {
                const from = chips.find((c) => c.id === fields.unit) ?? chips[0];
                change({ unit: chip.id, amount: switchUnit(fields.amount, from, chip) });
              }}
              onAmount={(amount) => change({ amount })}
              error={errors.amount}
              autoFocus={autoFocus}
            />
          )}
          {(entry.kind === "saved_meal" || entry.kind === "recipe") && (
            <CountField
              id={fieldId("amount")}
              of={entry.kind === "recipe" ? "servings" : "meals"}
              value={fields.amount}
              onChange={(amount) => change({ amount })}
              error={errors.amount}
              autoFocus={autoFocus}
            />
          )}
          {entry.kind === "estimate" && (
            <EstimateFields
              idPrefix={id}
              fields={fields}
              errors={errors}
              onChange={(field, value) => change({ [field]: value })}
              autoFocus={autoFocus}
            />
          )}
          <div data-entry-preview="" className={sectionStart}>
            <p aria-live="polite" className="mb-2 min-h-5 text-sm text-ink-muted">
              {caption}
            </p>
            {/* "Calories", as the estimate's own field and the Day tab's summary say. */}
            <MacroFigures figures={preview} estimate={entry.isEstimate} energyWord="calories" />
            {entry.kind === "recipe" && entry.recipe && (
              // The recipe's page, also for a recipe deleted since: it still opens from its entries.
              <div className="mt-2 flex items-center gap-3">
                <Link
                  href={`/recipes/${entry.recipe.id}`}
                  // With unsaved changes the sheet refuses every way out but Cancel and Save, and this one too.
                  aria-disabled={dirty || undefined}
                  aria-describedby={dirty ? `${id}-open-recipe-why` : undefined}
                  onClick={(e) => {
                    if (dirty) e.preventDefault();
                    else if (isPlainPress(e)) {
                      markOpenedInApp();
                      keepDayPlace(entry.id);
                    }
                  }}
                  data-open-recipe=""
                  className={`${btnText} shrink-0`}
                >
                  {t("openRecipe")}
                </Link>
                {/* Beside the link, so it showing moves nothing in the sheet. */}
                <p id={`${id}-open-recipe-why`} data-open-recipe-why="" className="min-w-0 text-sm text-ink-muted">
                  {dirty ? t("openRecipeWaits") : null}
                </p>
              </div>
            )}
          </div>
          <div>
            <label htmlFor={fieldId("date")} className={labelClass}>
              {t("date")}
            </label>
            <NativeDateInput
              id={fieldId("date")}
              value={fields.date}
              onValueChange={(date) => change({ date })}
              error={dateLine}
              // Why Eaten is unavailable, under the date that makes it so.
              hint={future ? t("futureHint") : null}
            />
          </div>
        </>
      )}
    </FormSheet>
  );
}
