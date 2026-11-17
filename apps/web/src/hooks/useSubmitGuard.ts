import { useCallback, useMemo, useRef } from "react";

// ---------------------------------------------------------------------------
// useSubmitGuard: the in-flight guard of a form that submits through a
// promise. A submit is refused while the promise the last one returned is
// pending, so a sheet that awaits something before it sets its own busy state
// is guarded from the first moment, and a double tap on the submit button, or
// Enter pressed twice, sends once. `FormSheet` and the log sheet's footer
// use it.
// ---------------------------------------------------------------------------

export interface SubmitGuard {
  /** True while the promise the last accepted submit returned is pending. */
  inFlight: () => boolean;
  /**
   * Runs `submit` unless one is in flight, and answers whether it ran. A
   * returned promise keeps the guard closed until it settles, either way.
   */
  run: (submit: () => void | Promise<unknown>) => boolean;
}

export function useSubmitGuard(): SubmitGuard {
  const inFlightRef = useRef(false);
  const inFlight = useCallback(() => inFlightRef.current, []);
  const run = useCallback((submit: () => void | Promise<unknown>): boolean => {
    if (inFlightRef.current) return false;
    const result = submit();
    if (!result) return true;
    inFlightRef.current = true;
    const settle = (): void => {
      inFlightRef.current = false;
    };
    result.then(settle, settle);
    return true;
  }, []);
  return useMemo(() => ({ inFlight, run }), [inFlight, run]);
}
