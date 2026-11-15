import { fieldErrorClass, fieldHintClass, inputClass, labelClass } from "@/components/ui/styles";
import type { InputHTMLAttributes, ReactElement } from "react";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id" | "name"> {
  id: string;
  /** The field's name, which password managers read alongside `autoComplete`. */
  name: string;
  label: string;
  hint?: string;
  error?: string | null;
}

/**
 * A labelled input with one line under it for its hint or its error. The
 * line is always there, so an error appearing moves nothing below it.
 */
export function Field({ id, label, hint, error, ...input }: FieldProps): ReactElement {
  const lineId = `${id}-line`;
  const line = error ?? hint;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={line ? lineId : undefined}
        {...input}
      />
      <p id={lineId} className={`${error ? fieldErrorClass : fieldHintClass} min-h-5`}>
        {line}
      </p>
    </div>
  );
}
