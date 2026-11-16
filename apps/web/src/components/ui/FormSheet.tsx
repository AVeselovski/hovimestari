"use client";

import { FormError } from "@/components/form/FormError";
import { BottomSheet, SheetDescription, type BottomSheetProps } from "@/components/ui/BottomSheet";
import { FormSheetActions, type FormSheetActionsProps } from "@/components/ui/FormSheetActions";
import { PromptSheetBody } from "@/components/ui/PromptSheetBody";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useId, useRef, type FormEvent, type ReactElement, type ReactNode } from "react";

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
// - The line under the form for a refusal that belongs to no field.
// - The account's address in a hidden `username` field, for password
//   managers, which pair it with the password fields.
// - The in-flight guard: a submit is ignored while `submitting` is set, and
//   while the promise the last `onSubmit` returned is pending, so a sheet
//   that awaits something before it sets `submitting` is guarded too.
// - The sheet's other options (`sheet`), with `md:max-w-sm` as the default
//   width, and a row in the footer above Cancel and the submit button
//   (`footerStart`) for a secondary action such as a delete.
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
  /** The save worked. Called just before `onClose`. */
  onSaved: () => void;
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
  /** Called on submit, unless a save is already running. The default action is prevented. */
  onSubmit: () => void | Promise<void>;
  /** The refusal that belongs to no field, under the form. */
  formError: string | null;
  /** The account's address, for password managers, in a hidden `username` field. */
  username?: string;
  /** Called once the sheet is at rest, such as for `useArmedAtRest`. */
  onOpened?: () => void;
  /** The sheet's other options. `panelClassName` defaults to `md:max-w-sm`. */
  sheet?: FormSheetOptions;
  /** A secondary action, such as "Delete entry", in a footer row of its own above Cancel and the submit button. */
  footerStart?: ReactNode;
  children: (field: FormSheetField) => ReactNode;
}

/** The `BottomSheet` options a form sheet may set. */
export type FormSheetOptions = Pick<
  BottomSheetProps,
  "panelClassName" | "titleClassName" | "holdScroll" | "headerNote" | "stacked" | "onClosed"
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
  const formId = `${useId()}-form`;
  // True from a submit until the promise it returned settles.
  const inFlightRef = useRef(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (submitting || inFlightRef.current) return;
    const result = onSubmit();
    if (!result) return;
    inFlightRef.current = true;
    const settle = (): void => {
      inFlightRef.current = false;
    };
    result.then(settle, settle);
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
        <FormSheetActions
          formId={formId}
          onCancel={onClose}
          submitting={submitting}
          idle={idle}
          busy={busy}
          tone={tone}
          submitDisabled={submitDisabled}
          submitGuard={submitGuard}
          start={footerStart}
        />
      }
    >
      <PromptSheetBody focusSelf={isMobile}>
        {description !== undefined && (
          <SheetDescription className="mb-4 text-base text-ink">{description}</SheetDescription>
        )}
        <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-3">
          {username !== undefined && (
            <input type="email" name="username" autoComplete="username" value={username} readOnly hidden />
          )}
          {children({ autoFocus: !isMobile })}
          <FormError message={formError} />
        </form>
      </PromptSheetBody>
    </BottomSheet>
  );
}
