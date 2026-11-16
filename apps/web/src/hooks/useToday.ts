import { createContext, useContext } from "react";

// ---------------------------------------------------------------------------
// The app's today, as the server last answered it (components/targets/
// TodayProvider.tsx). Every screen that names a date relative to today reads
// it here, never from a cached answer's own `relation`, so a label never lags
// the answer it sits beside.
// ---------------------------------------------------------------------------

/** How the last check against the server went, after the device's clock said a new day may have begun. */
export type TodayConfirm = "fresh" | "checking" | "paused" | "failed";

export interface TodayState {
  /** The newest today any server answer has carried. Null until one has arrived. */
  today: string | null;
  /** An ask is in flight: writes wait, normally for under a second. */
  holding: boolean;
  confirm: TodayConfirm;
  /**
   * The device's date is past `today` and the last ask did not answer: what
   * is cached under `today` may belong to yesterday, so a view of today shows
   * the state of the ask instead.
   */
  unconfirmed: boolean;
  /** Asks the server for today again, at once. */
  retry: () => void;
}

const NO_PROVIDER: TodayState = {
  today: null,
  holding: false,
  confirm: "fresh",
  unconfirmed: false,
  retry: () => {},
};

export const TodayContext = createContext<TodayState>(NO_PROVIDER);

/** The app's today and the state of the check that keeps it current. */
export function useToday(): TodayState {
  return useContext(TodayContext);
}
