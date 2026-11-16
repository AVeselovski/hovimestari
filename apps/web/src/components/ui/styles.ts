// ---------------------------------------------------------------------------
// Shared class recipes. One theme reaches every primitive through these, so
// a view composes recipes and tokens and never repeats a raw value. The
// tokens they use live in src/app/globals.css (docs/app/colors.md).
//
// Solid surfaces only: no glass, no blur, no decorative shadow.
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

const btnShape = `inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors duration-150 ${focusRing} disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60`;

/** A full-size button: 48px tall, readable at arm's length. */
const btnSize = "h-12 px-5 text-base";

/** The one primary action on a surface. */
export const btnPrimary = `${btnShape} ${btnSize} bg-accent text-on-accent hover:opacity-90 active:opacity-80`;

/** A secondary action: an outlined button on the page. */
export const btnSecondary = `${btnShape} ${btnSize} border border-field-rule bg-surface-raised text-ink hover:bg-surface active:bg-surface`;

/**
 * A destructive action, such as Delete account. The accent, as every
 * destructive button and error line is: the identity has one chromatic
 * colour, and a second red would read as the same one.
 */
export const btnDanger = btnPrimary;

/**
 * A secondary action that leads to something destructive, such as the
 * button that opens Delete account: outlined, in the accent.
 */
export const btnSecondaryDanger = `${btnShape} ${btnSize} border border-accent bg-surface-raised text-accent hover:bg-surface active:bg-surface`;

/** A quiet action. */
export const btnGhost = `${btnShape} ${btnSize} text-ink hover:bg-surface active:bg-surface`;

/**
 * An action that reads as a word rather than a button, such as Sign out on
 * the first-run page: underlined, with a full 44px target on a phone.
 */
export const btnText = `inline-flex min-h-11 items-center rounded-sm text-base font-semibold text-ink underline decoration-field-rule underline-offset-4 hover:decoration-ink active:decoration-ink ${focusRing} disabled:cursor-not-allowed disabled:opacity-60`;

/** A text button that leads to something destructive, such as Delete account: in the accent. A press or a hover fills in its underline, as with `btnText`. */
export const btnTextDanger = `inline-flex min-h-11 items-center rounded-sm text-base font-semibold text-accent underline decoration-accent/70 underline-offset-4 hover:decoration-accent active:decoration-accent ${focusRing} disabled:cursor-not-allowed disabled:opacity-60`;

/** A text link inside copy. A press darkens its underline, so a tap shows at once. */
export const linkClass = `rounded-sm font-medium text-ink underline decoration-field-rule underline-offset-4 hover:decoration-ink active:decoration-ink ${focusRing}`;

/** A field: 48px tall, 16px text so iOS Safari never zooms on focus. */
export const inputClass = `block h-12 w-full rounded-control border border-field-rule bg-surface-raised px-3.5 text-base text-ink placeholder:text-ink-muted ${focusRing} aria-invalid:border-accent`;

export const labelClass = "mb-1.5 block text-sm font-semibold text-ink";

/** A line under a field: what the field wants. */
export const fieldHintClass = "mt-1.5 text-sm text-ink-muted";

/** The text of a line that says what went wrong. Errors use the accent. */
export const errorTextClass = "text-sm font-medium text-accent";

/** A line under a field or a form: what went wrong. */
export const fieldErrorClass = `mt-1.5 ${errorTextClass}`;

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
 * tab bar and the rail sit at 30, under the sheets at 50. Every layer above
 * the page takes its class from here.
 */
export const zShell = "z-30";
/** A sheet, its backdrop and its viewport. */
export const zSheet = "z-50";

// ---------------------------------------------------------------------------
// Sheets: the parts `BottomSheet` renders on Base UI's Drawer. Below `md` a
// sheet hangs off the bottom edge of the viewport. From `md` the same DOM is
// a centred panel. The motion lives in globals.css (`sheet-backdrop-motion`,
// `sheet-popup-motion`), timed by the motion tokens there. Solid surfaces: a
// sheet lifts from the page by its surface colour and a hairline rule, and
// the scrim behind it is the only shading.
// ---------------------------------------------------------------------------

/** The dimmed page behind a sheet. It fades in and out, and lightens as the sheet is dragged away. */
export const sheetBackdrop = `fixed inset-0 ${zSheet} bg-scrim sheet-backdrop-motion`;

/**
 * The full-screen box that places the sheet: at the bottom edge below `md`,
 * centred from `md`. `touch-none` keeps a drag on it from scrolling the page
 * behind. The sheet's body opts back in to scroll.
 */
export const sheetViewport = `fixed inset-0 ${zSheet} flex touch-none items-end justify-center md:items-center md:p-4`;

/**
 * The viewport once its centred panel has opened: the panel's top is pinned
 * by a margin (`useAnchoredPanel`), so a change in its height moves only its
 * bottom edge. Below `md` it is the same as `sheetViewport`.
 */
export const sheetViewportAnchored = `fixed inset-0 ${zSheet} flex touch-none items-end justify-center md:items-start md:p-4`;

/**
 * The sheet's shape: rounded at the top corners while it hangs off the
 * bottom edge, fully rounded as a centred panel. Below `md` it stops 1.5rem
 * short of the top safe area and stands at least `--sheet-min-height` tall
 * above the home indicator, so a short prompt is not a sliver at the bottom.
 * From `md` it sizes to its content, up to 1rem short of the viewport above
 * and below, so a form of a dozen rows fits a 1280 by 800 screen. Its
 * width from `md` comes from `BottomSheet`'s `panelClassName`.
 */
const sheetPopupShape =
  "relative flex w-full flex-col outline-hidden rounded-t-card border border-rule max-md:border-x-0 max-md:border-b-0 md:rounded-card max-h-[calc(100dvh-var(--safe-top)-1.5rem)] max-md:min-h-[calc(var(--sheet-min-height)+var(--safe-bottom))] md:max-h-[calc(100dvh-2rem)] sheet-popup-motion";

/** The sheet itself, on the surface colour. */
export const sheetPopup = `${sheetPopupShape} bg-surface`;

/** A sheet stacked on another: the raised surface, so the two read apart. */
export const sheetPopupStacked = `${sheetPopupShape} bg-surface-raised`;

/** The drag handle: the one visible cue that a sheet can be swiped. A phone-only affordance. */
export const sheetHandle = "mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-pill bg-field-rule md:hidden";

/** A sheet's title row, fixed above its scrolling body, so the title never scrolls away. */
export const sheetHeader = "shrink-0 px-5 pt-4 md:px-6 md:pt-6";

/** The title in a `sheetHeader`, in the display face. A title that wraps is balanced. */
export const sheetTitle = "font-display text-2xl font-medium text-balance text-ink";

/** The scrolling part every sheet body shares. `touch-auto` undoes the viewport's `touch-none`. */
const sheetBodyScroll = "min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain px-5 md:px-6";

/**
 * The sheet's scrolling body, padded for what sits around it. Above a footer
 * it keeps one step above the footer's rule, and the footer clears the home
 * indicator. Alone, its own bottom padding clears the home indicator.
 */
export function sheetBodyClass({ header, footer }: { header: boolean; footer: boolean }): string {
  const top = header ? "pt-4" : "pt-4 md:pt-6";
  const bottom = footer ? "pb-4" : "pb-[calc(1rem+var(--safe-bottom))] md:pb-6";
  return `${sheetBodyScroll} ${top} ${bottom}`;
}

/**
 * A sheet's action row, fixed below its scrolling body, so the actions stay
 * in reach however long the body is. Below `md` its bottom padding clears
 * whichever is taller, the home indicator or the software keyboard:
 * `--drawer-keyboard-inset` is the keyboard's height while one is open (Base
 * UI's `Drawer.VirtualKeyboardProvider` sets it for a `keyboardAware`
 * sheet), and the keyboard already covers the home indicator, so the two
 * never add up.
 */
export const sheetFooter =
  "shrink-0 border-t border-rule px-5 pt-4 pb-[calc(1rem+max(var(--safe-bottom),var(--drawer-keyboard-inset,0px)))] md:px-6 md:pb-5";

/** The buttons in a `sheetFooter`: two equal halves below `md`, the dialog's right-aligned row from `md`. */
export const sheetActions = "grid grid-cols-2 gap-2 md:flex md:flex-wrap md:justify-end";

/**
 * A secondary action in a `sheetActions` row, such as "Delete entry": a row
 * of its own above the two buttons, the full width below `md` and at the
 * start from `md`. A `md:max-w-sm` dialog has no room for three in a row.
 */
export const sheetActionsStart = "col-span-2 grid md:flex md:basis-full";

// ---------------------------------------------------------------------------
// Segmented controls: a few options in one tray, one chosen, such as the
// theme and the food-name language. The chosen option is the accent, because
// selection reads accent. The keyboard half is `useRovingChoice`.
// ---------------------------------------------------------------------------

/** The tray. The caller sets the columns (`grid-cols-3`), so every option is the same width. */
export const segmentedTray = "grid gap-1 rounded-control border border-field-rule bg-surface-raised p-1";

/** One option in a `segmentedTray`: a full 44px target. */
export const segmentButton = `flex min-h-11 items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-0.25rem)] px-1.5 text-base font-semibold transition-colors duration-150 ${focusRing}`;

/** The chosen option. */
export const segmentActive = "bg-accent text-on-accent";

/** An option not chosen. */
export const segmentInactive = "text-ink-muted hover:text-ink active:bg-surface";
