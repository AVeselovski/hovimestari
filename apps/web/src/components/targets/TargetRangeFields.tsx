"use client";

import { DecimalField } from "@/components/ui/DecimalField";
import { fieldErrorClass, fieldHintClass, lineRoom, sectionStack, sectionTitle } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { TargetField, TargetFieldErrors, TargetFieldValues } from "./targetForm";

// ---------------------------------------------------------------------------
// TargetRangeFields: the four fields both targets forms share. Two groups,
// Calories and Protein, each a lower and an upper bound side by side, From
// and To. Every field starts empty and has no placeholder: the app offers no
// number, not even as an example.
//
// Each group keeps one line under its pair for the first error of either
// field, or for Protein its hint, so an error appearing moves nothing below.
// Every line here fits one line at 320 wide. A number the group cannot take
// is said in the group's own words, with its own limit, so the line stays
// short. A field's own line would be half a phone's width, where the copy
// wraps.
// ---------------------------------------------------------------------------

/** The id of a field's input, for focusing the first one with an error. */
export function targetFieldId(idPrefix: string, field: TargetField): string {
  return `${idPrefix}-${field}`;
}

interface TargetRangeFieldsProps {
  /** Unique per form, so two forms on one page never share an id. */
  idPrefix: string;
  values: TargetFieldValues;
  onChange: (field: TargetField, raw: string) => void;
  errors: TargetFieldErrors;
  /** The first field takes focus on mount: true from `md` only. */
  autoFocus: boolean;
  disabled?: boolean;
}

export function TargetRangeFields({
  idPrefix,
  values,
  onChange,
  errors,
  autoFocus,
  disabled = false,
}: TargetRangeFieldsProps): ReactElement {
  const t = useTranslations("targets.fields");
  return (
    <div className={sectionStack}>
      <RangeGroup
        idPrefix={idPrefix}
        legend={t("calories")}
        unit={t("kcal")}
        inputMode="numeric"
        lower="energyLower"
        upper="energyUpper"
        invalidLine={t("caloriesInvalid")}
        values={values}
        onChange={onChange}
        errors={errors}
        autoFocus={autoFocus}
        disabled={disabled}
      />
      <RangeGroup
        idPrefix={idPrefix}
        legend={t("protein")}
        unit={t("grams")}
        inputMode="decimal"
        lower="proteinLower"
        upper="proteinUpper"
        values={values}
        onChange={onChange}
        errors={errors}
        hint={t("proteinHint")}
        invalidLine={t("proteinInvalid")}
        autoFocus={false}
        last
        disabled={disabled}
      />
    </div>
  );
}

interface RangeGroupProps extends Omit<TargetRangeFieldsProps, "autoFocus"> {
  legend: string;
  unit: string;
  inputMode: "numeric" | "decimal";
  lower: TargetField;
  upper: TargetField;
  hint?: string;
  /** The group's own words for a number it cannot take, naming its own limit. */
  invalidLine: string;
  autoFocus: boolean;
  /** The last group in the form: its To field's Enter key reads "done". */
  last?: boolean;
}

function RangeGroup({
  idPrefix,
  legend,
  unit,
  inputMode,
  lower,
  upper,
  values,
  onChange,
  errors,
  hint,
  invalidLine,
  autoFocus,
  disabled,
  last = false,
}: RangeGroupProps): ReactElement {
  const t = useTranslations("targets.fields");
  const tCommon = useTranslations("common");
  const { forCode } = useErrorCopy();
  const lineId = `${idPrefix}-${lower}-line`;
  const code = errors[lower] ?? errors[upper];
  const line =
    code === "target_value_invalid"
      ? invalidLine
      : code === "digit_group"
        ? tCommon("digitGroup")
        : code
          ? forCode(code)
          : hint;
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className={`${sectionTitle} mb-2`}>{legend}</legend>
      <div className="grid grid-cols-2 gap-3">
        <DecimalField
          id={targetFieldId(idPrefix, lower)}
          name={lower}
          label={t("from")}
          unit={unit}
          inputMode={inputMode}
          value={values[lower]}
          onValueChange={(raw) => onChange(lower, raw)}
          invalid={errors[lower] !== undefined}
          describedBy={line ? lineId : undefined}
          autoFocus={autoFocus}
        />
        <DecimalField
          id={targetFieldId(idPrefix, upper)}
          name={upper}
          label={t("to")}
          unit={unit}
          inputMode={inputMode}
          value={values[upper]}
          onValueChange={(raw) => onChange(upper, raw)}
          invalid={errors[upper] !== undefined}
          describedBy={line ? lineId : undefined}
          enterKeyHint={last ? "done" : "next"}
        />
      </div>
      <p id={lineId} className={`${code ? fieldErrorClass : fieldHintClass} ${lineRoom}`}>
        {line}
      </p>
    </fieldset>
  );
}
