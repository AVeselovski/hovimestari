"use client";

import { AmountField } from "@/components/entries/AmountField";
import { CountField } from "@/components/entries/CountField";
import { StateChoice } from "@/components/entries/StateChoice";
import { MacroFigures } from "@/components/figures/MacroFigures";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { LogForm } from "./useLogForm";

// ---------------------------------------------------------------------------
// LogBlock: the form at the top of the food view and the meal view. Top to
// bottom: the unit chips and the amount (or the number of meals), the
// figures for that amount, then Eaten or planned. Log sits in the sheet's
// pinned footer (`LogFooter`) and reaches this form by its id, so Enter in
// the field logs too. The refusal no field owns shows in the footer, above
// Log, so the block keeps no room of its own for it.
//
// Sized for the first screen of a phone with the keyboard closed: the field's
// label sits beside it, and the figures are one row of four.
// ---------------------------------------------------------------------------

export function LogBlock({ form, autoFocus }: { form: LogForm; autoFocus: boolean }): ReactElement {
  const tAmount = useTranslations("entries.amount");
  const caption = form.preview !== null ? tAmount("forAmount") : form.empty ? tAmount("enterAmount") : null;
  return (
    <form
      id={form.formId}
      data-log-block=""
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
      className="space-y-3"
    >
      {form.kind === "food" ? (
        <AmountField
          id={form.fieldId}
          chips={form.chips}
          unit={form.unit}
          amount={form.amount}
          onUnit={form.setUnit}
          onAmount={form.setAmount}
          error={form.error}
          autoFocus={autoFocus}
          layout="beside"
        />
      ) : (
        <CountField
          id={form.fieldId}
          of="meals"
          value={form.amount}
          onChange={form.setAmount}
          error={form.error}
          autoFocus={autoFocus}
          layout="beside"
        />
      )}
      <div data-log-figures="">
        <p aria-live="polite" className="mb-1 min-h-5 text-sm text-ink-muted">
          {caption}
        </p>
        <MacroFigures figures={form.preview} energyWord="calories" layout="row" />
      </div>
      <StateChoice id={`${form.formId}-state`} value={form.status} onChange={form.setStatus} future={form.future} />
    </form>
  );
}
