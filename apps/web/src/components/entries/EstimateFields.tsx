"use client";

import { Field } from "@/components/form/Field";
import { pairRow } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import type { EntryFieldErrors, EntryFields } from "./entryForm";
import { FigureFields, figureFieldId } from "./FigureFields";

// ---------------------------------------------------------------------------
// EstimateFields: an estimate's name, its four figures and its note. The
// name and the note take the full width, each with one line of room under
// it, the longest line either shows at 320 pixels. The figures are a two by
// two grid with a shared line (`FigureFields`). Shared by the entry sheet and
// the log sheet's estimate sheet. What a caller passes as `besideName` shares
// the name's row from `md`: the estimate sheet's Eaten or planned, so its
// dialog shows the whole form on a laptop.
// ---------------------------------------------------------------------------

export type EstimateField = "name" | "energy" | "protein" | "carbs" | "fat" | "note";

export interface EstimateFieldsProps {
  /** The id prefix every field's id starts with. */
  idPrefix: string;
  fields: Pick<EntryFields, EstimateField>;
  errors: EntryFieldErrors;
  onChange: (field: EstimateField, value: string) => void;
  autoFocus: boolean;
  /** Shown before the name, and in the name's row from `md`. */
  besideName?: ReactNode;
}

/** A field's id, for focusing the first invalid one. */
export function estimateFieldId(idPrefix: string, field: EstimateField): string {
  return field === "name" || field === "note" ? `${idPrefix}-${field}` : figureFieldId(idPrefix, field);
}

export function EstimateFields({
  idPrefix,
  fields,
  errors,
  onChange,
  autoFocus,
  besideName,
}: EstimateFieldsProps): ReactElement {
  const t = useTranslations("entries.estimate");
  const errorCopy = useErrorCopy();
  const lineOf = (field: "name" | "note") => (errors[field] === undefined ? null : errorCopy.forCode(errors[field]));
  const name = (
    <Field
      id={estimateFieldId(idPrefix, "name")}
      name="name"
      label={t("name")}
      autoComplete="off"
      enterKeyHint="next"
      autoFocus={autoFocus}
      value={fields.name}
      onChange={(e) => onChange("name", e.target.value)}
      onKeyDown={(e) => {
        // Enter moves on to Calories rather than submitting a half-filled form.
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        e.preventDefault();
        document.getElementById(figureFieldId(idPrefix, "energy"))?.focus();
      }}
      error={lineOf("name")}
    />
  );
  return (
    <>
      {besideName === undefined ? (
        name
      ) : (
        <div className={pairRow}>
          {besideName}
          {name}
        </div>
      )}
      <FigureFields idPrefix={idPrefix} values={fields} errors={errors} onChange={onChange} />
      <Field
        id={estimateFieldId(idPrefix, "note")}
        name="note"
        label={t("note")}
        autoComplete="off"
        value={fields.note}
        onChange={(e) => onChange("note", e.target.value)}
        error={lineOf("note")}
      />
    </>
  );
}
