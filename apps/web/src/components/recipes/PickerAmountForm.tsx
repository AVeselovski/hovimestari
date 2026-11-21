"use client";

import { GRAMS, switchUnit, type EntryFieldError, type UnitChip } from "@/components/entries/amount";
import { AmountField } from "@/components/entries/AmountField";
import { Field } from "@/components/form/Field";
import { AmountFigures } from "@/components/log/AmountFigures";
import { btnText } from "@/components/ui/styles";
import type { Figures } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { WrittenFields, type WrittenFieldValues, type WrittenRefusal } from "./WrittenFields";

// ---------------------------------------------------------------------------
// PickerAmountForm: the ingredient picker's amount view, under its header.
// Change food, then the amount (`AmountField`: grams, or a count of one of
// the food's portions), "For this amount" and its figures, then As written
// and Note. While the amount is in grams its line says how to weigh it. The
// picker holds the fields and reads them on submit.
// ---------------------------------------------------------------------------

/** The amount view's fields, as typed. */
export interface AmountFields {
  unit: string;
  amount: string;
  written: WrittenFieldValues;
  note: string;
}

/** What a submit refused, by field. */
export interface AmountErrors {
  amount?: EntryFieldError;
  written?: WrittenRefusal;
  note?: string;
}

export function PickerAmountForm({
  id,
  formId,
  fieldId,
  fields,
  errors,
  chips,
  unit,
  chip,
  preview,
  autoFocus,
  onFields,
  onErrors,
  onChangeFood,
  onSubmit,
}: {
  id: string;
  formId: string;
  fieldId: string;
  fields: AmountFields;
  errors: AmountErrors;
  chips: readonly UnitChip[];
  /** The chip chosen, by id, and the chip itself. */
  unit: string;
  chip: UnitChip;
  /** The figures for the amount typed, or null. */
  preview: Figures | null;
  autoFocus: boolean;
  onFields: (edit: (fields: AmountFields) => AmountFields) => void;
  onErrors: (edit: (errors: AmountErrors) => AmountErrors) => void;
  onChangeFood: () => void;
  onSubmit: () => void;
}): ReactElement {
  const t = useTranslations("recipes.picker");
  return (
    <form
      id={formId}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
      data-picker-amount=""
    >
      <div>
        <button type="button" onClick={onChangeFood} className={btnText}>
          {t("changeFood")}
        </button>
      </div>
      <AmountField
        id={fieldId}
        chips={chips}
        unit={unit}
        amount={fields.amount}
        onUnit={(next) => onFields((f) => ({ ...f, unit: next.id, amount: switchUnit(f.amount, chip, next) }))}
        onAmount={(raw) => {
          onFields((f) => ({ ...f, amount: raw }));
          onErrors((e) => ({ ...e, amount: undefined }));
        }}
        error={errors.amount}
        autoFocus={autoFocus}
        layout="beside"
        // A count of a portion is not weighed.
        hint={unit === GRAMS ? t("amountHint") : undefined}
      />
      <AmountFigures preview={preview} empty={fields.amount.trim() === ""} />
      <WrittenFields
        idPrefix={id}
        values={fields.written}
        refusal={errors.written ?? null}
        onChange={(written) => {
          onFields((f) => ({ ...f, written }));
          onErrors((e) => ({ ...e, written: undefined }));
        }}
      />
      <Field
        id={`${id}-note`}
        name="note"
        label={t("note")}
        hint={t("noteHint")}
        error={errors.note ?? null}
        autoComplete="off"
        value={fields.note}
        onChange={(e) => {
          onFields((f) => ({ ...f, note: e.target.value }));
          onErrors((er) => ({ ...er, note: undefined }));
        }}
      />
    </form>
  );
}
