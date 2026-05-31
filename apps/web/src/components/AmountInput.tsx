// Text-typed amount input over a numeric model. We do not use type="number"
// because it fights commas/dots and Finnish locale. Empty string maps to null;
// otherwise Number(trimmed) — we use Number rather than parseFloat because
// parseFloat is permissive ("1abc" → 1) which silently accepts garbage on
// desktop. Number returns NaN for any non-numeric suffix, triggering the
// existing revert-to-canonical-on-NaN path. NaN-on-blur reverts to the
// previous valid value (held in the parent state and re-pushed into the
// local string on next render).
//
// NOTE: `useState(initial)` does not re-sync if the parent pushes a new
// `value` mid-mount. Today nothing programmatically changes the amount while
// the input is mounted, so this is fine — but flag for any future feature
// that does (e.g. autoscale-on-servings-change).
import { useState } from "react";
import { formatRecipeAmount } from "../lib/amount.js";

export function AmountInput({
  value,
  onChange,
  className,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  className?: string;
}): JSX.Element {
  const canonical = value === null ? "" : formatRecipeAmount(value);
  const [text, setText] = useState<string>(canonical);

  return (
    <input
      className={className ?? "px-3 py-2 rounded-lg border bg-transparent text-sm"}
      style={{ borderColor: "var(--rule)" }}
      placeholder="Määrä"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        const trimmed = next.trim().replace(",", ".");
        if (trimmed === "") {
          onChange(null);
          return;
        }
        const parsed = Number(trimmed);
        if (!Number.isNaN(parsed)) onChange(parsed);
      }}
      onBlur={() => {
        const trimmed = text.trim().replace(",", ".");
        if (trimmed === "") {
          onChange(null);
          setText("");
          return;
        }
        const parsed = Number(trimmed);
        if (Number.isNaN(parsed)) {
          // Revert local string to last known canonical value.
          setText(canonical);
          return;
        }
        // Normalize displayed text to the canonical formatting.
        setText(formatRecipeAmount(parsed));
      }}
    />
  );
}
