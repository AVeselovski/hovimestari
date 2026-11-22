"use client";

import { focusField } from "@/components/form/focus";
import { DecimalField } from "@/components/ui/DecimalField";
import { FormSheet, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { SelectField } from "@/components/ui/SelectField";
import {
  fieldErrorClass,
  labelClass,
  linelessBlock,
  lineRoom,
  pairRowAlways,
  sectionTitle,
} from "@/components/ui/styles";
import { RECIPE_SORTS, type RecipeSort } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";
import {
  BOUND_KEYS,
  draftOf,
  EMPTY_DRAFT,
  readDraft,
  type BoundError,
  type BoundKey,
  type FilterDraft,
  type ListFilter,
} from "./recipeListFilter";

// ---------------------------------------------------------------------------
// RecipeFilterSheet: the Recipes tab's sort and figure filter. Sort by, a
// native select, then "Per serving" with four bounds two by two: protein at
// least and at most, calories at least and at most. Every bound is optional.
//
// The sheet holds a draft. Nothing it holds reaches the list until Show
// recipes, so the list under it never moves while a bound is typed. Clear
// empties the draft, by name with no bound, and Show recipes then shows the
// list so. Only Show recipes applies a draft. Cancel, Escape, a press outside
// and a drag down all close the sheet and drop the draft, changed or not: a
// draft of a filter is not data, so nothing typed here is worth guarding.
//
// A bound is a number with one decimal at most. One that cannot be read is
// said in the one line its pair shares, and Show recipes then changes nothing.
// A lower bound above its upper one is taken as typed: the list then says
// that no recipe matches.
// ---------------------------------------------------------------------------

export type RecipeFilterSheetProps = FormSheetCallerProps & {
  /** The sort and bounds in force on the list, which the draft starts from. */
  filter: ListFilter;
  /** Show recipes: the list takes this sort and these bounds. */
  onApply: (filter: ListFilter) => void;
};

const PAIRS = [
  { lower: "minProteinG", upper: "maxProteinG", unit: "grams", inputMode: "decimal" },
  { lower: "minEnergyKcal", upper: "maxEnergyKcal", unit: "kcal", inputMode: "numeric" },
] as const;

export function RecipeFilterSheet({
  open,
  onClose,
  returnFocusTo,
  onSaved,
  filter,
  onApply,
}: RecipeFilterSheetProps): ReactElement {
  const t = useTranslations("recipes.filter");
  const tCommon = useTranslations("common");
  const tFigures = useTranslations("figures");
  const id = useId();
  const [draft, setDraft] = useState<FilterDraft>(() => draftOf(filter));
  const [errors, setErrors] = useState<Partial<Record<BoundKey, BoundError>>>({});
  const fieldId = (key: BoundKey | "sort"): string => `${id}-${key}`;

  function setBound(key: BoundKey, raw: string): void {
    setDraft((d) => ({ ...d, [key]: raw }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function handleSubmit(): void {
    const read = readDraft(draft);
    if (!read.ok) {
      setErrors(read.errors);
      const first = BOUND_KEYS.find((key) => read.errors[key] !== undefined);
      if (first) focusField(fieldId(first));
      return;
    }
    onApply(read.filter);
    onSaved?.();
    onClose();
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={t("title")}
      returnFocusTo={returnFocusTo}
      // Never dirty: every dismissal is Cancel, and drops the draft.
      dirty={false}
      submitting={false}
      onSubmit={handleSubmit}
      formError={null}
      idle={t("show")}
      busy={t("show")}
      footerStart={{
        label: t("clear"),
        tone: "neutral",
        onPress: () => {
          setDraft(EMPTY_DRAFT);
          setErrors({});
        },
      }}
    >
      {({ autoFocus }) => (
        <>
          <div className={linelessBlock}>
            <label htmlFor={fieldId("sort")} className={labelClass}>
              {t("sort")}
            </label>
            <SelectField
              id={fieldId("sort")}
              name="sort"
              value={draft.sort}
              onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value as RecipeSort }))}
              autoFocus={autoFocus}
            >
              {RECIPE_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {t(`sorts.${sort}`)}
                </option>
              ))}
            </SelectField>
          </div>
          <fieldset className="min-w-0">
            <legend className={`${sectionTitle} mb-2`}>{t("perServing")}</legend>
            {PAIRS.map((pair) => {
              const lineId = `${fieldId(pair.lower)}-line`;
              const error = errors[pair.lower] ?? errors[pair.upper];
              const line = error === undefined ? null : error === "group" ? tCommon("digitGroup") : t("invalid");
              return (
                <div key={pair.lower}>
                  <div className={pairRowAlways}>
                    {([pair.lower, pair.upper] as const).map((key) => (
                      <DecimalField
                        key={key}
                        id={fieldId(key)}
                        name={key}
                        label={t(`bounds.${key}`)}
                        unit={pair.unit === "grams" ? tFigures("unitGrams") : tFigures("unitKcal")}
                        inputMode={pair.inputMode}
                        enterKeyHint={key === "maxEnergyKcal" ? "done" : "next"}
                        value={draft[key]}
                        onValueChange={(raw) => setBound(key, raw)}
                        invalid={errors[key] !== undefined}
                        describedBy={line ? lineId : undefined}
                      />
                    ))}
                  </div>
                  <p id={lineId} className={`${fieldErrorClass} ${lineRoom}`}>
                    {line}
                  </p>
                </div>
              );
            })}
          </fieldset>
        </>
      )}
    </FormSheet>
  );
}
