"use client";

import { FormError } from "@/components/form/FormError";
import { BottomSheet, SheetDescription, type BottomSheetProps } from "@/components/ui/BottomSheet";
import { FormSheetActions, type FooterAction, type FormSheetActionsProps } from "@/components/ui/FormSheetActions";
import { PromptSheetBody } from "@/components/ui/PromptSheetBody";
import { formStack } from "@/components/ui/styles";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { connectionFailure } from "@/lib/failure";
import { revealFocused, revealRefused } from "@/lib/revealRefused";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// FormSheet: a sheet that holds one form, with Cancel and the submit button in
// its footer. It owns the frame every form sheet shares, so a sheet passes
// its fields, its state and its submit, and nothing else:
//
// - The sheet: keyboard-aware, the `md:max-w-sm` dialog from `md`, and
//   dismissible only while the form is clean and no save is running.
// - The body (`PromptSheetBody`), which takes focus on a phone so no keyboard
//   rises mid-slide. The render prop's `autoFocus` is true only from `md`,
//   where the first field takes focus instead. A first control that is not a
//   text field passes it on: a stepper or a segmented control to its own
//   focusable element, a roving radio group to its checked radio.
// - The form element and its id, which the submit button in the footer
//   reaches by its `form` attribute, so Enter in a field still submits.
// - The line for a refusal that belongs to no field, in the pinned footer
//   above the buttons, so it is in sight however far the body is scrolled.
//   On a phone it keeps no room: it grows the footer upward, the buttons
//   where they were, and the focused field comes back into view if the
//   taller footer covers it. From `md` it keeps two lines of room, because
//   the dialog grows downward and would move the buttons.
// - The form's stack: 8px between fields (`formStack`). A last field's
//   reserved line is the room above the footer (`form-ends-in-line`).
// - The account's address in a hidden `username` field, for password
//   managers, which pair it with the password fields.
// - The in-flight guard: a submit is ignored while `submitting` is set, and
//   while the promise the last `onSubmit` returned is pending, so a sheet
//   that awaits something before it sets `submitting` is guarded too.
// - The sheet's other options (`sheet`), with `md:max-w-sm` as the default
//   width, and a row in the footer above Cancel and the submit button
//   (`footerStart`) for a secondary action: a press, such as a delete that
//   asks first, or a second submit of the form in a mode of its own, which
//   runs through the same guard and reaches `onSubmit` with its mode. While
//   a save runs, it and Cancel ignore a press and keep the focus they hold.
// - `held`: the submit and the secondary action wait, such as while the app
//   asks the server for today. Cancel and every dismissal stay free.
// - The refusal line says "You are offline. Changes need a connection."
//   for a failure that came while the app knew it was offline and that the
//   connection explains: a write not sent (`OfflineError`), or one with no
//   answer or a server fault. One place says it for every form sheet. A
//   refusal the server answered shows its own line, also while offline,
//   since the session can be out of reach between renewals while requests
//   still get through. It is decided when the failure arrives, so the line
//   does not change when the connection comes back.
// - A refused submit brings the first refused field into view inside the
//   body, its line included, as the submit's refusals render and again when
//   its promise settles (lib/revealRefused.ts). A refusal in the footer does
//   the same for the field that holds focus. Nothing scrolls when the field
//   is already in view.
//
// What a save does, and what happens after it (`onSaved`, then `onClose`),
// stays with the sheet.
// ---------------------------------------------------------------------------

/** What a form sheet's caller passes it. */
export interface FormSheetCallerProps {
  /** False while it slides out. The caller keeps it mounted, one mount per open. */
  open: boolean;
  /** Where focus goes when it closes, such as the button that opened it. */
  returnFocusTo: HTMLElement | null;
  /** Cancel, and every dismissal the sheet accepts. Also called after a save. */
  onClose: () => void;
  /** The save worked. Called just before `onClose`. Left out when the caller needs no word of it. */
  onSaved?: () => void;
}

/** A refusal that belongs to no field: its line, and the failure behind it. */
export interface FormFailure {
  line: string;
  /** The error the write threw, or null for a line the sheet decided itself. */
  cause: unknown;
}

/** What the fields learn from the sheet. */
export interface FormSheetField {
  /** True for the first field from `md`. On a phone the body takes focus instead. */
  autoFocus: boolean;
}

export interface FormSheetProps extends Pick<
  FormSheetActionsProps,
  "idle" | "busy" | "tone" | "submitDisabled" | "submitGuard"
> {
  open: boolean;
  onClose: () => void;
  title: string;
  /** A line above the form that says what the sheet does. Read with the title by a screen reader. */
  description?: ReactNode;
  returnFocusTo: HTMLElement | null;
  /** Something is typed: a stray gesture must not throw it away. */
  dirty: boolean;
  /** A save is running: every way out is refused and the submit button is busy. */
  submitting: boolean;
  /**
   * Called on submit, unless a save is already running. The default action
   * is prevented. `mode` is the footer action's `submit` when that action
   * submitted the form, and undefined for the submit button and Enter.
   */
  onSubmit: (mode?: string) => void | Promise<void>;
  /** The refusal that belongs to no field, in the footer above the buttons. */
  formError: FormFailure | null;
  /** The submit and the secondary action wait. Cancel and dismissal stay free. */
  held?: boolean;
  /** The account's address, for password managers, in a hidden `username` field. */
  username?: string;
  /** Called once the sheet is at rest, such as for `useArmedAtRest`. */
  onOpened?: () => void;
  /** The sheet's other options. `panelClassName` defaults to `md:max-w-sm`. */
  sheet?: FormSheetOptions;
  /** A secondary action, such as "Delete entry" or a second submit, in a footer row of its own above Cancel and the submit button. */
  footerStart?: FooterAction;
  children: (field: FormSheetField) => ReactNode;
}

/** The `BottomSheet` options a form sheet may set. */
export type FormSheetOptions = Pick<
  BottomSheetProps,
  "panelClassName" | "titleClassName" | "holdScroll" | "headerNote" | "stacked" | "onClosed" | "size"
>;

export function FormSheet({
  open,
  onClose,
  title,
  description,
  returnFocusTo,
  dirty,
  submitting,
  onSubmit,
  formError,
  held = false,
  username,
  onOpened,
  idle,
  busy,
  tone,
  submitDisabled,
  submitGuard,
  sheet,
  footerStart,
  children,
}: FormSheetProps): ReactElement {
  const isMobile = useIsMobile();
  const tCommon = useTranslations("common");
  const offline = useKnownOffline();
  const formId = `${useId()}-form`;
  // Whether the failure on screen came while offline, decided when it arrives.
  const offlineNow = (f: FormFailure | null): boolean => f !== null && offline && connectionFailure(f.cause);
  const [failure, setFailure] = useState({ error: formError, offline: offlineNow(formError) });
  if (failure.error !== formError) setFailure({ error: formError, offline: offlineNow(formError) });
  const shownError = formError === null ? null : failure.offline ? tCommon("offline") : formError.line;
  // Closed from a submit until the promise it returned settles.
  const guard = useSubmitGuard();
  const formRef = useRef<HTMLFormElement>(null);
  // The mode a footer action asked for, read by the submit it starts.
  const modeRef = useRef<string | null>(null);
  // The mode of the last submit, so the button that started it shows busy.
  const [runningMode, setRunningMode] = useState<string | null>(null);
  // Bumped by a submit and by its end: each time, a refused field comes into view.
  const [refusalCheck, setRefusalCheck] = useState(0);
  // A refusal in the footer takes the body's room on a phone: the focused
  // field comes back into view if it is covered. Before the refused-field
  // check below, so a refused field wins when both run in one commit.
  useLayoutEffect(() => {
    if (shownError !== null) revealFocused(formRef.current);
  }, [shownError]);
  useLayoutEffect(() => {
    if (refusalCheck > 0) revealRefused(formRef.current);
  }, [refusalCheck]);

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const mode = modeRef.current;
    modeRef.current = null;
    if (submitting || held || guard.inFlight()) return;
    setRunningMode(mode);
    setRefusalCheck((n) => n + 1);
    guard.run(() => {
      const result = mode === null ? onSubmit() : onSubmit(mode);
      const check = (): void => setRefusalCheck((n) => n + 1);
      result?.then(check, check);
      return result;
    });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!dirty && !submitting}
      returnFocusTo={returnFocusTo}
      keyboardAware
      {...sheet}
      panelClassName={sheet?.panelClassName ?? "md:max-w-sm"}
      onOpened={onOpened}
      footer={
        <>
          <FormError message={shownError} inFooter />
          <FormSheetActions
            formId={formId}
            onCancel={onClose}
            submitting={submitting}
            held={held}
            idle={idle}
            busy={busy}
            tone={tone}
            submitDisabled={submitDisabled}
            submitGuard={submitGuard}
            start={footerStart}
            runningMode={runningMode}
            onSubmitMode={(mode) => {
              // Through the form's own submit, so the guard above applies.
              modeRef.current = mode;
              formRef.current?.requestSubmit();
            }}
          />
        </>
      }
    >
      <PromptSheetBody focusSelf={isMobile}>
        {description !== undefined && (
          <SheetDescription className="mb-4 text-base text-ink">{description}</SheetDescription>
        )}
        <form ref={formRef} id={formId} onSubmit={handleSubmit} noValidate className={`${formStack} form-ends-in-line`}>
          {username !== undefined && (
            <input type="email" name="username" autoComplete="username" value={username} readOnly hidden />
          )}
          {children({ autoFocus: !isMobile })}
        </form>
      </PromptSheetBody>
    </BottomSheet>
  );
}
