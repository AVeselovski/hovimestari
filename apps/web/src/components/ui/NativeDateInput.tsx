"use client";

import { fieldErrorClass, inputClass } from "@/components/ui/styles";
import { useLayoutEffect, useRef, type InputHTMLAttributes, type ReactElement, type ReactNode } from "react";

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
// `error`, and the field keeps that line's room whether or not it is empty.
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
  /**
   * What the line under the field says while there is no error, such as what
   * the date means. Read after the field's label, and announced as it changes.
   */
  hint?: ReactNode;
  /** The line's room, for a hint longer than one line: `min-h-10` for two. Default `min-h-5`. */
  lineRoom?: string;
}

export function NativeDateInput({
  id,
  value,
  onValueChange,
  error = null,
  hint = null,
  lineRoom = "min-h-5",
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
        aria-describedby={[describedBy, error || hint ? lineId : null].filter(Boolean).join(" ") || undefined}
        className={inputClass}
      />
      {/* Always there, so an error appearing moves nothing below it. */}
      <p
        id={lineId}
        aria-live={hint === null ? undefined : "polite"}
        className={`${error || hint === null ? fieldErrorClass : "mt-1.5 text-sm text-ink"} ${lineRoom}`}
      >
        {error ?? hint}
      </p>
    </>
  );
}
