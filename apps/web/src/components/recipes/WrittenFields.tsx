"use client";

import { SelectField } from "@/components/ui/SelectField";
import { fieldErrorClass, fieldHintClass, inputClass, labelClass, lineRoom } from "@/components/ui/styles";
import { parseDecimalInput } from "@/lib/decimalInput";
import { formatCount } from "@/lib/entryFormat";
import { INGREDIENT_UNITS, WrittenAmountSchema, type ErrorCode, type IngredientUnit } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { DraftWritten } from "./recipeDraft";

// ---------------------------------------------------------------------------
// WrittenFields: a line's amount as the recipe writes it, for the recipe's
// text beside the grams: "2 cloves", "1 can". An amount and a unit from the
// fixed list, side by side, both optional, but one needs the other. One line
// under them holds the hint, or the refusal in its place. The unit is the
// platform's own select.
// ---------------------------------------------------------------------------

/** The two fields as typed. */
export interface WrittenFieldValues {
  amount: string;
  /** A unit, or "" for none chosen. */
  unit: IngredientUnit | "";
}

export function writtenFieldsOf(written: DraftWritten | null): WrittenFieldValues {
  return written ? { amount: formatCount(written.amount, "en"), unit: written.unit } : { amount: "", unit: "" };
}

/** Both empty is none. Both filled is the written amount, checked as the server checks it. One alone is refused. */
export function readWritten(
  values: WrittenFieldValues,
): { ok: true; value: DraftWritten | null } | { ok: false; error: ErrorCode } {
  const typed = values.amount.trim();
  if (typed === "" && values.unit === "") return { ok: true, value: null };
  const parsed = parseDecimalInput(typed, { maxDecimals: 2 });
  if (parsed.kind !== "number" || values.unit === "") return { ok: false, error: "written_amount_invalid" };
  const checked = WrittenAmountSchema.safeParse({ amount: parsed.value, unit: values.unit });
  return checked.success ? { ok: true, value: checked.data } : { ok: false, error: "written_amount_invalid" };
}

export function WrittenFields({
  idPrefix,
  values,
  error,
  onChange,
}: {
  idPrefix: string;
  values: WrittenFieldValues;
  /** The refusal, in place of the hint. */
  error: string | null;
  onChange: (values: WrittenFieldValues) => void;
}): ReactElement {
  const t = useTranslations("recipes.picker");
  const tUnits = useTranslations("recipes.unitNames");
  const lineId = `${idPrefix}-written-line`;
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={lineId}>
      <legend className={labelClass}>{t("written")}</legend>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-written-amount`} className="mb-1 block text-sm text-ink-muted">
            {t("writtenAmount")}
          </label>
          <input
            id={`${idPrefix}-written-amount`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            value={values.amount}
            onChange={(e) => onChange({ ...values, amount: e.target.value })}
            aria-invalid={error !== null || undefined}
            aria-describedby={lineId}
            className={`${inputClass} font-mono tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-written-unit`} className="mb-1 block text-sm text-ink-muted">
            {t("writtenUnit")}
          </label>
          <SelectField
            id={`${idPrefix}-written-unit`}
            value={values.unit}
            onChange={(e) => onChange({ ...values, unit: e.target.value as IngredientUnit | "" })}
            aria-invalid={error !== null || undefined}
            aria-describedby={lineId}
          >
            <option value="">{t("noUnit")}</option>
            {INGREDIENT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {tUnits(unit)}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      <p id={lineId} className={`${error ? fieldErrorClass : fieldHintClass} ${lineRoom}`}>
        {error ?? t("writtenHint")}
      </p>
    </fieldset>
  );
}
