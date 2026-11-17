"use client";

import { DecimalField } from "@/components/ui/DecimalField";
import { chipOff, chipOn, chipRowWrapping, chip as chipStyle } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useRovingChoice } from "@/hooks/useRovingChoice";
import { formatGrams } from "@/lib/foodFormat";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { GRAMS, type EntryFieldError, type UnitChip } from "./amount";

// ---------------------------------------------------------------------------
// AmountField: a food's amount, in grams or as a count of one of its
// portions. The unit chips sit in one row: on a phone it scrolls sideways
// with no scrollbar drawn and never wraps, and from md it wraps. "g", then
// each portion with its weight. One number field under
// them, grams with one decimal or a count with two. Its line keeps two lines
// of room, since a digit-group refusal wraps at 320 pixels.
//
// A chip switch converts what is typed (`switchUnit` in entryForm.ts). The
// chip chosen is the accent, because selection reads accent. Shared by the
// entry sheet and, with the log sheet, the log block.
// ---------------------------------------------------------------------------

export interface AmountFieldProps {
  id: string;
  chips: readonly UnitChip[];
  unit: string;
  amount: string;
  onUnit: (chip: UnitChip) => void;
  onAmount: (raw: string) => void;
  error: EntryFieldError | undefined;
  autoFocus: boolean;
  /** "beside" puts the field's label on its left, one row, for a block that must fit a first screen. */
  layout?: "stacked" | "beside";
}

export function AmountField({
  id,
  chips,
  unit,
  amount,
  onUnit,
  onAmount,
  error,
  autoFocus,
  layout,
}: AmountFieldProps): ReactElement {
  const t = useTranslations("entries.amount");
  const tSheet = useTranslations("entries.sheet");
  const tCommon = useTranslations("common");
  const errorCopy = useErrorCopy();
  const ids = chips.map((c) => c.id);
  const roving = useRovingChoice(ids, unit, (next) => {
    const chip = chips.find((c) => c.id === next);
    if (chip) onUnit(chip);
  });
  const labelOf = (chip: UnitChip) =>
    chip.id === GRAMS ? t("grams") : t("portion", { portion: chip.label ?? "", grams: formatGrams(chip.grams ?? 0) });
  const line = error === undefined ? null : error === "digit_group" ? tCommon("digitGroup") : errorCopy.forCode(error);
  return (
    // 8 px under the chip row, whose own 4 px of focus-ring room makes the
    // 12 px every field in a form sheet keeps.
    <div className="space-y-2">
      {/* Always drawn, "g" at least, so chips joining it when the food's portions load move nothing. */}
      <div
        role="radiogroup"
        aria-label={tSheet("amount")}
        // Room for the focus ring, which the scroll would clip.
        className={chipRowWrapping}
      >
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="radio"
            aria-checked={chip.id === unit}
            data-unit={chip.id}
            onClick={() => onUnit(chip)}
            {...roving.optionProps(chip.id)}
            className={`${chipStyle} ${chip.id === unit ? chipOn : chipOff}`}
          >
            {labelOf(chip)}
          </button>
        ))}
      </div>
      <DecimalField
        id={id}
        name="amount"
        label={tSheet("amount")}
        unit={unit === GRAMS ? t("grams") : t("portions")}
        widestUnit={t("portions")}
        inputMode="decimal"
        enterKeyHint="done"
        autoFocus={autoFocus}
        value={amount}
        onValueChange={onAmount}
        invalid={error !== undefined}
        line={line}
        lineRows={2}
        layout={layout}
      />
    </div>
  );
}
