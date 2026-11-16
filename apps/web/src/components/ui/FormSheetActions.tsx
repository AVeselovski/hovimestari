"use client";

import { StableLabel } from "@/components/ui/StableLabel";
import {
  btnDanger,
  btnPrimary,
  btnSecondary,
  btnText,
  btnTextDanger,
  sheetActions,
  sheetActionsStart,
  touchTarget,
} from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

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
  submitGuard?: {
    onPointerDownCapture: () => void;
    onClickCapture: (e: { preventDefault: () => void; stopPropagation: () => void }) => void;
  };
}

/**
 * A form sheet's footer row: Cancel and the submit button, two equal halves
 * on a phone and a right-aligned row from `md`. The submit button sits
 * outside the form and reaches it by its `form` attribute, so Enter in a
 * field still submits. A secondary action (`start`) takes a row of its own
 * above the two: the full width on a phone, at the start from `md`.
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
  return (
    <div className={`${sheetActions} md:gap-3`}>
      {start && (
        <div data-footer-start="" className={sheetActionsStart}>
          <button
            type="button"
            aria-disabled={submitting || undefined}
            onClick={(e) => {
              if (submitting) return;
              if ("submit" in start) onSubmitMode?.(start.submit);
              else start.onPress(e.currentTarget);
            }}
            className={`justify-center ${start.tone === "neutral" ? btnText : btnTextDanger}`}
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
      )}
      <button
        type="button"
        aria-disabled={submitting || undefined}
        onClick={() => {
          if (!submitting) onCancel();
        }}
        className={`${btnSecondary} ${touchTarget}`}
      >
        {tCommon("cancel")}
      </button>
      <button
        type="submit"
        form={formId}
        // FormSheet refuses a second submit while one runs.
        disabled={submitDisabled}
        aria-disabled={submitting || undefined}
        {...submitGuard}
        className={`${tone === "danger" ? btnDanger : btnPrimary} ${touchTarget}`}
      >
        <StableLabel active={submitting && runningMode === null} idle={idle} busy={busy} />
      </button>
    </div>
  );
}
