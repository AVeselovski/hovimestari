"use client";

import { StableLabel } from "@/components/ui/StableLabel";
import {
  btnDanger,
  btnPrimary,
  btnSecondary,
  sheetActions,
  sheetActionsStart,
  touchTarget,
} from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

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
  start?: ReactNode;
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
 * field still submits. Cancel always closes, except while the save runs. A
 * secondary action (`start`) takes a row of its own above the two: the full
 * width on a phone, at the start from `md`.
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
}: FormSheetActionsProps): ReactElement {
  const tCommon = useTranslations("common");
  return (
    <div className={`${sheetActions} md:gap-3`}>
      {start && (
        <div data-footer-start="" className={sheetActionsStart}>
          {start}
        </div>
      )}
      <button type="button" onClick={onCancel} disabled={submitting} className={`${btnSecondary} ${touchTarget}`}>
        {tCommon("cancel")}
      </button>
      <button
        type="submit"
        form={formId}
        disabled={submitting || submitDisabled}
        {...submitGuard}
        className={`${tone === "danger" ? btnDanger : btnPrimary} ${touchTarget}`}
      >
        <StableLabel active={submitting} idle={idle} busy={busy} />
      </button>
    </div>
  );
}
