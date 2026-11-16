import { useCallback, useState } from "react";

export interface FormDirty {
  /** The input differs from the baseline. */
  dirty: boolean;
  /**
   * Takes the baseline again, at the next render where `ready` is true. For
   * input that has just been saved, or prefilled anew, while the form stays
   * open: what is on screen then is the new clean state.
   */
  rebase: () => void;
}

/**
 * Whether a form holds unsaved input: true once `snapshot` differs from the
 * snapshot taken at the first render where `ready` is true, and false again
 * if the input goes back to exactly that.
 *
 * `snapshot` is a serialisation of every field the user can change (a
 * `JSON.stringify` of them), and nothing the user did not type: fetched
 * lists, touched flags, errors. `ready` lets a form that prefills itself in
 * an effect (edit, duplicate) wait for that prefill to land, so the prefilled
 * values are the baseline rather than a change. A form with nothing to
 * prefill passes `true` from the start.
 *
 * The baseline is state set during render (React's "storing information from
 * previous renders" pattern), so the render that first sees `ready` already
 * returns a clean result. `rebase` clears it, so the next such render takes
 * it again. Called in the same batch as the updates it follows, the baseline
 * it takes includes them.
 */
export function useFormDirty(snapshot: string, ready: boolean): FormDirty {
  const [baseline, setBaseline] = useState<string | null>(ready ? snapshot : null);
  if (ready && baseline === null) setBaseline(snapshot);
  const rebase = useCallback(() => setBaseline(null), []);
  return { dirty: baseline !== null && snapshot !== baseline, rebase };
}
