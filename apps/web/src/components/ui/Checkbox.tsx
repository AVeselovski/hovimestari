"use client";

import { focusRing } from "@/components/ui/styles";
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Checkbox: the app's one checkbox. Lifted from finanssi and re-skinned.
//
// The box is drawn, not borrowed: `appearance-none` on a real
// `<input type="checkbox">`, with the tick as a sibling SVG that shows by
// `peer-checked`. The input stays a real checkbox, with the browser's focus,
// keyboard and role, and nothing about its size or colour is left to the
// browser. Ticked, the box is the accent: selected is not the same as on
// target, so no macro's hue ever marks a selection.
//
// `indeterminate` draws a dash for a partial selection, such as "All
// entries" with some ticked. It is a DOM property, written after render.
//
// With `children`, the whole thing is a `<label>`, so the text is part of the
// press target. `className` then styles the label. Without children only the
// box renders, and `aria-label` names it.
// ---------------------------------------------------------------------------

const TICK_PATH = "M3.5 8.5l3 3 6-6.5";
const DASH_PATH = "M4 8h8";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  /** Partial selection: a dash instead of the tick. */
  indeterminate?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  /** Extra classes: for the `<label>` with children, for the box without. */
  className?: string;
  children?: ReactNode;
}

export function Checkbox({
  checked,
  onChange,
  id,
  disabled,
  indeterminate = false,
  className = "",
  children,
  ...aria
}: CheckboxProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  // A DOM property, not an attribute: JSX cannot set it.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const box = (
    <span className="relative inline-flex shrink-0 align-middle">
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        {...aria}
        className={[
          "peer size-5 appearance-none rounded-sm border-2 border-field-rule bg-surface-raised transition-colors duration-150",
          "checked:border-accent checked:bg-accent indeterminate:border-accent indeterminate:bg-accent",
          "hover:border-ink aria-invalid:border-accent",
          focusRing,
          "disabled:cursor-not-allowed disabled:opacity-60",
          disabled ? "" : "cursor-pointer",
        ].join(" ")}
      />
      {/* Over the input and ignoring presses, so every press lands on the
          input. `peer-checked` must sit on the input's own sibling: the
          selector cannot reach a descendant. */}
      <span
        className={[
          "pointer-events-none absolute inset-0 flex items-center justify-center text-on-accent",
          indeterminate ? "opacity-100" : "opacity-0 peer-checked:opacity-100",
        ].join(" ")}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5">
          <path
            d={indeterminate ? DASH_PATH : TICK_PATH}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );

  if (children === undefined) return <span className={className}>{box}</span>;

  return (
    <label
      htmlFor={id}
      className={[disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer", className].filter(Boolean).join(" ")}
    >
      {box}
      {children}
    </label>
  );
}
