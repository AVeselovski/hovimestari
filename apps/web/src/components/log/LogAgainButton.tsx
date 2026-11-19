"use client";

import { Icon } from "@/components/Icon";
import { busyRing, focusRing } from "@/components/ui/styles";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// LogAgainButton: the "+" at the end of a recent or favourite row, which logs
// the item again with its last amount in one press. A 44 px button of its
// own, beside the row's button, never inside it. While its add runs a busy
// ring turns inside the same box, and while any add runs, or the app asks
// for today, every "+" ignores a press (`aria-disabled`, never `disabled`,
// so focus stays on it).
// ---------------------------------------------------------------------------

export interface LogAgainButtonProps {
  /** "Log Rahka again, 200 g", or "Plan Rahka, 200 g" on a future day. */
  label: string;
  /** This button's add is on its way. */
  busy: boolean;
  /** A press does nothing: another add runs, or writes wait. */
  unavailable: boolean;
  onPress: () => void;
}

export function LogAgainButton({ label, busy, unavailable, onPress }: LogAgainButtonProps): ReactElement {
  const off = busy || unavailable;
  return (
    <button
      type="button"
      data-log-again=""
      aria-label={label}
      aria-disabled={off || undefined}
      aria-busy={busy || undefined}
      onClick={() => {
        if (!off) onPress();
      }}
      className={`relative flex size-11 shrink-0 items-center justify-center rounded-pill border border-field-rule bg-surface-raised text-ink hover:bg-surface active:bg-surface aria-disabled:cursor-not-allowed ${busy ? "" : "aria-disabled:opacity-60"} ${focusRing}`}
    >
      <Icon name="plus" className="size-5" strokeWidth={2} />
      {busy && <span aria-hidden="true" className={`absolute -inset-px ${busyRing}`} />}
    </button>
  );
}
