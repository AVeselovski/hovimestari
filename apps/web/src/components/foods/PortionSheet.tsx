"use client";

import { Field } from "@/components/form/Field";
import { focusField } from "@/components/form/focus";
import { DecimalField } from "@/components/ui/DecimalField";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { useConfirmedDelete } from "@/hooks/useConfirmedDelete";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFormDirty } from "@/hooks/useFormDirty";
import { addPortion, deletePortion, updatePortion } from "@/lib/api/foods";
import { getErrorCode } from "@/lib/errors";
import { afterPortionDeleted, afterPortionSaved } from "@/lib/invalidation";
import type { Portion } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";
import {
  EMPTY_PORTION,
  parsePortion,
  portionValuesOf,
  type FieldError,
  type PortionErrors,
  type PortionField,
} from "./ownFoodForm";

// ---------------------------------------------------------------------------
// PortionSheet: add or edit the user's own portion of a food, a name and a
// weight in grams. Stacked on the food sheet. Editing adds Delete, which asks
// first. Each field keeps two lines of room under it, so the short sheet's
// top holds still when an error wraps.
// ---------------------------------------------------------------------------

export interface PortionSheetProps extends FormSheetCallerProps {
  foodId: string;
  /** The user's own portion to edit. Left out, the sheet adds one. */
  portion?: Portion;
  /** The portion was deleted. The caller closes this sheet. */
  onDeleted?: () => void;
  /**
   * The food was found gone, deleted on another device. The caller closes
   * this sheet, leaves the food's detail and refreshes the food reads.
   */
  onFoodGone?: (foodId: string) => void;
  /** Where focus goes once a delete has worked, since the portion's row leaves the detail. */
  focusAfterDelete?: () => HTMLElement | null;
}

export function PortionSheet({
  open,
  returnFocusTo,
  onClose,
  onSaved,
  foodId,
  portion,
  onDeleted,
  onFoodGone,
  focusAfterDelete,
}: PortionSheetProps): ReactElement {
  const t = useTranslations("foods.portion");
  const tCommon = useTranslations("common");
  const errors = useErrorCopy();
  const client = useQueryClient();
  const id = useId();
  const fieldId = (field: PortionField) => `${id}-${field}`;

  const [values, setValues] = useState(() => (portion ? portionValuesOf(portion) : EMPTY_PORTION));
  const [fieldErrors, setFieldErrors] = useState<PortionErrors>({});
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { dirty } = useFormDirty(JSON.stringify(values), true);

  const remove = useConfirmedDelete<Portion>({
    copy: (p) => ({ title: t("deleteTitle"), message: t("deleteBody", { portion: p.name ?? "" }) }),
    // A portion gone already, deleted on another device, is what the user asked for.
    run: (p) =>
      deletePortion(foodId, p.id).catch((err: unknown) => {
        if (getErrorCode(err) !== "portion_not_found") throw err;
      }),
    onDone: (_result, p) => {
      void afterPortionDeleted(client, foodId, p.id);
      onDeleted?.();
    },
    onError: (err) => {
      if (getErrorCode(err) === "food_not_found") onFoodGone?.(foodId);
    },
    // The portion's row leaves the detail: focus goes to Add a portion there.
    focusAfter: () => focusAfterDelete?.() ?? null,
  });

  const lineOf = (error: FieldError | undefined): string | null =>
    error === undefined ? null : error === "digit_group" ? tCommon("digitGroup") : errors.forCode(error);

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    const parsed = parsePortion(values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      focusField(fieldId(parsed.errors.name !== undefined ? "name" : "grams"));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    let answered: Portion;
    try {
      answered = portion ? await updatePortion(foodId, portion.id, parsed.body) : await addPortion(foodId, parsed.body);
    } catch (err) {
      const code = getErrorCode(err);
      if (code === "food_not_found") {
        setSubmitting(false);
        onFoodGone?.(foodId);
        return;
      }
      if (code === "portion_name_required" || code === "portion_name_too_long") {
        setFieldErrors({ name: code });
        focusField(fieldId("name"));
      } else if (code === "portion_grams_invalid") {
        setFieldErrors({ grams: code });
        focusField(fieldId("grams"));
      } else {
        setFormError({ line: errors.forError(err), cause: err });
      }
      // Deleted on another device: it leaves the detail.
      if (code === "portion_not_found" && portion) void afterPortionDeleted(client, foodId, portion.id);
      setSubmitting(false);
      return;
    }
    void afterPortionSaved(client, foodId, answered);
    // Still busy: the sheet slides out showing what was on screen.
    onSaved?.();
    onClose();
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={portion ? t("titleEdit") : t("titleAdd")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={submitting}
      onSubmit={handleSubmit}
      formError={formError}
      idle={t("save")}
      busy={t("saving")}
      sheet={{ stacked: remove.dialog }}
      footerStart={portion ? { label: t("delete"), onPress: (opener) => remove.open(portion, opener) } : undefined}
    >
      {({ autoFocus }) => (
        <>
          <Field
            id={fieldId("name")}
            name="portion-name"
            label={t("name")}
            type="text"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="next"
            value={values.name}
            onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
            error={lineOf(fieldErrors.name)}
            autoFocus={autoFocus}
          />
          <DecimalField
            id={fieldId("grams")}
            name="portion-grams"
            label={t("weight")}
            unit={t("grams")}
            inputMode="decimal"
            enterKeyHint="done"
            value={values.grams}
            onValueChange={(raw) => setValues((prev) => ({ ...prev, grams: raw }))}
            invalid={fieldErrors.grams !== undefined}
            line={lineOf(fieldErrors.grams)}
          />
        </>
      )}
    </FormSheet>
  );
}
