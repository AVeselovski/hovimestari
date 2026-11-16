"use client";

import { BottomSheet, SheetDescription } from "@/components/ui/BottomSheet";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnDanger, btnPrimary, btnSecondary, errorTextClass, sheetActions, touchTarget } from "@/components/ui/styles";
import { useArmedAtRest } from "@/hooks/useArmedAtRest";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactElement } from "react";

// ---------------------------------------------------------------------------
// ConfirmDialog: the app's explicit "are you sure?" step before a
// destructive or consequential action.
//
// It is a `BottomSheet`: below `md` a sheet off the bottom edge with Cancel
// and the confirm action as two equal halves in its footer, at `md`+ the
// centred `max-w-sm` dialog. Escape, a tap outside and a swipe all cancel;
// only the confirm button confirms. While the request runs every one of them
// is refused, the same gate as the disabled Cancel: cancelling out from under
// a running delete would orphan the caller's loading state.
//
// Callers keep it mounted with the last target it showed
// (`useRetainedValue`) and drive `open`, so it slides out with its text.
//
// On a phone the confirm button takes a press only once the sheet is at rest
// (`useArmedAtRest`): the sheet slides up under the finger that opened it,
// and the second tap of a double tap on the opener must not confirm. At
// `md`+ the dialog fades in centred, away from the opener, and the button
// works at once, so Enter from the keyboard is never swallowed.
// ---------------------------------------------------------------------------

/**
 * The confirm button's label at rest and while the action runs, such as
 * "Remove password" and "Removing…". Both or neither: left out, they are
 * "Delete" and "Deleting…".
 */
export type ConfirmLabels = { confirmLabel: string; busyLabel: string } | { confirmLabel?: never; busyLabel?: never };

type ConfirmDialogProps = ConfirmLabels & {
  /** False while it slides out. The caller keeps it mounted with the text it showed. */
  open: boolean;
  title: string;
  message: string;
  /** A second line under the message: what else the action leaves as it is. */
  note?: string | null;
  isLoading?: boolean;
  /** "danger" (default) for destructive confirms. "primary" for a reversible action such as signing out. */
  tone?: "danger" | "primary";
  /** Why the last confirm failed. Shown inside the dialog, above the buttons, so it is not hidden behind the overlay. */
  error?: string | null;
  /**
   * Where focus goes when it closes, when the control that opened it cannot
   * be captured: a tapped button on iOS, or a menu item that is gone by then.
   * Default: whatever had focus when it opened.
   */
  returnFocusTo?: HTMLElement | null;
  onConfirm: () => void;
  /** Cancel, and every dismissal the sheet accepts: Escape, a tap outside, a swipe. */
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  note = null,
  confirmLabel,
  busyLabel,
  isLoading = false,
  tone = "danger",
  error = null,
  returnFocusTo,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactElement {
  const tCommon = useTranslations("common");
  // Most call sites confirm a delete. A default parameter value cannot call
  // useTranslations, so the default labels are resolved here.
  const label = confirmLabel ?? tCommon("delete");
  const busy = busyLabel ?? tCommon("deleting");

  const arming = useArmedAtRest(open, useIsMobile());

  return (
    <BottomSheet
      open={open}
      onClose={onCancel}
      title={title}
      dismissible={!isLoading}
      returnFocusTo={returnFocusTo}
      panelClassName="md:max-w-sm"
      onOpened={arming.onOpened}
      footer={
        // The dialog's own 12px gap between the two buttons at `md`+.
        <div className={`${sheetActions} md:gap-3`}>
          {/* First in the footer and the first control in the sheet, so it
              takes focus on open: Enter never confirms by accident. */}
          <button type="button" onClick={onCancel} disabled={isLoading} className={`${btnSecondary} ${touchTarget}`}>
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            // On a phone, still visible and focusable while the sheet enters,
            // but a press then does nothing (see the top of this file).
            // Cancel always works.
            {...arming.pressProps(onConfirm)}
            disabled={isLoading}
            className={`${tone === "primary" ? btnPrimary : btnDanger} ${touchTarget}`}
          >
            {/* As wide as the longer label in both states, so nothing shifts on click. */}
            <StableLabel active={isLoading} idle={label} busy={busy} />
          </button>
        </div>
      }
    >
      <ConfirmBody message={message} note={note} error={error} isLoading={isLoading} />
    </BottomSheet>
  );
}

/**
 * The message and the last failure. Mounted once per open, inside the sheet.
 *
 * While loading both buttons are disabled, and a disabled button drops focus
 * to <body>, outside the sheet. Focus is parked here instead, so a screen
 * reader stays in the dialog and Tab stays trapped.
 */
function ConfirmBody({
  message,
  note,
  error,
  isLoading,
}: {
  message: string;
  note: string | null;
  error: string | null;
  isLoading: boolean;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isLoading) ref.current?.focus({ preventScroll: true });
  }, [isLoading]);

  // The dialog's spacing: the message 8px under the title (`-mt-2` on the
  // body's 16px), the error 12px under the message, and 20px from the last
  // line to the footer's border (`mb-1` on the body's 16px).
  return (
    <div ref={ref} tabIndex={-1} data-confirm-body="" className="-mt-2 focus:outline-none">
      {/* The note is part of the description, so a screen reader reads both with the title. */}
      <SheetDescription className="mb-1 text-base text-ink">
        {message}
        {note && <span className="mt-2 block">{note}</span>}
      </SheetDescription>
      {error && (
        <p role="alert" className={`mt-3 mb-1 ${errorTextClass}`}>
          {error}
        </p>
      )}
    </div>
  );
}
