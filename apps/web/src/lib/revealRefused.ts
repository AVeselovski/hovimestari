// ---------------------------------------------------------------------------
// After a refused submit, a form sheet brings its first refused field into
// view inside its scrolling body, the line under the field included. Focus
// alone scrolls only the input into view, so on a short phone the line that
// says what is wrong could sit under the pinned footer.
//
// Only the sheet's body scrolls, never the page or the sheet itself, and only
// as far as it must ("nearest"): what is already in view moves nothing.
//
// On a page, a refusal that belongs to no field shows right above the submit
// button, with no room kept for it on a phone. `revealPageRefusal` scrolls the
// page, as little as it must, so the refusal and the button under it are in
// the visible viewport, above a phone's keyboard.
// ---------------------------------------------------------------------------

/** The lines a field is described by. */
function describedBy(field: HTMLElement): HTMLElement[] {
  const ids = (field.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
}

/**
 * A field's block: the smallest element around it that also holds every line
 * it is described by, such as its error line or a line it shares with the
 * field beside it.
 */
export function fieldBlockOf(field: HTMLElement): HTMLElement {
  const parts = describedBy(field);
  let block = field;
  while (block.parentElement && !parts.every((part) => block.contains(part))) block = block.parentElement;
  return block;
}

/** The top and bottom of what should be in view. */
interface Span {
  top: number;
  bottom: number;
}

/** The span from the top of the highest of `els` to the bottom of the lowest. */
function spanOf(els: readonly HTMLElement[]): Span {
  const rects = els.map((el) => el.getBoundingClientRect());
  return { top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) };
}

/**
 * Scrolls `body` as little as it must to show `span`, its top first when it
 * cannot show all of it. Scrolling down, when all that is left under the span
 * is the body's own bottom padding, it goes on to the end, while the span's
 * top stays in view: the last field's line then keeps the room the sheet
 * gives it above the footer's rule (`form-ends-in-line`).
 */
function scrollToNearest(body: Element, span: Span, view: Span): void {
  if (span.top < view.top) {
    body.scrollTop -= view.top - span.top;
    return;
  }
  if (span.bottom <= view.bottom) return;
  const by = Math.min(span.bottom - view.bottom, span.top - view.top);
  body.scrollTop += by;
  const left = body.scrollHeight - body.clientHeight - body.scrollTop;
  const room = parseFloat(getComputedStyle(body).paddingBottom) || 0;
  // The last clause keeps the top of what is revealed in view after the extra scroll.
  if (left > 0 && left <= room && span.top - by - left >= view.top) body.scrollTop += left;
}

/**
 * Scrolls the body of the sheet `form` sits in so `field` is in view. With
 * `withLines`, the lines it is described by count as part of it:
 *
 * - Nothing, when the field, its label and (`withLines`) the lines it is
 *   described by are all in view.
 * - With `withLines`, its whole block when the block fits in the body, else
 *   the field and its label with its lines, when those fit together. A
 *   figure's block is the whole grid and its shared line, taller than the
 *   body above a phone's keyboard.
 * - Else the field and its label, else the field alone.
 *
 * Each as little as it must, so what is in view already moves nothing.
 */
function revealField(form: HTMLFormElement, body: HTMLElement, field: HTMLElement, withLines: boolean): void {
  const view = body.getBoundingClientRect();
  const fits = (span: Span): boolean => span.bottom - span.top <= view.bottom - view.top;
  const label = field.id ? form.querySelector<HTMLElement>(`label[for="${CSS.escape(field.id)}"]`) : null;
  const labelled = label ? [field, label] : [field];
  const told = spanOf(withLines ? [...labelled, ...describedBy(field)] : labelled);
  // What must show is all in view already: nothing moves.
  if (told.top >= view.top && told.bottom <= view.bottom) return;
  if (withLines) {
    const block = fieldBlockOf(field).getBoundingClientRect();
    if (fits(block)) return scrollToNearest(body, block, view);
  }
  const candidates = withLines ? [told, spanOf(labelled)] : [told];
  scrollToNearest(body, candidates.find(fits) ?? spanOf([field]), view);
}

/** The scrolling body of the sheet `form` sits in. */
function bodyOf(form: HTMLFormElement | null): HTMLElement | null {
  return form?.closest<HTMLElement>("[data-sheet-body]") ?? null;
}

/**
 * Scrolls the body of the sheet `form` sits in so the refused field is in
 * view: the focused refused field, else the first in the form's order.
 */
export function revealRefused(form: HTMLFormElement | null): void {
  const body = bodyOf(form);
  if (!form || !body) return;
  const refused = [...form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')];
  if (refused.length === 0) return;
  revealField(form, body, refused.find((el) => el === document.activeElement) ?? refused[0], true);
}

/**
 * Scrolls the body of the sheet `form` sits in so the field that holds focus
 * and its label are in view again. For a refusal that shows in the sheet's
 * footer: on a phone the sheet holds its height, so the taller footer takes
 * its room from the body and can cover the field being typed in. The lines
 * under the field do not count: the refusal is in the footer, and a line
 * there is a hint, so a field in view with its label moves nothing even
 * when its line is covered. Nothing, when focus is not on a field in the form.
 */
export function revealFocused(form: HTMLFormElement | null): void {
  const body = bodyOf(form);
  const field = document.activeElement;
  if (!form || !body || !(field instanceof HTMLElement) || field === form || !form.contains(field)) return;
  revealField(form, body, field, false);
}

/**
 * Scrolls the page so the refusal `line` and its form's submit button are in
 * the visible viewport, the part above a phone's keyboard, wherever it is
 * panned to. Nothing, when they are in view already, or when the line sits
 * in a sheet, whose footer keeps it in sight.
 */
export function revealPageRefusal(line: HTMLElement | null): void {
  const page = document.scrollingElement ?? document.documentElement;
  if (!line || line.closest("[data-sheet-body], [data-sheet-footer]")) return;
  const button = line.closest("form")?.querySelector<HTMLElement>('button[type="submit"]');
  // Boxes are measured against the layout viewport. With a keyboard up, the
  // visual viewport is the part the user sees, and it can be panned down
  // inside the layout viewport by its offsetTop.
  const viewport = window.visualViewport;
  const view = viewport
    ? { top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height }
    : { top: 0, bottom: window.innerHeight };
  const span = spanOf(button ? [line, button] : [line]);
  if (span.bottom - span.top > view.bottom - view.top) return scrollToNearest(page, spanOf([line]), view);
  scrollToNearest(page, span, view);
}
