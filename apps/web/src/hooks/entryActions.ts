import {
  MAX_ENTRY_BATCH,
  type AddEntryBody,
  type Entry,
  type EntryPatchBody,
  type SaveAndLogBody,
  type SavedMeal,
} from "@hovimestari/types";

// ---------------------------------------------------------------------------
// The types and the plain helpers of `useEntryActions`, apart from the hook
// so that file stays the writes themselves.
// ---------------------------------------------------------------------------

export { OfflineError, unconfirmed } from "@/lib/failure";

/**
 * How a sheet's write ended: done; the entry was no longer there and the
 * sheet closes; or held, sent nothing because the app is asking for today,
 * and the sheet stays as it is.
 */
export type SheetOutcome = "done" | "gone" | "held";

/** A row to focus, once it is on screen. `n` tells two requests for one row apart. */
export interface FocusRequest {
  id: string;
  n: number;
}

/** Options for an undo. */
export interface UndoOptions {
  /** A 404 counts as undone, such as a DELETE undoing an add whose entry is already gone. */
  goneIsDone?: boolean;
  /** The row to focus once the undo is on screen, when it was pressed from the keyboard. */
  focusId?: string;
  fromKeyboard?: boolean;
}

/** One add, ready to send, with what its toast says. */
export interface AddRequest {
  /** The request, with the id the app chose for it. */
  body: AddEntryBody;
  /** The name the toast uses until the answer names the entry. */
  name: string;
  /** How the amount reads in the toast: "200 g", "1 meal". */
  amount: string;
  /** The same add with a fresh id, for "Log another". */
  again: () => AddRequest;
  /**
   * The toast names the entry's day, for an add made away from that day's
   * page, such as from a recipe's page: always for a plan, and for a log on
   * any day but today.
   */
  namesDay?: boolean;
}

/** An add the server answered. */
export interface AddDone {
  /** `replayed`: the id was already added, or added and removed since. */
  outcome: "created" | "replayed";
  /** Shows the add's toast. The log sheet calls it once it has closed. */
  announce: () => void;
}

/** A new saved meal and its first entry, sent as one request ("Save and log"). */
export interface SaveAndLogRequest {
  /** The request, with the ids the app chose for the meal and the entry. */
  body: SaveAndLogBody;
  /** The meal logged once more with a fresh id, for "Log another" after a replay. */
  again: () => AddRequest;
}

/** An id a copy was sent under, and the date it was sent to. */
export interface SentCopy {
  id: string;
  date: string;
}

/**
 * One press of the copy sheet's Copy. The sheet owns the ids: one per ticked
 * entry and date, the same ids again on a resend, so a retry never doubles a
 * copy (components/entries/CopyEntriesSheet.tsx).
 */
export interface CopyRequest {
  /** The day the entries are on, read again when one of them is gone. */
  fromDate: string;
  toDate: string;
  /** The ticked entries in day order, each with the id its copy takes. */
  entries: { sourceId: string; id: string }[];
  /**
   * Ids sent earlier in this open and not in this send, such as copies to a
   * date since changed. Removed once this send succeeds, before its toast.
   */
  stale: SentCopy[];
  /** Every id sent in this open, this send's included: what Undo removes. */
  sent: SentCopy[];
  /**
   * Called as each request of the send lands. A send of more than 100 goes
   * in several, so one that fails may have left copies on `toDate`.
   */
  onLanded?: () => void;
}

/** A copy the server answered: its toast, shown once the sheet has closed. */
export interface CopyDone {
  announce: () => void;
}

/** A "Save and log" the server answered: the meal as saved, and the add's toast. */
export interface SaveAndLogDone extends AddDone {
  meal: SavedMeal;
}

export interface EntryActions {
  /** Writes wait: the app is asking the server for today. */
  holding: boolean;
  /** The entries whose mark is being sent. */
  busyIds: ReadonlySet<string>;
  /** The row an Undo from the keyboard asks to focus. */
  focusRequest: FocusRequest | null;
  /** The row took the focus request `n`: it is not used again. */
  focusDone: (n: number) => void;
  /** Marks one entry eaten. Answers whether it was marked. */
  markOne: (entry: Entry) => Promise<boolean>;
  /** Marks every listed entry eaten, in chunks of 100 sent one after another, with one toast. */
  markAll: (entries: readonly Entry[]) => Promise<boolean>;
  /** Saves the sheet's changes. `onAnswered` runs once the server has answered, before the cache changes. */
  save: (before: Entry, patch: EntryPatchBody, onAnswered?: () => void) => Promise<SheetOutcome>;
  remove: (entry: Entry, onAnswered?: () => void) => Promise<SheetOutcome>;
  /**
   * Adds an entry. Answers "held" without sending while the app asks for
   * today, throws `OfflineError` while known offline, and throws the
   * request's own error on a failure.
   */
  add: (request: AddRequest) => Promise<AddDone | "held">;
  /** Saves a new meal and logs it in one request, as `add` does an entry. */
  saveAndLog: (request: SaveAndLogRequest) => Promise<SaveAndLogDone | "held">;
  /**
   * Removes an entry whose add may have landed, with no toast, before the
   * same press is sent again in another form. Answers true when it removed
   * one, false on a 404: nothing is there yet. Throws while known offline and
   * on any other failure.
   */
  withdrawAdd: (id: string, date: string) => Promise<boolean>;
  /**
   * Copies entries to another day as planned entries, in chunks of 100, then
   * removes the stale ids. Answers "held" without sending while the app asks
   * for today, throws `OfflineError` while known offline, and throws the
   * request's own error on a failure. The toast waits for `announce`.
   */
  copy: (request: CopyRequest) => Promise<CopyDone | "held">;
  /** Reads `dates` again, such as the day a copy that could not confirm was sent to. */
  readDaysAgain: (dates: readonly string[]) => void;
}

/** `items` in chunks of at most `MAX_ENTRY_BATCH`, in their order. */
export function chunksOf<T>(items: readonly T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += MAX_ENTRY_BATCH) chunks.push(items.slice(i, i + MAX_ENTRY_BATCH));
  return chunks;
}

/** Focuses the main button of the row for `id`, when it is on screen. Answers whether it did. */
export function focusRow(id: string): boolean {
  const row = [...document.querySelectorAll<HTMLElement>("li[data-entry-id]")].find((li) => li.dataset.entryId === id);
  const main = row?.querySelector<HTMLElement>('[data-row-action="open"]');
  if (!main) return false;
  main.focus();
  return document.activeElement === main;
}
