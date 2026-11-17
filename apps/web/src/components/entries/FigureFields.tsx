"use client";

import { DecimalField } from "@/components/ui/DecimalField";
import { fieldErrorClass, fieldHintClass, lineRoom } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { EntryFieldError } from "./amount";
import type { FigureField } from "./entryForm";

// ---------------------------------------------------------------------------
// FigureFields: four typed figures, an estimate's or a saved meal's, as a
// two by two grid at every width, Calories and Protein, then Carbohydrates
// and Fat, so each column has room for a value such as 1234,5 in full. Each
// field has its unit inside it. Tab and Enter follow that order.
//
// The four share one line under the grid, with its room always kept, so a
// refusal moves nothing below it. The longest refusal a figure can show, the
// thousands line, is two lines across the grid at 320 pixels wide and one
// from `md`, so the room is two lines on a phone and one from `md`.
// The line says the first refused field's reason, in that order, and every
// refused field is marked and described by it. While nothing is refused it
// may hold a hint, such as where the figures come from, and then describes
// every field. A field with a line of its own would need five lines of room
// in a half-width column.
// ---------------------------------------------------------------------------

export interface FigureFieldsProps {
  /** The id prefix every field's id starts with: `${idPrefix}-energy` and so on. */
  idPrefix: string;
  values: Record<FigureField, string>;
  errors: Partial<Record<FigureField, EntryFieldError>>;
  onChange: (field: FigureField, value: string) => void;
  /** What the shared line says while no figure is refused. */
  hint?: string;
}

const ORDER: readonly FigureField[] = ["energy", "protein", "carbs", "fat"];

/** A figure field's id, for focusing it. */
export function figureFieldId(idPrefix: string, field: FigureField): string {
  return `${idPrefix}-${field}`;
}

export function FigureFields({ idPrefix, values, errors, onChange, hint }: FigureFieldsProps): ReactElement {
  const t = useTranslations("entries.estimate");
  const tCommon = useTranslations("common");
  const errorCopy = useErrorCopy();
  const lineOf = (e: EntryFieldError) => (e === "digit_group" ? tCommon("digitGroup") : errorCopy.forCode(e));
  const labels: Record<FigureField, { label: string; unit: string }> = {
    energy: { label: t("energy"), unit: t("kcal") },
    protein: { label: t("protein"), unit: t("grams") },
    carbs: { label: t("carbs"), unit: t("grams") },
    fat: { label: t("fat"), unit: t("grams") },
  };
  const lineId = `${idPrefix}-figures-line`;
  const first = ORDER.find((f) => errors[f] !== undefined);
  return (
    <div data-figure-fields="">
      <div className="grid grid-cols-2 gap-3">
        {ORDER.map((field) => (
          <DecimalField
            key={field}
            id={figureFieldId(idPrefix, field)}
            name={field}
            label={labels[field].label}
            unit={labels[field].unit}
            inputMode="decimal"
            value={values[field]}
            onValueChange={(raw) => onChange(field, raw)}
            invalid={errors[field] !== undefined}
            describedBy={
              errors[field] !== undefined || (first === undefined && hint !== undefined) ? lineId : undefined
            }
          />
        ))}
      </div>
      <p id={lineId} className={`${first ? fieldErrorClass : fieldHintClass} ${lineRoom(2, 1)}`}>
        {first ? lineOf(errors[first]!) : (hint ?? null)}
      </p>
    </div>
  );
}
