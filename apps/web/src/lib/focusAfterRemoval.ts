/**
 * Where keyboard focus goes once a row is about to leave the page.
 *
 * A delete, a revoke or a pause takes the row that held the control the
 * reader pressed. Returning focus to that control lasts only until the list
 * refreshes, and focus then falls to `<body>`, so a keyboard user starts again
 * from the top of the page. These helpers pick a target that stays: the same
 * control in the next row, else in the row before, else a fallback the caller
 * names, such as the list's search field or the section's own action.
 *
 * A row is the nearest ancestor that is marked `data-row`, a `<tr>` or an
 * `<li>`. Its neighbours are the sibling elements of the same kind. "The same
 * control" is the one carrying the same `data-row-action` (every row menu's
 * trigger carries `data-row-action="menu"`), else the one at the same
 * position among the row's focusable controls, so Delete in one row leads to
 * Delete in the next.
 */

const CONTROLS = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The nearest row around `el`: an element marked `data-row`, a table row or a list item. */
export function rowOf(el: Element): HTMLElement | null {
  return el.closest<HTMLElement>("[data-row], tr, li");
}

function isSameKind(row: HTMLElement, other: Element): other is HTMLElement {
  if (!(other instanceof HTMLElement)) return false;
  return row.hasAttribute("data-row") ? other.hasAttribute("data-row") : other.tagName === row.tagName;
}

/** Shown on screen. A browser without `checkVisibility` (jsdom) counts everything as shown. */
export function isShown(el: HTMLElement): boolean {
  return typeof el.checkVisibility === "function" ? el.checkVisibility() : true;
}

function usable(el: HTMLElement): boolean {
  return !(el as HTMLButtonElement).disabled && isShown(el);
}

/**
 * The control in `row` that matches the opener: the same `data-row-action`,
 * else the same position, else the row's first usable control.
 */
function matchingControl(row: HTMLElement, action: string | null, position: number): HTMLElement | null {
  if (action !== null) {
    const named = Array.from(row.querySelectorAll<HTMLElement>("[data-row-action]")).find(
      (el) => el.getAttribute("data-row-action") === action && usable(el),
    );
    if (named) return named;
  }
  const controls = Array.from(row.querySelectorAll<HTMLElement>(CONTROLS));
  const same = controls[position];
  if (same && usable(same)) return same;
  return controls.find(usable) ?? null;
}

function neighbour(row: HTMLElement, step: "next" | "previous"): HTMLElement | null {
  let at = step === "next" ? row.nextElementSibling : row.previousElementSibling;
  while (at) {
    if (isSameKind(row, at) && isShown(at)) return at;
    at = step === "next" ? at.nextElementSibling : at.previousElementSibling;
  }
  return null;
}

/**
 * The control that should take focus once the row holding `opener` is gone:
 * the same control in the next row, else the previous row, else `fallback`.
 * Read it while the row is still on the page.
 */
export function focusAfterRowRemoval(
  opener: HTMLElement | null | undefined,
  fallback: HTMLElement | null = null,
): HTMLElement | null {
  if (!opener?.isConnected) return fallback;
  const row = rowOf(opener);
  if (!row) return fallback;
  const action = opener.getAttribute("data-row-action");
  const position = Array.from(row.querySelectorAll<HTMLElement>(CONTROLS)).indexOf(opener);
  for (const step of ["next", "previous"] as const) {
    const other = neighbour(row, step);
    const control = other && matchingControl(other, action, Math.max(position, 0));
    if (control) return control;
  }
  return fallback;
}
