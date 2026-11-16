import { useState } from "react";

/**
 * The last non-null `value`, kept after `value` goes null so a sheet can
 * animate out with its content intact. Replaced by the next non-null value.
 *
 * A caller keeps its overlay mounted while this returns something, and
 * drives the overlay's `open` from `value` itself:
 *
 * ```tsx
 * const shown = useRetainedValue(target);
 * {shown && <Sheet open={target !== null} txn={shown.txn} onClose={() => setTarget(null)} />}
 * ```
 *
 * State set during render (React's "storing information from previous
 * renders" pattern), not a ref written during render, so a render that React
 * throws away cannot leave a value behind.
 */
export function useRetainedValue<T>(value: T | null): T | null {
  const [retained, setRetained] = useState<T | null>(value);
  if (value !== null && value !== retained) setRetained(value);
  return value ?? retained;
}
