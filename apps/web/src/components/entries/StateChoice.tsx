"use client";

import {
  segmentActive,
  segmentButton,
  segmentButtonBesideField,
  segmentInactive,
  segmentedTray,
  segmentedTrayBesideField,
} from "@/components/ui/styles";
import { useRovingChoice } from "@/hooks/useRovingChoice";
import type { EntryStatus } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// StateChoice: Eaten or Planned, one radio group on the segmented tray. On a
// date after today Eaten is unavailable (`aria-disabled`, a press does
// nothing), Planned shows as chosen, and the line under the group says why.
// That line keeps its room on every date, so it moves nothing when it fills.
// From md the tray is as tall as a field, 48 pixels, since it sits beside a
// name in the estimate and saved meal sheets.
// ---------------------------------------------------------------------------

const STATES: readonly EntryStatus[] = ["eaten", "planned"];

export interface StateChoiceProps {
  id: string;
  /** The state chosen. */
  value: EntryStatus;
  onChange: (next: EntryStatus) => void;
  /** The date is after today: only Planned can be saved. */
  future: boolean;
}

export function StateChoice({ id, value, onChange, future }: StateChoiceProps): ReactElement {
  const t = useTranslations("entries.sheet");
  const shown: EntryStatus = future ? "planned" : value;
  const disabled = (s: EntryStatus) => future && s === "eaten";
  const roving = useRovingChoice(STATES, shown, onChange, disabled);
  const hintId = `${id}-hint`;
  return (
    <div>
      <span id={`${id}-label`} className="mb-1.5 block text-sm font-semibold text-ink">
        {t("state")}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={hintId}
        className={`${segmentedTray} ${segmentedTrayBesideField} grid-cols-2`}
      >
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={shown === s}
            aria-disabled={disabled(s) || undefined}
            onClick={() => {
              if (!disabled(s)) onChange(s);
            }}
            {...roving.optionProps(s)}
            className={`${segmentButton} ${segmentButtonBesideField} ${shown === s ? segmentActive : segmentInactive} aria-disabled:cursor-not-allowed aria-disabled:opacity-60`}
          >
            {s === "eaten" ? t("eaten") : t("planned")}
          </button>
        ))}
      </div>
      <p id={hintId} aria-live="polite" className="mt-1.5 min-h-5 text-sm text-ink-muted">
        {future ? t("futureHint") : null}
      </p>
    </div>
  );
}
