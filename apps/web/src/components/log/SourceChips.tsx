"use client";

import { chip, chipOff, chipOn, sheetChipRow } from "@/components/ui/styles";
import { useRovingChoice } from "@/hooks/useRovingChoice";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// SourceChips: "All" and one chip per source the saved meals name, one row
// that scrolls sideways and never wraps. The chosen chip is in the accent. A
// radio group: one Tab stop, the arrow keys move the choice. Shown only with
// two sources or more, since one source filters nothing.
// ---------------------------------------------------------------------------

/** The chip for every source. */
const ALL = "";

export interface SourceChipsProps {
  sources: readonly string[];
  /** The chosen source, or null for all. */
  value: string | null;
  onChange: (source: string | null) => void;
}

export function SourceChips({ sources, value, onChange }: SourceChipsProps): ReactElement {
  const t = useTranslations("log.browse");
  const options = [ALL, ...sources];
  const chosen = value ?? ALL;
  const roving = useRovingChoice(options, chosen, (next) => onChange(next === ALL ? null : next));
  return (
    <div role="radiogroup" aria-label={t("sources")} data-source-chips="" className={`${sheetChipRow} mb-1`}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === chosen}
          onClick={() => onChange(option === ALL ? null : option)}
          {...roving.optionProps(option)}
          // A long source is cut short on the chip: the full name shows on hover.
          title={option === ALL ? undefined : option}
          className={`${chip} ${option === chosen ? chipOn : chipOff}`}
        >
          {option === ALL ? t("allSources") : option}
        </button>
      ))}
    </div>
  );
}
