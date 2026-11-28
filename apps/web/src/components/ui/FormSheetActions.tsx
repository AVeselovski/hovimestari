"use client";

import { StableLabel } from "@/components/ui/StableLabel";
import {
  btnDanger,
  btnPrimary,
  btnSecondary,
  btnText,
  btnTextDanger,
  sheetActions,
  sheetActionsButton,
  sheetActionsPair,
  sheetActionsStart,
  sheetActionsStartButton,
} from "@/components/ui/styles";
import type { ArmedAtRest } from "@/hooks/useArmedAtRest";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

/**
 * A form sheet's secondary action, in a footer row of its own above Cancel
 * and the submit button, drawn as a text button. Two kinds:
 *
 * - A press (`onPress`), such as a delete that opens its confirmation.
 * - A second submit of the same form in another mode (`submit`), such as
 *   "Save meal" beside "Save and log". It goes through the form sheet's own
 *   submit, with its in-flight guard, and hands `submit` to `onSubmit`.
 */
export type FooterAction = FooterPress | FooterSubmit;

interface FooterActionBase {
  label: string;
  /** "danger" (default) in the accent, for a destructive action. "neutral" in ink. */
  tone?: "danger" | "neutral";
  /**
   * The row gives its room to the on-screen keyboard while it is open
   * (`keyboard-yields` in globals.css), so Save stays above the keyboard.
   * For an action nobody needs while typing, such as Remove entry. Never for
   * a second way to finish the form, which must stay in sight.
   */
  yieldsToKeyboard?: boolean;
}

export interface FooterPress extends FooterActionBase {
  /** Called with the button, where a confirmation returns focus. Never while a save runs. */
  onPress: (opener: HTMLElement) => void;
}

export interface FooterSubmit extends FooterActionBase {
  /** The mode `onSubmit` receives. */
  submit: string;
  /** The label while its submit runs. */
  busy: string;
}

export interface FormSheetActionsProps {
  /** The form the submit button submits, from outside it. */
  formId: string;
  onCancel: () => void;
  submitting: boolean;
  /** The submit button and the secondary action wait, with the disabled look. Cancel stays free. */
  held?: boolean;
  /** The submit button's label at rest and while it runs. */
  idle: string;
  busy: string;
  /** Disables the submit button, such as while a confirmation is empty. */
  submitDisabled?: boolean;
  /** "danger" for a destructive submit, such as Delete account. */
  tone?: "primary" | "danger";
  /** A secondary action, such as "Delete entry": a row of its own above Cancel and the submit button. */
  start?: FooterAction;
  /** Submits the form in a footer action's mode. */
  onSubmitMode?: (mode: string) => void;
  /** The mode of the submit that runs: a footer action's, or null for the submit button's. */
  runningMode?: string | null;
  /** Extra props for the submit button, such as a guard that refuses a press until the sheet is at rest. */
  submitGuard?: ArmedAtRest["guardProps"];
}

/**
 * A form sheet's footer row: Cancel and the submit button, two equal halves
 * on a phone and a right-aligned row from `md`. The submit button sits
 * outside the form and reaches it by its `form` attribute, so Enter in a
 * field still submits. A secondary action (`start`) takes a row of its own
 * above the two on a phone, the full width. From `md` it sits at the start
 * of their row, or above them when the three do not fit.
 *
 * While the save runs, all three are `aria-disabled` with the disabled look,
 * and a press on any of them does nothing. None is `disabled`: a disabled
 * button drops the focus it holds to <body>, outside the modal, and on a
 * phone a tap does not move focus off the button pressed last.
 */
export function FormSheetActions({
  formId,
  onCancel,
  submitting,
  held = false,
  idle,
  busy,
  submitDisabled = false,
  tone = "primary",
  submitGuard,
  start,
  onSubmitMode,
  runningMode = null,
}: FormSheetActionsProps): ReactElement {
  const tCommon = useTranslations("common");
  const startSubmit = start && "submit" in start ? start : null;
  const startRow = start && (
    <div data-footer-start="" className={sheetActionsStart}>
      <button
        type="button"
        aria-disabled={submitting || held || undefined}
        onClick={(e) => {
          if (submitting || held) return;
          if ("submit" in start) onSubmitMode?.(start.submit);
          else start.onPress(e.currentTarget);
        }}
        className={`justify-center ${start.tone === "neutral" ? btnText : btnTextDanger} ${sheetActionsStartButton}`}
      >
        {startSubmit ? (
          <StableLabel
            active={submitting && runningMode === startSubmit.submit}
            idle={startSubmit.label}
            busy={startSubmit.busy}
          />
        ) : (
          start.label
        )}
      </button>
    </div>
  );
  return (
    <div className={`${sheetActions} md:gap-3`}>
      {start && (start.yieldsToKeyboard ? <KeyboardYields>{startRow}</KeyboardYields> : startRow)}
      <div className={sheetActionsPair}>
        <button
          type="button"
          aria-disabled={submitting || undefined}
          onClick={() => {
            if (!submitting) onCancel();
          }}
          className={`${btnSecondary} ${sheetActionsButton}`}
        >
          {tCommon("cancel")}
        </button>
        <button
          type="submit"
          form={formId}
          // FormSheet refuses a second submit while one runs.
          disabled={submitDisabled}
          aria-disabled={submitting || held || undefined}
          {...submitGuard}
          className={`${tone === "danger" ? btnDanger : btnPrimary} ${sheetActionsButton}`}
        >
          <StableLabel active={submitting && runningMode === null} idle={idle} busy={busy} />
        </button>
      </div>
    </div>
  );
}

/**
 * A footer row that gives its room to the on-screen keyboard
 * (`keyboard-yields` in globals.css). While the clamp holds it at no height
 * it is `inert`, so Tab skips what cannot be seen, and it is back in the Tab
 * order as soon as the keyboard closes and the row has its height again.
 */
function KeyboardYields({ children }: { children: ReactNode }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const row = ref.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setCollapsed(entry.contentRect.height < 1));
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} inert={collapsed} data-keyboard-yields="" className="keyboard-yields col-span-2 md:mr-auto">
      {children}
    </div>
  );
}
