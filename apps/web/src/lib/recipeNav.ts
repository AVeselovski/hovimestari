import { BOUND_KEYS, type FigureBounds } from "@/components/recipes/recipeListFilter";
import { RECIPE_SORTS, type RecipeSort } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// What the Recipes tab, the Day tab and the recipe page need to know about a
// navigation between them.
//
// - Whether the recipe page was opened from inside the app (a recipe row, or
//   an entry's Open recipe), so Back goes back to that place as it was.
//   Opened by its address, Back goes to the Recipes tab. The page asks once,
//   as it mounts.
// - Which row of the Recipes tab takes focus as the list shows again after a
//   delete: the next row by name, else the one before, else New recipe.
// - Where a page was when a press on it left for a recipe. The Recipes tab:
//   its search, its chips, its sort and figure filter, whether Archived
//   recipes was open, how far it was scrolled and which row was pressed. The
//   Day tab: its scroll and the entry whose sheet held Open recipe, or no
//   entry when the log sheet's recipe view held it.
//
// A place is kept on the browser's history entry of the page that was left,
// in that entry's state, written once as the press leaves. So it is there
// exactly when that entry shows again: by the page's Back, the browser's
// back, or a swipe. A page reached any other way, such as by the tab bar,
// is a new entry with no place, and opens fresh at its top. The page that
// comes back reads its place as it mounts and forgets it once it has used
// it, so a place serves one way back. A page whose data is not there at its
// first layout forgets its place unused and opens at its top: a scroll and a
// focus that land seconds later would take the page from a person already
// using it. Nothing is listened for and nothing is held in memory, so no
// place can be handed to another navigation.
// ---------------------------------------------------------------------------

let openedInApp = false;
let focusNext: string | null = null;

/** A recipe row or an entry's Open recipe was pressed. */
export function markOpenedInApp(): void {
  openedInApp = true;
}

/** Whether the page was opened from inside the app. Asking clears it. */
export function takeOpenedInApp(): boolean {
  const was = openedInApp;
  openedInApp = false;
  return was;
}

/** The recipe whose row takes focus when the Recipes tab shows its list, or "new" for New recipe. */
export function setFocusAfterDelete(target: string): void {
  focusNext = target;
}

/** The focus a delete asked for, once. */
export function takeFocusAfterDelete(): string | null {
  const target = focusNext;
  focusNext = null;
  return target;
}

/**
 * Whether a press on a link opens it here: the main button with no modifier
 * key. Any other press opens the link elsewhere, in a new tab or window, and
 * this page stays as it is.
 */
export function isPlainPress(e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** The page's scroller, `<main>`. */
const main = (): HTMLElement | null => document.querySelector("main");

/** The Recipes tab's list as a row left it. */
export interface ListPlace {
  /** What the recipes' search field held. */
  query: string;
  /** Whether the Favourites chip was pressed. */
  favourites: boolean;
  /** The tag chips pressed. */
  tags: string[];
  /** The order chosen in the filter sheet. */
  sort: RecipeSort;
  /** The figure filter in force: each bound per serving that is set. */
  bounds: FigureBounds;
  /** Whether Archived recipes was open. */
  archivedOpen: boolean;
  /** How far the page was scrolled. */
  top: number;
  /** The recipe whose row was pressed. */
  rowId: string;
}

/** The Day tab as an entry's Open recipe left it. */
export interface DayPlace {
  /** How far the page was scrolled. */
  top: number;
  /** The entry whose sheet was open, or null when the log sheet's recipe view was. */
  entryId: string | null;
}

const LIST_KEY = "hoviRecipeList";
const DAY_KEY = "hoviDay";

/**
 * Writes `place` on the history entry now showing, beside what the router keeps there. Null takes it off.
 *
 * This relies on how the router treats `history.state`, read in Next 16.4.6's source: its patched
 * `replaceState` passes a state that already carries its own keys straight through, it keeps custom keys
 * on a restore, and a `router.push` leaves the old entry's state as it was. None of that is a documented
 * contract. Read it again on every Next upgrade, and run the way-back checks in a real browser.
 */
function keep(key: string, place: ListPlace | DayPlace | null): void {
  const state: unknown = window.history.state;
  const next: Record<string, unknown> = { ...(typeof state === "object" && state !== null ? state : {}) };
  if (place === null) {
    if (!(key in next)) return;
    delete next[key];
  } else next[key] = place;
  window.history.replaceState(next, "");
}

/** What the history entry now showing holds under `key`, when it is an object. */
function read(key: string): Record<string, unknown> | null {
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null) return null;
  const place = (state as Record<string, unknown>)[key];
  return typeof place === "object" && place !== null ? (place as Record<string, unknown>) : null;
}

/** A recipe row was pressed: the list as it is, and how far it is scrolled, stay with this history entry. */
export function keepListPlace(place: Omit<ListPlace, "top">): void {
  keep(LIST_KEY, { ...place, top: main()?.scrollTop ?? 0 });
}

/** The list as a row left it, when this history entry is the one that row was pressed on. */
export function readListPlace(): ListPlace | null {
  const place = read(LIST_KEY);
  if (place === null || typeof place.rowId !== "string" || typeof place.top !== "number") return null;
  return {
    query: typeof place.query === "string" ? place.query : "",
    favourites: place.favourites === true,
    tags: Array.isArray(place.tags) ? place.tags.filter((tag): tag is string => typeof tag === "string") : [],
    sort: RECIPE_SORTS.find((sort) => sort === place.sort) ?? "name",
    bounds: boundsOf(place.bounds),
    archivedOpen: place.archivedOpen === true,
    top: place.top,
    rowId: place.rowId,
  };
}

/** The bounds a kept place holds: each one that is a number from 0 up. */
function boundsOf(kept: unknown): FigureBounds {
  const bounds: FigureBounds = {};
  if (typeof kept !== "object" || kept === null) return bounds;
  for (const key of BOUND_KEYS) {
    const value = (kept as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) bounds[key] = value;
  }
  return bounds;
}

/** The list has used its place. */
export function forgetListPlace(): void {
  keep(LIST_KEY, null);
}

/**
 * An entry's Open recipe was pressed, or the log sheet's with no entry: the day's scroll and the entry stay with
 * this history entry.
 */
export function keepDayPlace(entryId: string | null): void {
  keep(DAY_KEY, { entryId, top: main()?.scrollTop ?? 0 });
}

/** The day as Open recipe left it, when this history entry is the one it was pressed on. */
export function readDayPlace(): DayPlace | null {
  const place = read(DAY_KEY);
  if (place === null || typeof place.top !== "number") return null;
  if (typeof place.entryId !== "string" && place.entryId !== null) return null;
  return { entryId: place.entryId, top: place.top };
}

/** The day has used its place. */
export function forgetDayPlace(): void {
  keep(DAY_KEY, null);
}

/** Scrolls the page to where a kept place had it. */
export function scrollPageTo(top: number): void {
  main()?.scrollTo({ top });
}

/** The recipe page opens at its top, whatever the page before it scrolled. */
export function scrollPageToTop(): void {
  scrollPageTo(0);
}
