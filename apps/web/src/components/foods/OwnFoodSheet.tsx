"use client";

import { Field } from "@/components/form/Field";
import { focusField } from "@/components/form/focus";
import { DecimalField } from "@/components/ui/DecimalField";
import { FormSheet, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { fieldHintClass, sectionTitle } from "@/components/ui/styles";
import { useConfirmedDelete } from "@/hooks/useConfirmedDelete";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFormDirty } from "@/hooks/useFormDirty";
import { createFood, deleteFood, updateFood } from "@/lib/api/foods";
import { getErrorCode } from "@/lib/errors";
import { afterOwnFoodSaved } from "@/lib/invalidation";
import type { FoodDetail } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type ReactElement } from "react";
import {
  OWN_FOOD_FIELDS,
  emptyOwnFood,
  ownFoodFieldOf,
  ownFoodValuesOf,
  parseOwnFood,
  type FieldError,
  type OwnFoodErrors,
  type OwnFoodField,
} from "./ownFoodForm";

// ---------------------------------------------------------------------------
// OwnFoodSheet: add or edit the user's own food. A name, the four values per
// 100 g copied from a label, and an optional barcode. A new food's fields
// open empty with no placeholder (its name may come from the search typed),
// an edit's with what was saved. Stacked on the food sheet. Editing adds
// Delete, which asks first.
//
// It stands tall, so its top and Save hold still. Every field keeps two
// lines of room under it, the longest line it can show at 320 pixels wide,
// so an error moves no field below it. The four values sit beside their
// labels, one row each, which keeps the form short on a small phone.
// ---------------------------------------------------------------------------

export interface OwnFoodSheetProps extends FormSheetCallerProps {
  /** The food to edit. Left out, the sheet adds one. */
  food?: FoodDetail;
  /** A new food's name, as the search typed it. */
  initialName?: string;
  /** The save worked: the food as the server answered it. Called before `onSaved`. */
  onSavedFood?: (food: FoodDetail) => void;
  /**
   * The food was deleted, or was gone already. The caller closes this sheet,
   * leaves the food's detail and refreshes the food reads.
   */
  onDeleted?: (id: string) => void;
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
  initialName = "",
  onSavedFood,
  onDeleted,
  onFoodGone,
}: OwnFoodSheetProps): ReactElement {
  const t = useTranslations("foods.ownFood");
  const tDetail = useTranslations("foods.detail");
  const tCommon = useTranslations("common");
  const errors = useErrorCopy();
  const client = useQueryClient();
  const id = useId();
  const fieldId = (field: OwnFoodField) => `${id}-${field}`;

  const saved = useMemo(() => (food ? { values: ownFoodValuesOf(food), per100g: food.per100g } : undefined), [food]);
  const [values, setValues] = useState(() => saved?.values ?? emptyOwnFood(initialName));
  const [fieldErrors, setFieldErrors] = useState<OwnFoodErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { dirty } = useFormDirty(JSON.stringify(values), true);

  const remove = useConfirmedDelete<FoodDetail>({
    copy: (f) => ({ title: tDetail("deleteTitle", { name: f.name }), message: tDetail("deleteBody") }),
    // Gone already, deleted on another device: what the user asked for is true.
    run: (f) =>
      deleteFood(f.id).catch((err: unknown) => {
        if (getErrorCode(err) !== "food_not_found") throw err;
      }),
    onDone: (_result, f) => onDeleted?.(f.id),
    focusAfter: () => null,
  });

  const lineOf = (error: FieldError | undefined): string | null =>
    error === undefined ? null : error === "digit_group" ? tCommon("digitGroup") : errors.forCode(error);

  function change(field: OwnFoodField, raw: string): void {
    setValues((prev) => ({ ...prev, [field]: raw }));
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    const parsed = parseOwnFood(values, saved);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      focusField(fieldId(OWN_FOOD_FIELDS.find((f) => parsed.errors[f] !== undefined) ?? "name"));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    let answered: FoodDetail;
    try {
      answered = food ? await updateFood(food.id, parsed.body) : await createFood(parsed.body);
    } catch (err) {
      const code = getErrorCode(err);
      if (code === "food_not_found" && food) {
        setSubmitting(false);
        onFoodGone?.(food.id);
        return;
      }
      const field = ownFoodFieldOf(code);
      if (field && code) {
        setFieldErrors({ [field]: code });
        focusField(fieldId(field));
      } else {
        setFormError(errors.forError(err));
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
      sheet={{ size: "tall", stacked: remove.dialog }}
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
            lineRows={2}
            autoFocus={autoFocus}
          />
          <fieldset aria-describedby={`${id}-hint`} className="m-0 min-w-0 border-0 p-0">
            <legend className={`${sectionTitle} p-0`}>{t("per100g")}</legend>
            <p id={`${id}-hint`} className={`${fieldHintClass} mt-1 mb-3`}>
              {t("hint")}
            </p>
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
                  invalid={fieldErrors[field] !== undefined}
                  line={lineOf(fieldErrors[field])}
                  lineRows={2}
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
            lineRows={2}
          />
        </>
      )}
    </FormSheet>
  );
}
