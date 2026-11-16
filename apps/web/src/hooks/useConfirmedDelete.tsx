"use client";

import { ConfirmDialog, type ConfirmLabels } from "@/components/ui/ConfirmDialog";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useRetainedValue } from "@/hooks/useRetainedValue";
import { focusAfterRowRemoval } from "@/lib/focusAfterRemoval";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// useConfirmedDelete: the "are you sure?" step in front of a write that takes
// a row off the page, and the write behind it. A delete mostly, but also a
// revoke or a pause that moves a row elsewhere.
//
// It holds what every such confirmation needs, once:
//
// - The target waiting for an answer, and the last one it showed, so the
//   dialog slides out with its text intact (`useRetainedValue`).
// - The control that opened it, passed explicitly. Safari on an iPhone does
//   not focus a tapped button, so the dialog cannot capture it on its own.
//   Cancel returns focus there.
// - The busy state. While the write runs every way out is refused. After a
//   write that worked it stays busy while the dialog slides out, so the
//   button does not flash back to its idle label on the way.
// - The failure, shown inside the dialog as the catalog's line for its error
//   code, where it is not hidden behind the dimmed page. The dialog stays open, so pressing
//   the button again retries.
// - Where focus goes after a write that worked. The opener's row is about to
//   leave the page, so focus moves to the same control in the next row, else
//   the row before, else what `focusAfter` names (lib/focusAfterRemoval.ts).
//   It is read while the row is still there.
// ---------------------------------------------------------------------------

/** What the confirmation says for one target. The button's labels default to "Delete" and "Deleting…". */
export type ConfirmedDeleteCopy = ConfirmLabels & {
  title: string;
  message: string;
  /** A second line under the message. */
  note?: string | null;
  /** "danger" (default) for a delete, "primary" for a reversible action such as pausing. */
  tone?: "danger" | "primary";
};

export interface ConfirmedDeleteOptions<T, R> {
  /** The wording for a target. Called for the target on screen, also while it slides out. */
  copy: (target: T) => ConfirmedDeleteCopy;
  /** The write. A rejection keeps the dialog open with its reason. */
  run: (target: T) => Promise<R>;
  /**
   * What the dialog says when the write fails. Default: the catalog's line
   * for the failure's error code (`useErrorCopy`).
   */
  errorText?: (err: unknown, target: T) => string;
  /** After a write that worked, in the same update that closes the dialog. */
  onDone?: (result: R, target: T) => void;
  /**
   * After a write that failed, as the dialog shows why. For a refusal that
   * says the page is out of date, such as a row another device removed: the
   * caller refreshes what it shows.
   */
  onError?: (err: unknown, target: T) => void;
  /**
   * Where focus goes after a write that worked when the opener's row has no
   * neighbour to take it: a control that stays, such as the page's search
   * field. Read while the row is still on the page. Default: none.
   */
  focusFallback?: (opener: HTMLElement | null) => HTMLElement | null;
  /**
   * Where focus goes after a write that worked, in place of the default rule.
   * Called while the opener's row is still on the page. Default: the same
   * control in the next row, else the row before, else `focusFallback`
   * (`focusAfterRowRemoval`).
   */
  focusAfter?: (opener: HTMLElement | null, target: T) => HTMLElement | null;
}

export interface ConfirmedDelete<T> {
  /** Asks about `target`. `opener` is the control pressed, where Cancel returns focus. */
  open: (target: T, opener: HTMLElement | null) => void;
  /** Closes it if `matches` holds for the target waiting, unless its write is running. */
  closeIf: (matches: (target: T) => boolean) => void;
  /** The target waiting for an answer, or null. */
  pending: T | null;
  /** The target the dialog shows, kept while it slides out. */
  shown: T | null;
  /** The target whose write is running now. Current within the same tick. */
  running: () => T | null;
  /** The confirmation, while it is open or sliding out. Render it once. */
  dialog: ReactNode;
}

interface Open<T> {
  target: T;
  opener: HTMLElement | null;
  /** Per open, so every open mounts a fresh dialog. */
  key: number;
}

/** What one open's write has come to. Keyed, so a late answer never lands on a later open. */
interface Outcome {
  key: number;
  busy: boolean;
  error: string | null;
  /** Where focus goes as the dialog closes after the write worked. */
  focusAfter: HTMLElement | null;
}

/** The button's labels from a target's copy, both or neither. */
function labelsOf(copy: ConfirmLabels): ConfirmLabels {
  return copy.confirmLabel === undefined ? {} : { confirmLabel: copy.confirmLabel, busyLabel: copy.busyLabel };
}

export function useConfirmedDelete<T, R = unknown>(options: ConfirmedDeleteOptions<T, R>): ConfirmedDelete<T> {
  const { copy, run, errorText, onDone, onError, focusFallback, focusAfter } = options;
  const { forError } = useErrorCopy();
  const [pending, setPending] = useState<Open<T> | null>(null);
  const shown = useRetainedValue(pending);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const keyRef = useRef(0);
  // The dialog's key is this instance's id plus the open counter. React
  // matches keyed siblings by key, not by slot, and every instance counts its
  // opens from 1. Without the id, two confirmations rendered side by side
  // (the Buckets page's bucket and category deletes) would share a key, and
  // React would hand one's dialog to the other.
  const instanceId = useId();
  const runningRef = useRef<Open<T> | null>(null);

  const open = useCallback((target: T, opener: HTMLElement | null) => {
    setPending({ target, opener, key: ++keyRef.current });
  }, []);

  const closeIf = useCallback((matches: (target: T) => boolean) => {
    setPending((prev) => (prev && prev !== runningRef.current && matches(prev.target) ? null : prev));
  }, []);

  const running = useCallback(() => runningRef.current?.target ?? null, []);

  const nextFocus = (current: Open<T>): HTMLElement | null =>
    focusAfter
      ? focusAfter(current.opener, current.target)
      : focusAfterRowRemoval(current.opener, focusFallback?.(current.opener) ?? null);

  /** A late answer never replaces what a later open has come to. */
  const settle = (next: Outcome) => setOutcome((prev) => (prev && prev.key > next.key ? prev : next));

  async function confirm(): Promise<void> {
    const current = pending;
    if (!current || runningRef.current?.key === current.key) return;
    runningRef.current = current;
    const { key } = current;
    setOutcome({ key, busy: true, error: null, focusAfter: null });
    // Read now as well as after: a refresh may take the row before the answer.
    const planned = nextFocus(current);
    let result: R;
    try {
      result = await run(current.target);
    } catch (err: unknown) {
      if (runningRef.current === current) runningRef.current = null;
      settle({ key, busy: false, error: errorText ? errorText(err, current.target) : forError(err), focusAfter: null });
      onError?.(err, current.target);
      return;
    }
    if (runningRef.current === current) runningRef.current = null;
    // Still busy: the dialog slides out showing what was on screen.
    settle({ key, busy: true, error: null, focusAfter: current.opener?.isConnected ? nextFocus(current) : planned });
    setPending((prev) => (prev?.key === key ? null : prev));
    onDone?.(result, current.target);
  }

  const text = shown ? copy(shown.target) : null;
  const own = outcome && shown && outcome.key === shown.key ? outcome : null;
  const dialog = shown && text && (
    <ConfirmDialog
      key={`${instanceId}:${shown.key}`}
      open={pending?.key === shown.key}
      title={text.title}
      message={text.message}
      note={text.note ?? null}
      {...labelsOf(text)}
      tone={text.tone}
      isLoading={own?.busy ?? false}
      error={own?.error ?? null}
      returnFocusTo={own?.focusAfter ?? shown.opener}
      onConfirm={() => void confirm()}
      onCancel={() => setPending(null)}
    />
  );

  return {
    open,
    closeIf,
    pending: pending?.target ?? null,
    shown: shown?.target ?? null,
    running,
    dialog,
  };
}
