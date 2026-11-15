// ---------------------------------------------------------------------------
// Shared class recipes. One theme reaches every primitive through these, so
// a view composes recipes and tokens and never repeats a raw value. The
// tokens they use live in src/app/globals.css (docs/app/colors.md).
//
// Solid surfaces only: no glass, no blur, no decorative shadow. Sheet and
// menu recipes arrive with the sheet primitives.
// ---------------------------------------------------------------------------

/** The keyboard focus ring. Ink, never the accent, so focus never reads as selection. */
export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Below `md`, a control a thumb must hit is at least 44 by 44. */
export const touchTarget = "max-md:min-h-11 max-md:min-w-11";

/**
 * For a control that must not grow: an invisible 44px hit area centred on it.
 * The control needs `relative`, and its neighbours must sit outside the reach.
 */
export const touchHitArea =
  "relative after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";

const btnShape = `inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors duration-150 ${focusRing} disabled:cursor-not-allowed disabled:opacity-60`;

/** A full-size button: 48px tall, readable at arm's length. */
const btnSize = "h-12 px-5 text-base";

/** The one primary action on a surface. */
export const btnPrimary = `${btnShape} ${btnSize} bg-accent text-on-accent hover:opacity-90 active:opacity-80`;

/** A secondary action: an outlined button on the page. */
export const btnSecondary = `${btnShape} ${btnSize} border border-rule bg-surface-raised text-ink hover:bg-surface active:bg-surface`;

/** A quiet action. */
export const btnGhost = `${btnShape} ${btnSize} text-ink hover:bg-surface active:bg-surface`;

/** A text link inside copy. A press darkens its underline, so a tap shows at once. */
export const linkClass = `rounded-sm font-medium text-ink underline decoration-rule underline-offset-4 hover:decoration-ink active:decoration-ink ${focusRing}`;

/** A field: 48px tall, 16px text so iOS Safari never zooms on focus. */
export const inputClass = `block h-12 w-full rounded-control border border-field-rule bg-surface-raised px-3.5 text-base text-ink placeholder:text-ink-muted ${focusRing} aria-invalid:border-accent`;

export const labelClass = "mb-1.5 block text-sm font-semibold text-ink";

/** A line under a field: what the field wants. */
export const fieldHintClass = "mt-1.5 text-sm text-ink-muted";

/** A line under a field or a form: what went wrong. Errors use the accent. */
export const fieldErrorClass = "mt-1.5 text-sm font-medium text-accent";

/** A note above a form, such as "Password updated." */
export const noticeClass = "rounded-control border border-rule bg-surface px-4 py-3 text-sm text-ink";

/** A note that something went wrong, above a form or in place of one. */
export const errorNoticeClass =
  "rounded-control border border-accent bg-surface px-4 py-3 text-sm font-medium text-accent";

/** A link that stands on its own line, such as "Forgot your password?": a full 44px target on a phone. */
export const standaloneLinkClass = `${linkClass} inline-flex min-h-11 items-center`;

/** A panel on the page. */
export const cardClass = "rounded-card border border-rule bg-surface";
export const cardPadClass = "p-5 md:p-6";
export const cardPadDenseClass = "p-4";
export const panelHeadClass = "mb-4 flex items-center justify-between gap-3";
export const sectionTitle = "section-label";

/**
 * The z-index ladder. Page content sits at the default. The header, the
 * tab bar and the rail sit at 30, under the sheets at 50, under portalled
 * popovers at 9999.
 */
export const zShell = "z-30";
