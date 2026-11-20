// ---------------------------------------------------------------------------
// Where Tab goes from the top-most open sheet, so it never leaves it.
//
// Base UI's modal Drawer traps focus with two focus guards around the popup.
// A guard that takes focus moves it on to the far end of the popup one
// animation frame later (`enqueueFocus` in its FloatingFocusManager). A second
// Tab inside that frame, from voice control ("press Tab five times"), a
// keyboard macro, or a held key on a phone whose frame runs long, finds the guard
// still focused and walks on: to <body>, then the page behind the sheet, which
// a screen reader is told is not there. Shift+Tab from a stacked sheet walks
// into the sheet under it the same way.
//
// So the sheet wraps Tab itself at its two ends, in the same keydown, and
// focus never reaches a guard by Tab. Base UI's guards stay as they are, for
// a screen reader's virtual cursor. `useSheetTabWrap` runs this.
// ---------------------------------------------------------------------------

const CANDIDATES = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "iframe",
  "summary",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]",
].join(",");

/** Where the toast region is: focus there is the toast's own, reached by F6 and handed back by Base UI. */
export const TOAST_REGION_SELECTOR = "[data-toast-region]";

/**
 * Native fields whose own segments (month, day, year; hours, minutes) take
 * Tab and Shift+Tab before the key leaves them. The page cannot tell which
 * segment has focus: they sit in the browser's closed shadow tree.
 */
const SEGMENTED_TYPES = new Set(["date", "time", "datetime-local", "month", "week"]);

const takesTabItself = (el: Element | null): boolean => el instanceof HTMLInputElement && SEGMENTED_TYPES.has(el.type);

/**
 * Whether the element is rendered. The browser answers with
 * `checkVisibility`, which also sees a closed `<details>` and
 * `content-visibility: hidden`. jsdom has none, so there a `hidden` or
 * `display: none` on the element or an ancestor decides.
 */
function isShown(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === "function") return el.checkVisibility({ visibilityProperty: true });
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.hidden || getComputedStyle(node).display === "none") return false;
  }
  return true;
}

const namedRadio = (el: HTMLElement): HTMLInputElement | null =>
  el instanceof HTMLInputElement && el.type === "radio" && el.name !== "" ? el : null;

/**
 * A radio in a named group is a Tab stop only when it is the checked one, or
 * none is checked and it is the first of `focusable`, the group's radios Tab
 * can reach at all.
 */
function isRadioStop(el: HTMLElement, focusable: readonly HTMLElement[]): boolean {
  const radio = namedRadio(el);
  if (!radio) return true;
  const group = focusable.filter((x) => {
    const other = namedRadio(x);
    return other !== null && other.name === radio.name && other.form === radio.form;
  });
  const checked = group.find((x) => (x as HTMLInputElement).checked);
  return checked ? checked === el : group[0] === el;
}

/**
 * The elements Tab stops on inside `root`, in document order. It mirrors
 * Base UI's own `tabbable` rule, which the library does not export, for the
 * controls a sheet holds. Like Base UI's, it reads the order from the
 * document, so a positive `tabindex` is not ordered first. It leaves out
 * shadow roots and slots, which no sheet uses.
 */
export function tabStops(root: HTMLElement): HTMLElement[] {
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(CANDIDATES)).filter(
    (el) =>
      !el.matches(":disabled") &&
      !(el instanceof HTMLInputElement && el.type === "hidden") &&
      !el.hasAttribute("data-base-ui-focus-guard") &&
      el.closest("[inert]") === null &&
      isShown(el),
  );
  return focusable.filter((el) => el.tabIndex >= 0 && isRadioStop(el, focusable));
}

const follows = (a: Node, b: Node): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/**
 * Where a Tab (or Shift+Tab, `back`) from `active` must go to stay in
 * `popup`, or null where the browser's own move already stays inside it:
 *
 * - from the last stop, Tab goes to the first; from the first, Shift+Tab to
 *   the last, also from the popup itself or a focusable that is not a stop;
 * - from anywhere outside the popup (<body>, the page, the sheet under a
 *   stacked one, a focus guard), Tab goes to the first and Shift+Tab to the
 *   last;
 * - in the toast region the toast keeps the key: Base UI hands focus back to
 *   where it came from when Tab leaves it;
 * - a date or time field keeps the key, at an end too, because Tab moves
 *   between its segments first. When it leaves the field at the sheet's end,
 *   the browser lands it on Base UI's guard, and the next Tab, however soon,
 *   comes from outside the popup and is wrapped by the rule above.
 *
 * With no stop at all, focus outside goes to the popup and a Tab inside is
 * left to Base UI, which stops it.
 */
export function sheetTabTarget(popup: HTMLElement, active: Element | null, back: boolean): HTMLElement | null {
  if (active?.closest(TOAST_REGION_SELECTOR)) return null;
  const stops = tabStops(popup);
  const inside = active !== null && popup.contains(active);
  if (stops.length === 0) return inside ? null : popup;
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!inside) return back ? last : first;
  if (takesTabItself(active)) return null;
  if (back) return stops.some((s) => follows(s, active)) ? null : last;
  return stops.some((s) => follows(active, s)) ? null : first;
}
