"use client";

import { SelectField } from "@/components/ui/SelectField";
import {
  fieldErrorClass,
  fieldHintClass,
  inputClass,
  labelClass,
  lineRoom,
  pairRowAlways,
  subLabelClass,
} from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { parseDecimalInput } from "@/lib/decimalInput";
import { formatCount } from "@/lib/entryFormat";
import { INGREDIENT_UNITS, WrittenAmountSchema, type IngredientUnit } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { DraftWritten } from "./recipeDraft";

// ---------------------------------------------------------------------------
// WrittenFields: a line's amount as the recipe writes it, for the recipe's
// text beside the grams: "2 cloves", "1 can". A number and a unit from the
// fixed list, side by side, both optional, but one needs the other. One line
// under them holds the hint, or the refusal in its place, which says which
// of the two is wrong: a number that cannot be read, or a number with no
// unit. Only that field is marked. The unit is the platform's own select.
// ---------------------------------------------------------------------------

/** The two fields as typed. */
export interface WrittenFieldValues {
  amount: string;
  /** A unit, or "" for none chosen. */
  unit: IngredientUnit | "";
}

/** Which of the two fields a refusal is about. */
export type WrittenRefusal = "amount" | "unit";

export function writtenFieldsOf(written: DraftWritten | null): WrittenFieldValues {
  return written ? { amount: formatCount(written.amount, "en"), unit: written.unit } : { amount: "", unit: "" };
}

/**
 * Both empty is none. Both filled is the written amount, checked as the
 * server checks it. A number that reads with no unit chosen is refused at
 * the unit, anything else at the number.
 */
export function readWritten(
  values: WrittenFieldValues,
): { ok: true; value: DraftWritten | null } | { ok: false; refusal: WrittenRefusal } {
  const typed = values.amount.trim();
  if (typed === "" && values.unit === "") return { ok: true, value: null };
  const parsed = parseDecimalInput(typed, { maxDecimals: 2 });
  if (parsed.kind !== "number") return { ok: false, refusal: "amount" };
  if (values.unit === "") return { ok: false, refusal: "unit" };
  const checked = WrittenAmountSchema.safeParse({ amount: parsed.value, unit: values.unit });
  return checked.success ? { ok: true, value: checked.data } : { ok: false, refusal: "amount" };
}

export function WrittenFields({
  idPrefix,
  values,
  refusal,
  onChange,
}: {
  idPrefix: string;
  values: WrittenFieldValues;
  /** What is refused, said in place of the hint. */
  refusal: WrittenRefusal | null;
  onChange: (values: WrittenFieldValues) => void;
}): ReactElement {
  const t = useTranslations("recipes.picker");
  const tUnits = useTranslations("recipes.unitNames");
  const errorCopy = useErrorCopy();
  const lineId = `${idPrefix}-written-line`;
  const error =
    refusal === "unit"
      ? t("writtenUnitMissing")
      : refusal === "amount"
        ? errorCopy.forCode("written_amount_invalid")
        : null;
  return (
    // A group, not a fieldset: a fieldset keeps margins and a minimum width of its own inside a stack.
    <div role="group" aria-labelledby={`${idPrefix}-written-title`} aria-describedby={lineId} data-written-fields="">
      <p id={`${idPrefix}-written-title`} className={labelClass}>
        {t("written")}
      </p>
      <div className={pairRowAlways}>
        <div>
          <label htmlFor={`${idPrefix}-written-amount`} className={subLabelClass}>
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
            aria-invalid={refusal === "amount" || undefined}
            aria-describedby={lineId}
            className={`${inputClass} font-mono tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-written-unit`} className={subLabelClass}>
            {t("writtenUnit")}
          </label>
          <SelectField
            id={`${idPrefix}-written-unit`}
            value={values.unit}
            onChange={(e) => onChange({ ...values, unit: e.target.value as IngredientUnit | "" })}
            aria-invalid={refusal === "unit" || undefined}
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
    </div>
  );
}
