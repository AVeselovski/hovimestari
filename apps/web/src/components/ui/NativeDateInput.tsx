"use client";

import { fieldErrorClass, fieldHintClass, inputClass, lineRoom } from "@/components/ui/styles";
import { useLayoutEffect, useRef, type InputHTMLAttributes, type ReactElement } from "react";

// ---------------------------------------------------------------------------
// NativeDateInput: the platform's own date field, `<input type="date">`, so a
// phone opens its own picker. Lifted from finanssi.
//
// React does not control this input. React keeps a controlled input's
// `value` attribute equal to its value, and the Reset in iOS Safari's date
// picker puts the field back to that attribute rather than emptying it, so a
// picked date could not be removed on an iPhone. The attribute stays empty,
// and `value` is written to the element whenever the two differ.
//
// The field's width on iOS is handled in globals.css (the `input[type="date"]`
// rules): real iOS Safari sizes it from its own intrinsic width otherwise.
//
// The form checks the date itself. Every form here is `noValidate`, so the
// browser's own bubble never shows. The caller passes the line to show in
// `error`, or a note about the date in `hint`, and the field keeps that
// line's room whether or not it is empty. An error wins over a hint. The hint
// sits in a live span of its own (`dateHintId`), which another control can
// name as its description.
// ---------------------------------------------------------------------------

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange" | "className" | "id"
>;

export interface NativeDateInputProps extends NativeInputProps {
  id: string;
  /** `YYYY-MM-DD`, or "" when empty. */
  value: string;
  /** Every change, "" when the field was emptied. */
  onValueChange: (value: string) => void;
  /** The form's line under the field, or null. */
  error?: string | null;
  /** A note about the date chosen, in the same line while there is no error. */
  hint?: string | null;
}

/**
 * The id of the span that holds a date field's hint, for a control the hint
 * explains (the Eaten or planned group's `reasonId`). Empty while the line
 * shows an error, so an error is never read as that control's reason.
 */
export function dateHintId(id: string): string {
  return `${id}-line-hint`;
}

export function NativeDateInput({
  id,
  value,
  onValueChange,
  error = null,
  hint = null,
  "aria-describedby": describedBy,
  ...rest
}: NativeDateInputProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  // The value, written to the element directly (see above), before paint.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && el.value !== value) el.value = value;
  });

  const lineId = `${id}-line`;
  const line = error ?? hint;
  return (
    <>
      {/* The caller's attributes first, so none overrides what the field owns. */}
      <input
        {...rest}
        ref={inputRef}
        id={id}
        type="date"
        onChange={(e) => onValueChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[describedBy, line ? lineId : null].filter(Boolean).join(" ") || undefined}
        className={inputClass}
      />
      {/* Always there, so a line appearing moves nothing below it. Only the
          hint is announced as it changes, from its own span: an error is
          read as the field's description, as every field's error is. */}
      <p id={lineId} className={`${error ? fieldErrorClass : fieldHintClass} ${lineRoom}`}>
        {error}
        <span id={dateHintId(id)} aria-live="polite">
          {error ? null : hint}
        </span>
      </p>
    </>
  );
}
