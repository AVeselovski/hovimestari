"use client";

import {
  fieldHintClass,
  labelClass,
  linelessBlock,
  lineRoom,
  segmentActive,
  segmentButton,
  segmentButtonBesideField,
  segmentedTray,
  segmentedTrayBesideField,
  segmentInactive,
} from "@/components/ui/styles";
import { useRovingChoice } from "@/hooks/useRovingChoice";
import type { EntryStatus } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// StateChoice: Eaten or Planned, one radio group on the segmented tray. On a
// date after today Eaten is unavailable (`aria-disabled`, a press does
// nothing), Planned shows as chosen, and a line says why. A choice cannot be
// refused, so the group keeps no line of its own on a day it can be either:
// the block under it starts 16 pixels below (`linelessBlock`). In the log
// sheet's forms the day is the one the sheet opened on, so the line is drawn
// under the group on a future day only and does not change while you type.
// Where the date is a field of the form, as in the entry sheet, the date's
// own line says it instead (`reasonId`), next to what caused it, so changing
// the date moves nothing above it. From md the tray is as tall as a field, 48
// pixels, since it sits beside a name in the estimate and saved meal sheets.
// ---------------------------------------------------------------------------

const STATES: readonly EntryStatus[] = ["eaten", "planned"];

export interface StateChoiceProps {
  id: string;
  /** The state chosen. */
  value: EntryStatus;
  onChange: (next: EntryStatus) => void;
  /** The date is after today: only Planned can be saved. */
  future: boolean;
  /**
   * The id of a line elsewhere in the form that says why only Planned can be
   * saved, such as the date field's. Given, the group draws no line of its own.
   */
  reasonId?: string;
}

export function StateChoice({ id, value, onChange, future, reasonId }: StateChoiceProps): ReactElement {
  const t = useTranslations("entries.sheet");
  const shown: EntryStatus = future ? "planned" : value;
  const disabled = (s: EntryStatus) => future && s === "eaten";
  const roving = useRovingChoice(STATES, shown, onChange, disabled);
  const hintId = `${id}-hint`;
  const ownLine = future && reasonId === undefined;
  const describedBy = reasonId ?? (ownLine ? hintId : undefined);
  return (
    <div data-state-choice="" className={ownLine ? undefined : linelessBlock}>
      <span id={`${id}-label`} className={labelClass}>
        {t("state")}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy}
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
      {ownLine && (
        <p id={hintId} className={`${fieldHintClass} ${lineRoom}`}>
          {t("futureHint")}
        </p>
      )}
    </div>
  );
}
