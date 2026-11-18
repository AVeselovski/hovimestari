import {
  fieldErrorClass,
  fieldHintClass,
  inputClass,
  labelBesideClass,
  labelClass,
  lineRoom,
} from "@/components/ui/styles";
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
// appearing moves nothing below it. `layout="beside"` puts the label on the
// left and a 9rem field on the right, on one row, with the line under the
// pair across the full width: a column of short figures, such as a label's
// values per 100 g, then takes one row each. A pair of fields that shares one line,
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
  /**
   * "stacked" (default): the label above the field. "beside": the label on
   * the left and the field on the right, 9rem, or 11rem when its unit can be
   * a word, so "1234,5" shows in full beside "portions".
   */
  layout?: "stacked" | "beside";
  /**
   * The longest unit the field can show, when the unit changes, such as "g"
   * and "portions". A beside field takes its width from it, so switching
   * the unit never moves the field. Defaults to `unit`.
   */
  widestUnit?: string;
}

/**
 * The room the field keeps at its end for its unit, so a long typed value
 * stops short of it and keeps the rest of the field: a one-letter unit such
 * as "g" takes 1.75rem, a short unit such as "kcal" 3rem, and a word such as
 * "portions" or "meals" (about 62 px at 16 px) 5.5rem.
 */
function unitRoom(unit: string): string {
  if (isWord(unit)) return "pr-22";
  return unit.length > 1 ? "pr-12" : "pr-7";
}

/** A unit longer than "kcal" is a word. */
const isWord = (unit: string): boolean => unit.length > 4;

/** A beside field's width: 11rem when its unit can be a word, which leaves 4.5rem for the value, else 9rem. */
export function besideWidth(widestUnit: string): string {
  return isWord(widestUnit) ? "w-44" : "w-36";
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
  layout = "stacked",
  widestUnit = unit,
  ...input
}: DecimalFieldProps): ReactElement {
  const unitId = `${id}-unit`;
  const lineId = `${id}-line`;
  const describedByIds = [unitId, describedBy, line !== undefined ? lineId : null].filter(Boolean).join(" ");
  const beside = layout === "beside";
  return (
    <div>
      <div className={beside ? "flex items-center gap-3" : undefined}>
        <label htmlFor={id} className={beside ? labelBesideClass : labelClass}>
          {label}
        </label>
        <div className={beside ? `relative ${besideWidth(widestUnit)} shrink-0` : "relative"}>
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
            className={`${inputClass} ${unitRoom(unit)} font-mono tabular-nums`}
          />
          <span
            id={unitId}
            className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-base text-ink-muted"
          >
            {unit}
          </span>
        </div>
      </div>
      {line !== undefined && (
        <p id={lineId} className={`${invalid ? fieldErrorClass : fieldHintClass} ${lineRoom}`}>
          {line}
        </p>
      )}
    </div>
  );
}
