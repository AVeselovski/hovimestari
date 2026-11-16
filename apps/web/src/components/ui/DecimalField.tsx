import { fieldErrorClass, fieldHintClass, inputClass, labelClass } from "@/components/ui/styles";
import type { InputHTMLAttributes, ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// DecimalField: a labelled number field with its unit inside it, on the
// right. A text input with an `inputMode`, never `type="number"`, which
// refuses the comma a Finnish keypad types. The caller parses what is typed
// with `parseDecimalInput` (lib/decimalInput.ts). 16px text, so iOS never
// zooms on focus. No placeholder: an example number in a field is a number
// the app suggests.
//
// A field keeps one line under it for its hint or its error, so an error
// appearing moves nothing below it. A pair of fields that shares one line,
// such as a range's lower and upper bound, passes `line={undefined}` and
// points `describedBy` at the shared line instead.
// ---------------------------------------------------------------------------

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "className" | "id" | "name" | "inputMode" | "placeholder" | "value" | "onChange" | "enterKeyHint"
>;

export interface DecimalFieldProps extends InputProps {
  id: string;
  name: string;
  label: string;
  /** The unit, such as "kcal" or "g", shown in the field and read after its label. */
  unit: string;
  /** "numeric" for whole numbers, "decimal" where a decimal is likely. Both accept "," and ".". */
  inputMode: "numeric" | "decimal";
  value: string;
  onValueChange: (raw: string) => void;
  /** The label of the keyboard's Enter key: "next" (default) while a field follows, "done" or "go" on the last. */
  enterKeyHint?: "next" | "done" | "go";
  /** The field holds an error, shown in its own line or in the shared one. */
  invalid?: boolean;
  /** The id of a line shared with other fields. */
  describedBy?: string;
  /** The field's own line: its hint, or its error with `invalid`. Left out, the field has no line of its own. */
  line?: ReactNode;
}

export function DecimalField({
  id,
  label,
  unit,
  inputMode,
  value,
  onValueChange,
  enterKeyHint = "next",
  invalid = false,
  describedBy,
  line,
  ...input
}: DecimalFieldProps): ReactElement {
  const unitId = `${id}-unit`;
  const lineId = `${id}-line`;
  const describedByIds = [unitId, describedBy, line !== undefined ? lineId : null].filter(Boolean).join(" ");
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          {...input}
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          enterKeyHint={enterKeyHint}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedByIds}
          className={`${inputClass} pr-14 font-mono tabular-nums`}
        />
        <span
          id={unitId}
          className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-base text-ink-muted"
        >
          {unit}
        </span>
      </div>
      {line !== undefined && (
        <p id={lineId} className={`${invalid ? fieldErrorClass : fieldHintClass} min-h-5`}>
          {line}
        </p>
      )}
    </div>
  );
}
