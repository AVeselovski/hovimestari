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

/** A secondary action across the full width whose label names typed text, such as "Add “rahka” as your own food". A long label wraps. */
export const btnWide = `${btnSecondary} h-auto! min-h-12 w-full py-2.5 text-center break-words`;

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
export const btnText = `inline-flex min-h-11 items-center rounded-sm text-base font-semibold text-ink underline decoration-field-rule underline-offset-4 hover:decoration-ink active:decoration-ink ${focusRing} disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60`;

/** A text button that leads to something destructive, such as Delete account: in the accent. A press or a hover fills in its underline, as with `btnText`. */
export const btnTextDanger = `inline-flex min-h-11 items-center rounded-sm text-base font-semibold text-accent underline decoration-accent/70 underline-offset-4 hover:decoration-accent active:decoration-accent ${focusRing} disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60`;

/** A text link inside copy. A press darkens its underline, so a tap shows at once. */
export const linkClass = `rounded-sm font-medium text-ink underline decoration-field-rule underline-offset-4 hover:decoration-ink active:decoration-ink ${focusRing}`;

/** A field: 48px tall, 16px text so iOS Safari never zooms on focus. */
export const inputClass = `block h-12 w-full rounded-control border border-field-rule bg-surface-raised px-3.5 text-base text-ink placeholder:text-ink-muted ${focusRing} aria-invalid:border-accent`;

export const labelClass = "mb-1.5 block text-sm font-semibold text-ink";

/** A label on the left of its field, on the same row (`DecimalField`'s `layout="beside"`). */
export const labelBesideClass = "min-w-0 flex-1 text-base font-semibold text-ink";

/** A line under a field: what the field wants. */
export const fieldHintClass = "mt-1.5 text-sm text-ink-muted";

/**
 * The room a field's line keeps whether or not it holds anything: one line
 * of text, for its hint or its refusal. Every such line fits one line at 320
 * pixels wide. One that cannot grows its block when it shows, which moves
 * only what is below it. `field-line` marks it, so a line that ends a form
 * sheet's body is the room above the footer (`form-ends-in-line` in
 * globals.css).
 */
export const lineRoom = "min-h-5 field-line";

/**
 * A form's fields, top to bottom: 8px between one field's block and the
 * next. A block ends in its reserved line, which already sets it apart.
 */
export const formStack = "flex flex-col gap-2";

/**
 * The line a Day tab column's heading sits on: 16px on a phone, 20px from
 * `md`, as the summary's macro heads. From `lg` the summary and the entries
 * stand side by side, and both columns' first headings sit on this line at
 * the column's top, so they line up (`dayEntriesHead`).
 */
export const dayHeadLine = "flex min-h-4 items-center md:min-h-5";

/**
 * The "Entries" row: 44px, so "Mark all eaten" keeps its target and the row
 * is the same height with and without it. Below `lg` the heading and the
 * button sit on the row's middle. From `lg` they sit on its top line, the
 * summary's `dayHeadLine`, and the button's target hangs below its words.
 * The list starts at the same place either way.
 */
export const dayEntriesHead = "flex min-h-11 items-center justify-between gap-3 lg:items-start";

/** The "Entries" heading: on the row's middle below `lg`, on the summary's head line from `lg`. */
export const dayEntriesHeading = "section-label lg:flex lg:min-h-5 lg:items-center";

/** "Mark all eaten" in `dayEntriesHead`: from `lg` its words on the row's top line, its 44px target below them. */
export const dayEntriesHeadButton = "lg:items-start";

/**
 * A block in a `formStack` that starts a section, such as a heading over a
 * group of fields, or that closes the form, such as a note: 16px from the
 * block above it.
 */
export const sectionStart = "mt-2";

/**
 * A line in a `formStack` that starts a section only while it says
 * something, such as the line under the targets sheet's fields: 16px from the block
 * above it when filled. Empty, it takes back the stack's gap, so it costs no
 * room and the block after it sits where it would without it. It stays in
 * the layout, so a live region still announces what it comes to say.
 */
export const sectionStartWhenFilled = `${sectionStart} empty:-mt-2`;

/**
 * A block in a `formStack` that keeps no line under it, because it cannot be
 * refused, such as Eaten or planned: 16px to the block under it, where a
 * field's reserved line and the stack's gap would leave 34. Last in its
 * stack, it adds nothing.
 */
export const linelessBlock = "not-last:mb-2";

/** Sections that each start with a heading, such as the targets form's Calories and Protein: 16px apart. */
export const sectionStack = "flex flex-col gap-4";

/** Two fields stacked on a phone and side by side from `md`, so a dialog shows its whole form. */
export const pairRow = "flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-x-3 md:gap-y-2";

/** The text of a line that says what went wrong. Errors use the accent. */
export const errorTextClass = "text-sm font-medium text-accent";

/** A line under a field or a form: what went wrong. */
export const fieldErrorClass = `mt-1.5 ${errorTextClass}`;

/**
 * The line for a refusal that belongs to no field (`FormError`), right above
 * a form's buttons, on a page and in a form sheet's footer alike. On a phone
 * it keeps no room: it is as tall as what it says. In a sheet the footer grows
 * upward into the held sheet, and on a page the button moves down by the
 * refusal's height, which stays next to the button. From `md` it keeps two
 * lines of room, so a dialog's buttons and a page's button never move under
 * the pointer. On a page it sits in the form's `formStack`, 8px from the last
 * field's line and from the button.
 */
export const refusalLine = `${errorTextClass} md:min-h-10`;

/**
 * `refusalLine` in a form sheet's footer (`FormError inFooter`), which is no
 * stack: it keeps the 8px above the buttons itself, and gives them back on a
 * phone while empty.
 */
export const footerRefusal = `${refusalLine} mb-2 max-md:empty:mb-0`;

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
 * A choice chip, such as a unit or a meal's source: a pill 44 pixels tall
 * that never wraps its label. A label longer than its row is cut with an
 * ellipsis at the row's width, so no chip pushes past its row or makes a
 * sheet scroll sideways. Chips sit in one row that scrolls sideways
 * (`chipRow`). The chosen one is in the accent, because chosen is not the
 * same as on target.
 */
export const chip = `inline-block max-w-full shrink-0 truncate rounded-pill border px-4 text-base leading-10.5 font-semibold whitespace-nowrap transition-colors duration-150 ${focusRing}`;
export const chipOn = "border-accent bg-accent text-on-accent";
export const chipOff = "border-field-rule bg-surface-raised text-ink";
/** A row of chips that scrolls sideways and never wraps, with room for the focus ring the scroll would clip. */
export const chipRow = "no-scrollbar -mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 py-1";
/**
 * A row of chips that scrolls sideways on a phone and wraps from `md`, where
 * a mouse has no way to scroll a row with no scrollbar.
 */
export const chipRowWrapping = `${chipRow} md:flex-wrap md:overflow-x-visible`;

/**
 * The z-index ladder. Page content sits at the default. A page's own header
 * that stays in view while its content scrolls under it sits at 20. The
 * header, the tab bar and the rail sit at 30, under the sheets at 50. Every
 * layer above the page takes its class from here.
 */
export const zPageHeader = "z-20";
export const zShell = "z-30";
/**
 * A toast: above the shell, under every sheet, so an open sheet always
 * covers a toast and a toast never covers a sheet's footer. A press on a
 * toast's button over a modal sheet would count as a press outside it and
 * close the sheet.
 */
export const zToast = "z-40";
/** A sheet, its backdrop and its viewport. */
export const zSheet = "z-50";

// ---------------------------------------------------------------------------
// Toasts (components/ui/Toast.tsx): one at a time, above the tab bar on a
// phone, at the bottom of the content column from `md`. The offset reads the
// tab bar's own height token, so the two never drift apart.
// ---------------------------------------------------------------------------

/**
 * The fixed line a toast hangs from. Below `md` it spans the screen above the
 * tab bar and the home indicator. From `md` it spans the area right of the
 * side rail, near the bottom edge.
 */
export const toastViewport = `fixed inset-x-0 ${zToast} h-0 bottom-[calc(var(--spacing-tab-bar)+var(--safe-bottom)+0.5rem)] outline-hidden md:left-(--spacing-rail) md:bottom-[calc(var(--safe-bottom)+1.5rem)]`;

/**
 * The toast: ink, with the page colour as its text, so it reads apart from
 * every surface under it. It hangs from the bottom of the viewport box, so a
 * toast fading out and the next fading in share one place and nothing above
 * them moves. Within the page gutter, centred in the content column from `md`.
 */
export const toastRoot =
  "toast-motion absolute bottom-0 right-[calc(var(--safe-right)+1rem)] left-[calc(var(--safe-left)+1rem)] mx-auto flex max-w-page items-center gap-3 rounded-control bg-ink py-2 pr-2 pl-4 text-bg outline-hidden select-none md:right-8 md:left-8";

/** The toast's line: at most three lines, a long name cut short, so a page's `toast-clearance` always clears it. */
export const toastTitle = "min-w-0 flex-1 py-2.5 text-base line-clamp-3 break-words";

/** The toast's one action, such as Undo: a 44px target in the inverted ink. */
export const toastAction = `inline-flex min-h-11 shrink-0 items-center rounded-sm px-3 text-base font-semibold text-bg underline decoration-bg/60 underline-offset-4 hover:decoration-bg active:decoration-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bg`;

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
 *
 * `--sheet-footer-pad` is the footer's bottom padding below `md`: it clears
 * whichever is taller, the home indicator or the software keyboard.
 * `--drawer-keyboard-inset` is the keyboard's height while one is open (Base
 * UI's `Drawer.VirtualKeyboardProvider` sets it on the viewport for a
 * `keyboardAware` sheet), and the keyboard already covers the home
 * indicator, so the two never add up. It is set here, on the popup, so it
 * reads the inset the viewport holds, and both the footer and the sheet's
 * held height (`useHeldSheetHeight`) add the same amount.
 */
const sheetPopupShape =
  "[--sheet-footer-pad:calc(1rem+max(var(--safe-bottom),var(--drawer-keyboard-inset,0px)))] relative flex w-full flex-col outline-hidden rounded-t-card border border-rule max-md:border-x-0 max-md:border-b-0 md:rounded-card max-h-[calc(100dvh-var(--safe-top)-1.5rem)] max-md:min-h-[calc(var(--sheet-min-height)+var(--safe-bottom))] md:max-h-[calc(100dvh-2rem)] sheet-popup-motion";

/** The sheet itself, on the surface colour. */
export const sheetPopup = `${sheetPopupShape} bg-surface`;

/** A sheet stacked on another: the raised surface, so the two read apart. */
export const sheetPopupStacked = `${sheetPopupShape} bg-surface-raised`;

/**
 * A tall sheet (`BottomSheet size="tall"`): one fixed height that never
 * follows its content. On a phone it stands 3rem short of the top safe area,
 * so the page still shows above it. As the centred panel from `md` it is
 * 48rem tall, or the viewport less 1rem above and below on a shorter
 * screen, so a form dialog such as a new saved meal shows its whole form at
 * 1366 by 768. Its top edge therefore stays put however its content changes.
 */
export const sheetPopupTall = "h-[calc(100dvh-var(--safe-top)-3rem)] md:h-[min(48rem,calc(100dvh-2rem))]";

/**
 * A sheet held at the height it opened at, below `md` (`useHeldSheetHeight`):
 * `--sheet-held-height` is that height less the footer's bottom padding, which
 * is added back, so a keyboard opening still lifts the footer above it.
 */
export const sheetPopupHeld = "h-[calc(var(--sheet-held-height)+var(--sheet-footer-pad))]";

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
 * in reach however long the body is. Below `md` its bottom padding is
 * `--sheet-footer-pad`, which clears the home indicator or the software
 * keyboard (`sheetPopupShape`).
 */
export const sheetFooter = "shrink-0 border-t border-rule px-5 pt-4 pb-(--sheet-footer-pad) md:px-6 md:pb-5";

/**
 * The buttons in a `sheetFooter`: two equal halves below `md`, 8px apart, the
 * dialog's right-aligned row from `md`. No gap between rows: a secondary
 * action's row above the two keeps its own room below it
 * (`sheetActionsStartButton`), so that room goes with the row when the row
 * gives way to the keyboard. A grid's row gap would stay.
 */
export const sheetActions = "grid grid-cols-2 gap-x-2 md:flex md:flex-wrap md:justify-end";

/**
 * A secondary action in a `sheetActions` row, such as "Delete entry": a row
 * of its own above the two buttons below `md`, the full width. From `md` it
 * sits at the start of the buttons' row, and takes a row of its own above
 * them when the three do not fit, as in a `md:max-w-sm` dialog. It is a
 * `<fieldset>`, so the browser's own border, padding and minimum width are
 * reset.
 */
export const sheetActionsStart = "col-span-2 m-0 grid min-w-0 border-0 p-0 md:mr-auto md:flex md:items-center";

/**
 * The text button in a `sheetActionsStart` row. Below `md` it keeps its 44px
 * target, which reaches 10px past its line of text above and below: above,
 * into the footer's top padding, so its words sit 16px under the footer's
 * rule as a footer's content does. Below, 2px more keep the target off Cancel
 * and Save, so the words sit 12px over them, with no empty band around them.
 * From `md` it stands in the buttons' row at its full height.
 */
export const sheetActionsStartButton = "max-md:-mt-(--footer-start-reach) max-md:mb-0.5";

/** Cancel and the submit button together: the two halves below `md`, one group at the end of the row from `md`. */
export const sheetActionsPair = "contents md:ml-auto md:flex md:gap-3";

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

/**
 * A tray that sits beside a field from `md`, such as Eaten or planned beside
 * a name: 48 pixels tall there, as the field is, with 2 pixels of padding
 * around options of 42. On a phone it keeps its 44 pixel options.
 */
export const segmentedTrayBesideField = "md:p-0.5";
/** An option in a `segmentedTrayBesideField`. */
export const segmentButtonBesideField = "md:min-h-10.5";
