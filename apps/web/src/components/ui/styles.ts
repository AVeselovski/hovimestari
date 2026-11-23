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
 * The scanner's camera view: the body's width at 4:3, on the surface under
 * the video, so the box holds its place before the stream shows and after
 * the camera fails.
 */
export const cameraView = "relative aspect-4/3 w-full overflow-hidden rounded-card border border-rule bg-surface";

/**
 * The scanner's video inside `cameraView`. `object-cover` at the default
 * centred position is the crop `visibleBand` (`scanner/useCameraStream.ts`)
 * maps the band through, so what is decoded is what shows in the band. A
 * change to the fit or the position here changes that mapping, and
 * `ScannerSheet.test.tsx` fails until both agree.
 */
export const cameraVideo = "absolute inset-0 size-full object-cover";

/**
 * The turning ring drawn over the camera's picture while the scanner starts.
 * Like a band corner, it is a 3 pixel paper arc round a 3 pixel ink arc, in
 * the `on-camera` tokens, so one of the two stands out from any frame in
 * either theme. `cameraBusyRingEdge` is the ink arc inside it.
 */
export const cameraBusyRing =
  "relative size-9 animate-spin rounded-pill border-3 border-transparent border-t-on-camera motion-reduce:animate-none";
/** The ink arc inside a `cameraBusyRing`, turning with it. */
export const cameraBusyRingEdge = "absolute inset-0 rounded-pill border-3 border-transparent border-t-on-camera-edge";

/**
 * A footer with one button, such as the scanner's Type the number: the full
 * width on a phone, at the end of the row from `md`.
 */
export const sheetActionsSingle = "flex flex-col md:flex-row md:justify-end";

/**
 * One corner of the band the scanner reads, drawn over the camera's picture
 * as the top-left corner and turned for the others. Its two arms are a paper
 * stroke on the outside and an ink stroke on the inside, 3 pixels each, in
 * the `on-camera` tokens that keep their values in both themes. Whatever the
 * picture shows, one of the two stands out from it by at least 3.6 to 1.
 */
export const cameraBandCorner = "absolute size-7 rounded-tl-md border-t-3 border-l-3 border-on-camera";
/** The ink stroke inside a `cameraBandCorner`. */
export const cameraBandCornerEdge =
  "absolute top-0 left-0 size-[calc(100%-3px)] rounded-tl-sm border-t-3 border-l-3 border-on-camera-edge";

/**
 * A toggle drawn over the camera's picture, such as the scanner's Torch, with
 * `aria-pressed`. In the `on-camera` tokens, so it reads on any frame in
 * either theme: paper with an ink edge when off, and the inverse, ink with a
 * paper edge, when on. The accent changes with the theme and the picture
 * does not, so it is not used here. The focus ring is drawn inside the
 * button, on its own fill, so it shows whatever is behind it.
 */
export const cameraToggle =
  "inline-flex h-12 items-center gap-2 rounded-pill border-2 border-on-camera-edge bg-on-camera px-5 text-base font-semibold text-on-camera-edge transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-6 focus-visible:outline-on-camera-edge aria-pressed:border-on-camera aria-pressed:bg-on-camera-edge aria-pressed:text-on-camera aria-pressed:focus-visible:outline-on-camera";

/**
 * Two equal actions side by side at every width, such as "New saved meal"
 * and "Add an estimate". The grid stretches both to the taller one, so a
 * label that wraps to two lines never leaves its neighbour shorter.
 */
export const actionPair = "grid grid-cols-2 gap-2";

/** A button in `actionPair`: secondary, at least 48 px tall, growing with a wrapped label. */
export const actionPairButton = `${btnSecondary} h-auto! min-h-12 px-3 py-2 text-center`;

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

/**
 * The slot at the end of a row whose one control is a chevron in one state
 * and a word in another, such as Put back on a line left out: one width for
 * both, wide enough for the word, so the row's text wraps the same in each.
 */
export const rowTrailSlot = "w-17 shrink-0 justify-end";

/** A text button that leads to something destructive, such as Delete account: in the accent. A press or a hover fills in its underline, as with `btnText`. */
export const btnTextDanger = `inline-flex min-h-11 items-center rounded-sm text-base font-semibold text-accent underline decoration-accent/70 underline-offset-4 hover:decoration-accent active:decoration-accent ${focusRing} disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60`;

/** Back, at the start of a page's or a sheet view's first row: a chevron and the word, 44px tall. */
export const backButton = `inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control px-2 text-base font-semibold text-ink hover:bg-surface-raised active:bg-surface-raised ${focusRing}`;

/** A text link inside copy. A press darkens its underline, so a tap shows at once. */
export const linkClass = `rounded-sm font-medium text-ink underline decoration-field-rule underline-offset-4 hover:decoration-ink active:decoration-ink ${focusRing}`;

/** A field: 48px tall, 16px text so iOS Safari never zooms on focus. */
export const inputClass = `block h-12 w-full rounded-control border border-field-rule bg-surface-raised px-3.5 text-base text-ink placeholder:text-ink-muted ${focusRing} aria-invalid:border-accent`;

/**
 * A short field for one small whole number between a minus and a plus, such
 * as a recipe page's servings: the field recipe at a fixed width, its figure
 * centred in the monospaced face.
 */
export const stepperField = `block h-12 w-20 rounded-control border border-field-rule bg-surface-raised px-1 text-center font-mono text-lg text-ink tabular-nums ${focusRing}`;

/** The minus and the plus beside a `stepperField`: 48px squares. At its limit a button dims and keeps focus. */
export const stepperButton = `inline-flex size-12 shrink-0 items-center justify-center rounded-control border border-field-rule bg-surface-raised text-ink hover:bg-surface active:bg-surface aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${focusRing}`;

/** A text area for prose that runs over several lines, such as a recipe's method: the field recipe, taller, with its own padding. */
const textareaBox = `block w-full resize-y rounded-control border border-field-rule bg-surface-raised px-3.5 py-3 text-base leading-6 text-ink placeholder:text-ink-muted ${focusRing} aria-invalid:border-accent`;
export const textareaClass = `${textareaBox} min-h-32`;

/** A lower text area, for a few lines, such as a recipe's notes. */
export const textareaShortClass = `${textareaBox} min-h-24`;

/**
 * The select itself: a field's box (48px, 16px text, so iOS Safari never
 * zooms on focus), with the browser's own arrow drawn away and room on the
 * right for the app's chevron. `h-12` rather than a minimum height, because
 * WebKit ignores `min-height` on a select.
 */
export const selectFieldClass = `${inputClass} appearance-none pr-11`;

/** Holds the select and its chevron. */
export const selectFieldWrap = "relative flex w-full";

/** The chevron over the select's right edge. Presses pass through it to the select. */
export const selectFieldChevron =
  "pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-ink-muted";

/**
 * Text a person copies by hand, such as a connection key or a setup command:
 * the monospaced face on the raised surface, inside a hairline box. Long text
 * wraps at its spaces, and inside a word only where a word is longer than the
 * line, so it never widens what holds it. Indentation is kept.
 */
export const codeBox =
  "rounded-control border border-rule bg-surface-raised px-3.5 py-3 font-mono text-sm leading-relaxed text-ink wrap-anywhere whitespace-pre-wrap";

/**
 * A neutral tag beside a name, such as a connection's "Read only" or
 * "Expired": a small hairline pill, never a hue, because it states a fact and
 * is not a choice or a status.
 */
export const tagClass =
  "inline-flex items-center rounded-pill border border-rule px-2.5 py-0.5 text-sm font-medium whitespace-nowrap text-ink-muted";

/**
 * A tag a person chose, with a cross that takes it off, such as a recipe's
 * tag in its editor: a pill in the accent's outline, never a hue.
 */
export const chosenTag =
  "inline-flex max-w-full items-center rounded-pill border border-accent bg-surface-raised pl-4 text-base font-semibold text-ink";

/** The cross at the end of a `chosenTag`: a 44px target. */
export const chosenTagRemove = `inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:text-ink ${focusRing}`;

export const labelClass = "mb-1.5 block text-sm font-semibold text-ink";

/** A label on the left of its field, on the same row (`DecimalField`'s `layout="beside"`). */
export const labelBesideClass = "min-w-0 flex-1 text-base font-semibold text-ink";

/** A label inside a labelled group, such as Number and Unit under As written: smaller and muted. */
export const subLabelClass = "mb-1 block text-sm text-ink-muted";

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
 * The group at the end of `dayEntriesHead`: "Mark all eaten", then "Copy"
 * last, so Copy stays where it is when Mark all eaten leaves.
 */
export const dayEntriesActions = "flex gap-4";

/**
 * "Copy" in `dayEntriesActions`: a 44px target both ways. Its word is
 * shorter than that, so the target grows leftward into the gap and the word
 * stays at the row's end.
 */
export const dayEntriesCopyButton = `${dayEntriesHeadButton} min-w-11 justify-end`;

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

/** Two short fields side by side at every width, such as a recipe's Serves and Time. */
export const pairRowAlways = "grid grid-cols-2 gap-3";

/**
 * The first line of a sheet's header that says where the sheet's work goes,
 * or for a moment what a press did: one line, its room always kept, cut with
 * an ellipsis, so what is under it never moves.
 */
export const statusLineClass = "h-5 truncate text-sm leading-5";

/**
 * A recipe line's name and amount: the amount under the name on a phone, and
 * in a column of its own, 15rem wide at most, before the name from `md`.
 */
export const ingredientGrid = "grid min-w-0 flex-1 gap-x-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]";

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
/**
 * A panel in a sheet. It takes the surface its sheet is not on, so it is
 * filled in a sheet of either ground: a sheet on its own stands on the
 * surface colour, one stacked on another on the raised one.
 */
export const cardInSheetClass = "rounded-card border border-rule bg-(--sheet-card)";
export const cardPadClass = "p-5 md:p-6";
export const cardPadDenseClass = "p-4";
export const panelHeadClass = "mb-4 flex items-center justify-between gap-3";
export const sectionTitle = "section-label";

/** The one line a list shows in place of its rows, such as "Meals you save appear here.": 48px tall. */
export const listLine = "py-3 text-base text-ink-muted";

/**
 * The room a list keeps while it loads or cannot be read: one `listLine`
 * tall, the least a loaded list takes, so a short list never moves what
 * sits under it when it arrives.
 */
export const listLineFrame = "min-h-12";

/**
 * A spinning ring that says a control is busy, laid over the control's own
 * box (`absolute`, placed by the caller). In the ink, and still when the
 * reader asks for less motion.
 */
export const busyRing = "animate-spin rounded-pill border-2 border-transparent border-t-ink motion-reduce:animate-none";

/** The dot between two facts on one line, such as "Serves 2 · 25 min": a little more room on each side than a space gives. */
export const midDot = "mx-1";

/**
 * A row's line of figures after their dots, in the monospaced face, one line
 * tall at every width. Its pieces wrap as words do, and what wraps is out of
 * sight, so a piece that does not fit leaves whole and no word is cut. Put
 * the pieces that must stay first.
 */
export const figuresLine =
  "flex h-5 flex-wrap content-start items-center gap-x-2 overflow-hidden font-mono text-sm whitespace-nowrap text-ink-muted tabular-nums";
/** A figure after its dot in a `figuresLine`. */
export const figuresLinePiece = "inline-flex h-5 shrink-0 items-center gap-1.5";

/**
 * A choice chip, such as a unit or a meal's source: a pill 44 pixels tall
 * that never wraps its label. A label longer than its row is cut with an
 * ellipsis at the row's width, so no chip pushes past its row or makes a
 * sheet scroll sideways. Chips sit in one row that scrolls sideways
 * (`sheetChipRow`). The chosen one is in the accent, because chosen is not the
 * same as on target.
 */
export const chip = `inline-block max-w-full shrink-0 truncate rounded-pill border px-4 text-base leading-10.5 font-semibold whitespace-nowrap transition-colors duration-150 ${focusRing}`;
export const chipOn = "border-accent bg-accent text-on-accent";
export const chipOff = "border-field-rule bg-surface-raised text-ink";
/**
 * A row of chips in a sheet's body that scrolls sideways and never wraps. It
 * bleeds through the body's inline padding to the sheet's edges and pads
 * itself back by the same amount (`--sheet-pad-x`), so at rest the first chip
 * lines up with the fields, mid-scroll the chips run to both edges, and at
 * the end the last chip lines up with the fields' right edge. A chip that
 * focus scrolls into view stops at that same edge (`scroll-padding-inline`).
 * Its 4px above and below are the focus ring's room, which the scroll clips.
 */
export const sheetChipRow =
  "no-scrollbar -mx-(--sheet-pad-x) flex scroll-px-(--sheet-pad-x) gap-2 overflow-x-auto overscroll-x-contain px-(--sheet-pad-x) py-1";
/**
 * A `sheetChipRow` that scrolls sideways on a phone and wraps from `md`,
 * where a mouse has no way to scroll a row with no scrollbar. Wrapped, it
 * stays inside the body's padding, and nothing clips its focus rings.
 */
export const sheetChipRowWrapping = `${sheetChipRow} md:mx-0 md:flex-wrap md:overflow-x-visible md:px-0`;

/**
 * A chip row whose last control keeps its place at the row's end, such as the
 * recipe list's Filter after its tags. The chips before it are in
 * `chipRowScroller`: on a phone they scroll sideways under the finger, and
 * from `md` they wrap. The last control (`chipRowEnd`) sits outside them, at
 * the row's top right, so it is never scrolled out of view and never moves
 * when chips join the row.
 */
export const chipRowPinnedEnd = "flex items-start gap-1 md:gap-2";
/**
 * The chips of a `chipRowPinnedEnd`. On a phone the row bleeds to the page's
 * left edge as `sheetChipRow` does and stops before the pinned control, with
 * 4px at its end for a focus ring. Its 4px above and below are the ring's
 * room too.
 */
export const chipRowScroller =
  "no-scrollbar -ml-(--sheet-pad-x) flex min-w-0 flex-1 scroll-pr-1 scroll-pl-(--sheet-pad-x) gap-2 overflow-x-auto overscroll-x-contain py-1 pr-1 pl-(--sheet-pad-x) md:ml-0 md:flex-wrap md:overflow-x-visible md:pr-0 md:pl-0";
/**
 * The pinned control of a `chipRowPinnedEnd`, level with the first line of
 * chips. It keeps the width of its longest label, such as "Filter · 5", with
 * its words centred and its digits one width, so a count that comes and goes
 * changes neither its size nor the room the chips before it have.
 */
export const chipRowEnd = "my-1 min-w-23 shrink-0 text-center tabular-nums";

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

/** The sheet itself, on the surface colour. A card in it takes the other surface (`cardInSheetClass`). */
export const sheetPopup = `${sheetPopupShape} bg-surface [--sheet-card:var(--color-surface-raised)]`;

/** A sheet stacked on another: the raised surface, so the two read apart. */
export const sheetPopupStacked = `${sheetPopupShape} bg-surface-raised [--sheet-card:var(--color-surface)]`;

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
export const sheetHeader = "shrink-0 px-(--sheet-pad-x) pt-4 md:pt-6";

/** The title in a `sheetHeader`, in the display face. A title that wraps is balanced. */
export const sheetTitle = "font-display text-2xl font-medium text-balance text-ink";

/** The scrolling part every sheet body shares. `touch-auto` undoes the viewport's `touch-none`. */
const sheetBodyScroll = "min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain px-(--sheet-pad-x)";

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
export const sheetFooter = "shrink-0 border-t border-rule px-(--sheet-pad-x) pt-4 pb-(--sheet-footer-pad) md:pb-5";

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
 * target, which reaches 10px above its row, into the footer's top padding,
 * and keeps 2px of its own under it, off Cancel and Save. Its words sit 4px
 * above the target's middle (`pb-2`), so their ink is centred in the room
 * between the footer's rule and the two buttons: the room above a capital's
 * top and the room under the underline differ by 1px at most. From `md` it
 * stands in the buttons' row at its full height.
 */
export const sheetActionsStartButton = "max-md:-mt-(--footer-start-reach) max-md:mb-0.5 max-md:pb-2";

/**
 * Cancel or the submit button in a `sheetActionsPair`. Below `md` each is half
 * the footer, 136px at 320 wide, so it keeps 12px at its sides and a label
 * such as "Show recipes" stays on one line.
 */
export const sheetActionsButton = `${touchTarget} max-md:px-3`;

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
