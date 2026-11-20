// ---------------------------------------------------------------------------
// What the recipe page needs to know about how it was reached, kept for the
// page's life only, never stored.
//
// - Whether it was opened from inside the app (a recipe row, or an entry's
//   Open recipe), so Back goes back to that place as it was, with its
//   search and scroll. Opened by its address, Back goes to the Recipes tab.
// - After a delete, which row of the Recipes tab takes focus as the list
//   shows again: the next row by name, else the one before, else New recipe.
// - How far the Recipes tab was scrolled when a row opened a recipe, so Back
//   shows the list where it was. The page itself opens at its top.
// ---------------------------------------------------------------------------

let openedInApp = false;
let focusNext: string | null = null;
let listScroll: number | null = null;

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

/** The page's scroller, `<main>`. */
const main = (): HTMLElement | null => document.querySelector("main");

/** A recipe row was pressed: the list's scroll is kept for Back. */
export function keepListScroll(): void {
  listScroll = main()?.scrollTop ?? null;
}

/** Puts the list back where a row left it, once. */
export function restoreListScroll(): void {
  const top = listScroll;
  listScroll = null;
  if (top !== null) main()?.scrollTo({ top });
}

/** The recipe page opens at its top, whatever the page before it scrolled. */
export function scrollPageToTop(): void {
  main()?.scrollTo({ top: 0 });
}
