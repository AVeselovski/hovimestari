"use client";

import {
  fieldErrorClass,
  fieldHintClass,
  labelClass,
  lineRoom,
  textareaClass,
  textareaShortClass,
} from "@/components/ui/styles";
import type { ReactElement } from "react";

/**
 * A labelled text area with its line: the hint, or the refusal in its place,
 * its room always kept. The recipe editor's Method and Notes. `short` is the
 * lower box, for a few lines of notes.
 */
export function ProseField({
  id,
  name,
  label,
  value,
  onChange,
  rows,
  short = false,
  hint,
  error,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  short?: boolean;
  hint?: string;
  /** The refusal, in place of the hint. */
  error: string | null;
}): ReactElement {
  const lineId = `${id}-line`;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error !== null || undefined}
        aria-describedby={lineId}
        className={short ? textareaShortClass : textareaClass}
      />
      <p id={lineId} className={`${error !== null ? fieldErrorClass : fieldHintClass} ${lineRoom}`}>
        {error ?? hint ?? null}
      </p>
    </div>
  );
}
