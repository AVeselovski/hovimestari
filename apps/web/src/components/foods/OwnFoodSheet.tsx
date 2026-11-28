"use client";

import { Field } from "@/components/form/Field";
import { focusField } from "@/components/form/focus";
import { DecimalField, decimalLineId } from "@/components/ui/DecimalField";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { btnText, fieldHintClass, sectionStart, sectionTitle } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFormDirty } from "@/hooks/useFormDirty";
import { createFood, updateFood } from "@/lib/api/foods";
import { barcodeOf, sameBarcode } from "@/lib/barcode";
import { getErrorCode } from "@/lib/errors";
import { formatGrams } from "@/lib/foodFormat";
import { afterOwnFoodSaved } from "@/lib/invalidation";
import type { FoodDetail, PortionBody } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";
import { monoDigits } from "./digits";
import {
  markedFields,
  ownFoodFieldOf,
  parseOwnFood,
  savedBaselineOf,
  sharesSumLine,
  startOf,
  type FieldError,
  type OwnFoodErrors,
  type OwnFoodField,
  type OwnFoodStart,
} from "./ownFoodForm";
import { useOwnFoodDelete } from "./useOwnFoodDelete";

// ---------------------------------------------------------------------------
// OwnFoodSheet: add or edit the user's own food. A name, the four values per
// 100 g copied from a label, and an optional barcode. A new food's fields
// open empty with no placeholder, or with its start: the name typed in the
// search, what a barcode lookup or a kept product brought back, or a Fineli
// or Open Food Facts food copied. A start from either adds a line that asks
// to check each value against the label. A copy's portions show last, as a
// list, and are saved with the food.
// An edit's open with what was saved. A value left as it opened saves as the
// figure it came from, under the same checks as a typed one. Stacked on the
// food sheet, or on its own in the Library. Editing adds Delete, which
// asks first.
//
// While the food search carries a barcode from a miss (`carried`), a new
// food opens with it in the barcode field, over the start's own. An edit
// never takes it unasked: Use barcode {code} under the field fills it in,
// and shows while the field holds another code or none.
//
// It stands tall, so its top and Save hold still. Every field keeps two
// lines of room under it, the longest line it can show at 320 pixels wide,
// so an error moves no field below it. The four values sit beside their
// labels, one row each, which keeps the form short on a small phone. A
// refusal of the macros' sum shows under Fat and marks Protein,
// Carbohydrates and Fat, which all read that one line.
// ---------------------------------------------------------------------------

/** What the sheet opens on: a food to edit, or what a new one starts from, if anything. */
export type OwnFoodTarget = { food: FoodDetail; start?: never } | { food?: undefined; start?: OwnFoodStart };

export type OwnFoodSheetProps = FormSheetCallerProps &
  OwnFoodTarget &
  OwnFoodSheetCallbacks & {
    /** The barcode the food search carries from a miss, if any. */
    carried?: string;
  };

interface OwnFoodSheetCallbacks {
  /** The save worked: the food as the server answered it. Called before `onSaved`. */
  onSavedFood?: (food: FoodDetail) => void;
  /**
   * The food was deleted, or was gone already, and the lists have dropped it.
   * This sheet has closed itself. The caller leaves the food's detail.
   */
  onDeleted?: (id: string) => void;
  /**
   * Where focus goes after a delete, read while the opener is still on the
   * page: a control that stays, such as the next row. Default: none, and the
   * sheet underneath takes it.
   */
  focusAfterDelete?: () => HTMLElement | null;
  /**
   * A save found the food gone, deleted on another device. The caller closes
   * this sheet, leaves the food's detail and refreshes the food reads.
   */
  onFoodGone?: (id: string) => void;
}

const VALUE_ROWS = [
  { field: "energy", unit: "kcal" },
  { field: "protein", unit: "grams" },
  { field: "carbs", unit: "grams" },
  { field: "fat", unit: "grams" },
] as const;

type T = ReturnType<typeof useTranslations<"foods.ownFood">>;

function valueLabel(t: T, field: (typeof VALUE_ROWS)[number]["field"]): string {
  switch (field) {
    case "energy":
      return t("energy");
    case "protein":
      return t("protein");
    case "carbs":
      return t("carbs");
    case "fat":
      return t("fat");
  }
}

export function OwnFoodSheet({
  open,
  returnFocusTo,
  onClose,
  onSaved,
  food,
  start,
  onSavedFood,
  onDeleted,
  focusAfterDelete,
  onFoodGone,
  carried,
}: OwnFoodSheetProps): ReactElement {
  const t = useTranslations("foods.ownFood");
  const tCommon = useTranslations("common");
  const errors = useErrorCopy();
  const client = useQueryClient();
  const id = useId();
  const fieldId = (field: OwnFoodField) => `${id}-${field}`;

  // What the form opened on. Fixed for the sheet's open: the host keys the sheet per open.
  const [baseline] = useState(() =>
    food ? savedBaselineOf(food) : startOf(carried === undefined ? start : { ...start, barcode: carried }),
  );
  const from = food ? undefined : start?.from;
  // A copy says whose values it opens with, in place of asking to copy them from the label.
  const copied = food === undefined && start?.copied === true;
  const portions = food ? [] : (start?.portions ?? []);
  const [values, setValues] = useState(() => baseline.values);
  const [fieldErrors, setFieldErrors] = useState<OwnFoodErrors>({});
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { dirty } = useFormDirty(JSON.stringify(values), true);

  const remove = useOwnFoodDelete<FoodDetail>({
    onDone: (f) => {
      onClose();
      onDeleted?.(f.id);
    },
    focusAfter: () => focusAfterDelete?.() ?? null,
  });

  const lineOf = (error: FieldError | undefined): string | null =>
    error === undefined ? null : error === "digit_group" ? tCommon("digitGroup") : errors.forCode(error);

  function change(field: OwnFoodField, raw: string): void {
    setValues((prev) => ({ ...prev, [field]: raw }));
  }

  /** Shows the errors and focuses the first field they mark. */
  function refuse(next: OwnFoodErrors): void {
    setFieldErrors(next);
    focusField(fieldId(markedFields(next)[0] ?? "name"));
  }

  const marked = markedFields(fieldErrors);

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    const parsed = parseOwnFood(values, baseline);
    if (!parsed.ok) {
      refuse(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    let answered: FoodDetail;
    try {
      answered = food
        ? await updateFood(food.id, parsed.body)
        : await createFood(portions.length > 0 ? { ...parsed.body, portions } : parsed.body);
    } catch (err) {
      const code = getErrorCode(err);
      if (code === "food_not_found" && food) {
        setSubmitting(false);
        onFoodGone?.(food.id);
        return;
      }
      const field = ownFoodFieldOf(code);
      if (field && code) {
        refuse({ [field]: code });
      } else {
        setFormError({ line: errors.forError(err), cause: err });
      }
      setSubmitting(false);
      return;
    }
    const change = !food ? "added" : answered.name !== food.name ? "renamed" : "edited";
    void afterOwnFoodSaved(client, answered, change);
    // Still busy: the sheet slides out showing what was on screen.
    onSavedFood?.(answered);
    onSaved?.();
    onClose();
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={food ? t("titleEdit") : t("titleAdd")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={submitting}
      onSubmit={handleSubmit}
      formError={formError}
      idle={t("save")}
      busy={t("saving")}
      sheet={{ stacked: remove.dialog }}
      footerStart={food ? { label: t("delete"), onPress: (opener) => remove.open(food, opener) } : undefined}
    >
      {({ autoFocus }) => (
        <>
          <Field
            id={fieldId("name")}
            name="food-name"
            label={t("name")}
            type="text"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="next"
            value={values.name}
            onChange={(e) => change("name", e.target.value)}
            error={lineOf(fieldErrors.name)}
            autoFocus={autoFocus}
          />
          <fieldset
            aria-describedby={[copied ? null : `${id}-hint`, from ? `${id}-note` : null].filter(Boolean).join(" ")}
            className={`${sectionStart} min-w-0 border-0 p-0`}
          >
            <legend className={`${sectionTitle} p-0`}>{t("per100g")}</legend>
            <div className={`${fieldHintClass} mt-1 mb-3 space-y-1`}>
              {!copied && <p id={`${id}-hint`}>{t("hint")}</p>}
              {from && <p id={`${id}-note`}>{from === "fineli" ? t("checkFineli") : t("checkProduct")}</p>}
            </div>
            <div className="space-y-2">
              {VALUE_ROWS.map(({ field, unit }) => (
                <DecimalField
                  key={field}
                  id={fieldId(field)}
                  name={`food-${field}`}
                  label={valueLabel(t, field)}
                  unit={unit === "kcal" ? t("kcal") : t("grams")}
                  inputMode="decimal"
                  value={values[field]}
                  onValueChange={(raw) => change(field, raw)}
                  invalid={marked.includes(field)}
                  describedBy={sharesSumLine(field, fieldErrors) ? decimalLineId(fieldId("fat")) : undefined}
                  line={lineOf(fieldErrors[field])}
                  layout="beside"
                />
              ))}
            </div>
          </fieldset>
          <Field
            id={fieldId("barcode")}
            name="food-barcode"
            label={t("barcode")}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            value={values.barcode}
            onChange={(e) => change("barcode", e.target.value)}
            error={lineOf(fieldErrors.barcode)}
          />
          {carried !== undefined && !sameBarcode(barcodeOf(values.barcode.trim()), carried) && (
            <div>
              <button
                type="button"
                onClick={() => {
                  change("barcode", carried);
                  // The button goes with the press: focus stays with the barcode, in its field.
                  document.getElementById(fieldId("barcode"))?.focus({ preventScroll: true });
                }}
                className={btnText}
              >
                {/* One span, so the flex row keeps the space before the digits. */}
                <span>
                  {t.rich("useCarried", {
                    code: carried,
                    digits: monoDigits,
                  })}
                </span>
              </button>
            </div>
          )}
          {portions.length > 0 && <StartPortions portions={portions} />}
        </>
      )}
    </FormSheet>
  );
}

/** The portions a new food comes with, read-only, last in the form. They are the person's to change once saved. */
function StartPortions({ portions }: { portions: PortionBody[] }): ReactElement {
  const t = useTranslations("foods.ownFood");
  const tDetail = useTranslations("foods.detail");
  const titleId = `${useId()}-portions`;
  return (
    <section aria-labelledby={titleId} className={sectionStart}>
      <h3 id={titleId} className={`${sectionTitle} p-0`}>
        {tDetail("portions")}
      </h3>
      <p className={`${fieldHintClass} mt-1 mb-2`}>{t("portionsHint")}</p>
      <ul className="divide-y divide-rule border-y border-rule">
        {portions.map((portion, i) => (
          <li key={`${i}-${portion.name}`} className="flex min-h-12 items-center gap-3 py-2">
            <span className="min-w-0 flex-1 text-base break-words text-ink">{portion.name}</span>
            <span className="font-mono text-base text-ink tabular-nums">
              {tDetail("grams", { value: formatGrams(portion.grams) })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
