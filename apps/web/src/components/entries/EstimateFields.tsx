"use client";

import { Field } from "@/components/form/Field";
import { DecimalField } from "@/components/ui/DecimalField";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { EntryFieldError } from "./amount";
import type { EntryFieldErrors, EntryFields } from "./entryForm";

// ---------------------------------------------------------------------------
// EstimateFields: an estimate's name, its four figures and its note. Each
// field keeps two lines of room under it, since a digit-group refusal and
// the figure range line wrap at 320 pixels, so an error moves nothing below.
// Shared by the entry sheet and, with the log sheet, the estimate sheet.
// ---------------------------------------------------------------------------

export type EstimateField = "name" | "energy" | "protein" | "carbs" | "fat" | "note";

export interface EstimateFieldsProps {
  /** The id prefix every field's id starts with. */
  idPrefix: string;
  fields: Pick<EntryFields, EstimateField>;
  errors: EntryFieldErrors;
  onChange: (field: EstimateField, value: string) => void;
  autoFocus: boolean;
}

/** A field's id, for focusing the first invalid one. */
export function estimateFieldId(idPrefix: string, field: EstimateField): string {
  return `${idPrefix}-${field}`;
}

export function EstimateFields({ idPrefix, fields, errors, onChange, autoFocus }: EstimateFieldsProps): ReactElement {
  const t = useTranslations("entries.estimate");
  const tCommon = useTranslations("common");
  const errorCopy = useErrorCopy();
  const lineOf = (e: EntryFieldError | undefined) =>
    e === undefined ? null : e === "digit_group" ? tCommon("digitGroup") : errorCopy.forCode(e);
  const figures = [
    { field: "energy", label: t("energy"), unit: t("kcal") },
    { field: "protein", label: t("protein"), unit: t("grams") },
    { field: "carbs", label: t("carbs"), unit: t("grams") },
    { field: "fat", label: t("fat"), unit: t("grams") },
  ] as const;
  return (
    <>
      <Field
        id={estimateFieldId(idPrefix, "name")}
        name="name"
        label={t("name")}
        autoComplete="off"
        enterKeyHint="next"
        autoFocus={autoFocus}
        value={fields.name}
        onChange={(e) => onChange("name", e.target.value)}
        error={lineOf(errors.name)}
        lineRows={2}
      />
      {figures.map(({ field, label, unit }) => (
        <DecimalField
          key={field}
          id={estimateFieldId(idPrefix, field)}
          name={field}
          label={label}
          unit={unit}
          inputMode="decimal"
          value={fields[field]}
          onValueChange={(raw) => onChange(field, raw)}
          invalid={errors[field] !== undefined}
          line={lineOf(errors[field])}
          lineRows={2}
        />
      ))}
      <Field
        id={estimateFieldId(idPrefix, "note")}
        name="note"
        label={t("note")}
        autoComplete="off"
        value={fields.note}
        onChange={(e) => onChange("note", e.target.value)}
        error={lineOf(errors.note)}
        lineRows={2}
      />
    </>
  );
}
