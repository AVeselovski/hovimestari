import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// The day the Day tab last showed by choice, so the tab bar's Day link and
// the side rail's lead back to it. The address stays the truth: this only
// chooses where the link points.
//
// - The Day tab writes its `?date=` here whenever it changes, and null when
//   it shows today by its plain address. Null means "today, following the
//   app across midnight".
// - It lives in memory only, so a new page load starts on today, as a fresh
//   open of the app should.
// - Signing out forgets it (`AuthContext`), so the next account starts on
//   today.
// ---------------------------------------------------------------------------

let shown: string | null = null;
const listeners = new Set<() => void>();

function set(next: string | null): void {
  if (next === shown) return;
  shown = next;
  for (const listener of listeners) listener();
}

/** The Day tab shows `date` by its address, or today (null). */
export function rememberShownDay(date: string | null): void {
  set(date);
}

/** Forgets the day, so the Day link leads to today. */
export function forgetShownDay(): void {
  set(null);
}

/** The Day link's address: the day last shown by choice, else today's plain address. */
export function dayTabHref(date: string | null): string {
  return date === null ? "/" : `/?date=${date}`;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const read = (): string | null => shown;
const readOnServer = (): null => null;

/** The day the Day tab last showed by choice, or null for today. */
export function useShownDay(): string | null {
  return useSyncExternalStore(subscribe, read, readOnServer);
}
