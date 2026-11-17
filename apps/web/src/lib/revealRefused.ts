// ---------------------------------------------------------------------------
// After a refused submit, a form sheet brings its first refused field into
// view inside its scrolling body, the line under the field included. Focus
// alone scrolls only the input into view, so on a short phone the line that
// says what is wrong could sit under the pinned footer.
//
// Only the sheet's body scrolls, never the page or the sheet itself, and only
// as far as it must ("nearest"): what is already in view moves nothing.
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

/** Scrolls `body` as little as it must to show `span`, its top first when it cannot show all of it. */
function scrollToNearest(body: HTMLElement, span: Span, view: Span): void {
  if (span.top < view.top) body.scrollTop -= view.top - span.top;
  else if (span.bottom > view.bottom) body.scrollTop += Math.min(span.bottom - view.bottom, span.top - view.top);
}

/**
 * Scrolls the body of the sheet `form` sits in so the refused field is in
 * view: the focused refused field, else the first in the form's order.
 *
 * - Nothing, when the field, its label and the lines it is described by are
 *   all in view.
 * - Its whole block when the block fits in the body.
 * - Else the field and its label with the lines it is described by, when
 *   those fit together. A figure's block is the whole grid and its shared
 *   line, taller than the body above a phone's keyboard.
 * - Else the field and its label, else the field alone.
 *
 * Each as little as it must, so what is in view already moves nothing.
 */
export function revealRefused(form: HTMLFormElement | null): void {
  const body = form?.closest<HTMLElement>("[data-sheet-body]");
  if (!form || !body) return;
  const refused = [...form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')];
  if (refused.length === 0) return;
  const field = refused.find((el) => el === document.activeElement) ?? refused[0];
  const view = body.getBoundingClientRect();
  const fits = (span: Span): boolean => span.bottom - span.top <= view.bottom - view.top;
  const label = field.id ? form.querySelector<HTMLElement>(`label[for="${CSS.escape(field.id)}"]`) : null;
  const labelled = label ? [field, label] : [field];
  const told = spanOf([...labelled, ...describedBy(field)]);
  // The field, its label and its lines are all in view already: nothing moves.
  if (told.top >= view.top && told.bottom <= view.bottom) return;
  const block = fieldBlockOf(field).getBoundingClientRect();
  if (fits(block)) return scrollToNearest(body, block, view);
  const candidates = [told, spanOf(labelled)];
  scrollToNearest(body, candidates.find(fits) ?? spanOf([field]), view);
}
