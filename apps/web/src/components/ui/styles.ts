// ---------------------------------------------------------------------------
// Shared class-string recipes (docs/design/ui-overhaul.md §e). These are
// recipes, not components — for markup already repeated as a class string in
// dozens of files. Every value here is a semantic token utility
// (`bg-surface-2`, `text-content-muted`, …); no raw Tailwind palette class
// (`bg-gray-800`, `text-red-400`, …) belongs in this file. See
// docs/app/colors.md for the token vocabulary.
// ---------------------------------------------------------------------------

/** The app's one focus recipe — an outline, so it needs no offset colour and
 *  is correct on any background in either theme (docs/design/ui-overhaul.md
 *  §b "Focus"). Retires the `ring-offset-2 ring-offset-gray-9xx` pattern,
 *  which hardcoded what each call site believed was behind it.
 *  No `outline-none` here: in Tailwind v4 it sets `--tw-outline-style: none`,
 *  which `focus-visible:outline-2` inherits — the ring computes to width 2
 *  but style none, i.e. invisible. Browsers only paint a default outline on
 *  `:focus-visible`, and these rules override exactly that state. */
export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * The inset sibling of `focusRing`, for an item packed edge-to-edge against
 * its neighbours — the sidebar's nav rows and its bottom-group buttons. A
 * positive offset draws the outline *outside* the element's own box, so on a
 * row that already spans full width with no gap to its neighbour, the ring's
 * large corner radius plus that outward offset reads as a pill that overlaps
 * the row above/below it (owner screenshot, round 2 pass B). Pulling the
 * offset negative draws the ring back inside the row's own border box
 * instead, so it never extends past the row's own `rounded-control` shape
 * into a neighbour.
 *
 * -4px, not -2px (round-2 fix batch, deviation #97): a 2px-wide outline at
 * a -2px offset occupies the row's OUTERMOST 2px — exactly where
 * `SidebarNav`'s active-item accent bar (`w-0.5`, `left-0`, i.e. also the
 * outermost 2px) already lives, so the two painted the same pixels and the
 * ring visually swallowed the bar under focus (live-measured: both bands at
 * screen x 8-10 on the rendered nav). -4px moves the ring's band to the row's
 * next 2px in (x 10-12 in that same measurement) — flush against the bar's
 * inner edge, clear of it, still well inside the row's own shape.
 */
export const focusRingInset = "focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-focus";

/**
 * The focus ring drawn on an element's `::after`, for a button stretched over
 * a larger target with `after:absolute after:inset-0` (the row sheet's Add
 * rows): the ring outlines the whole target, not the small button inside it.
 */
export const focusRingAfter =
  "focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:outline-offset-0 focus-visible:after:outline-focus";

// ---------------------------------------------------------------------------
// Buttons
//
// btnPrimary / btnSecondary / btnGhost / btnDanger bake in the app's default
// (medium) size directly, so the ~25 existing call sites across the app that
// use one of these alone — `className={btnPrimary}`, with no second class —
// keep rendering a correctly-sized button with zero changes elsewhere.
// btnSizeSm / btnSizeLg are for the rarer call site that wants a different
// size: build that button's classes by hand from the colour pieces below
// rather than appending a size override onto one of these strings — two
// utilities that set the same CSS property (e.g. two `h-*` classes) don't
// reliably resolve by string order, only by the generated stylesheet's own
// rule order, which a caller cannot see or control.
// ---------------------------------------------------------------------------

const btnShape = `inline-flex items-center justify-center gap-1.5 rounded-control text-sm font-semibold transition-colors duration-150 ${focusRing} disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50`;
const btnSizeMdInternal = "h-10 px-4";

export const btnPrimary = `${btnShape} ${btnSizeMdInternal} bg-accent-solid text-accent-contrast hover:bg-accent-solid-hover`;

export const btnSecondary = `${btnShape} ${btnSizeMdInternal} border border-line bg-surface-2 text-content-secondary hover:bg-surface-active`;

/** Transparent until hovered — for a tertiary action that shouldn't compete with the primary/secondary pair on the same row. */
export const btnGhost = `${btnShape} ${btnSizeMdInternal} text-content-muted hover:bg-surface-2 hover:text-content`;

export const btnDanger = `inline-flex items-center justify-center gap-1.5 rounded-control px-3 py-1 text-xs font-medium text-negative transition-colors duration-150 ${focusRing} hover:bg-negative-soft disabled:cursor-not-allowed disabled:opacity-50`;

/** A filled destructive action (e.g. a delete-confirmation button) — the solid sibling of `btnDanger`'s ghost treatment. Matches `ConfirmDialog`'s confirm button. */
export const btnDangerSolid = `${btnShape} ${btnSizeMdInternal} bg-negative-solid text-content-inverse hover:bg-negative-solid-hover`;

/** A square 36px ghost button for icon-only controls (row menus, dismiss buttons). */
export const btnIcon = `inline-flex h-9 w-9 items-center justify-center rounded-control text-content-muted transition-colors duration-150 ${focusRing} hover:bg-surface-2 hover:text-content disabled:cursor-not-allowed disabled:opacity-50`;

/**
 * Borderless pills for an action on a selection or a blank field: `pillAccent`
 * for the action itself (Edit, the row sheet's Add), `pillNeutral` for the
 * quiet one beside it (Clear). Colour and shape only: each call site sets its
 * own height, padding and text size. Put them on the button, or on a span
 * inside a larger touch target (the phone's selection bar, the row sheet's
 * Add rows). On a span the hover shows only while the pointer is over the
 * pill itself, not over the rest of the target. Those targets are on touch
 * screens, where there is no hover.
 */
const pillShape =
  "inline-flex items-center justify-center gap-1 rounded-pill font-medium transition-colors duration-150";
export const pillAccent = `${pillShape} bg-accent-soft text-accent hover:bg-accent-soft-hover`;
export const pillNeutral = `${pillShape} bg-surface-3 text-content-secondary hover:bg-surface-active hover:text-content`;

/** Size overrides for a hand-built button — see the module doc above on why these aren't appended onto btnPrimary etc. */
export const btnSizeSm = "h-9 px-3 text-sm";
export const btnSizeMd = "h-10 px-4 text-sm";
export const btnSizeLg = "h-11 px-5 text-base";

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * The app's one inline-text-link recipe. Before the accent went ink (owner
 * ruling 2026-09-02, deviation #85), a plain `text-accent` was enough to
 * mark a "View all"-style link as a link — cyan-teal was a colour nothing
 * else in the UI used. Ink has no hue of its own to stand out by, so every
 * such link is now always underlined (not just on hover) so it keeps
 * reading as a link regardless of colour; the underline itself starts at
 * the softer `accent-line` and strengthens to full `accent` on hover, so
 * there's still a hover response.
 */
export const linkClass = `rounded-sm text-accent underline underline-offset-2 decoration-accent-line hover:decoration-accent ${focusRing}`;

/**
 * A card header's quiet link to the full page ("View all", "View budgets"):
 * small, secondary, always underlined, with the shared focus ring.
 */
export const cardHeaderLink = `rounded-sm text-xs text-content-secondary underline hover:text-content ${focusRing}`;

// ---------------------------------------------------------------------------
// Card grids
// ---------------------------------------------------------------------------

/**
 * A responsive grid of entity cards (accounts, buckets). One column until
 * `lg`, then two, then three at `xl`: on the default page width a two-column
 * step at `sm`/`md` squeezes a card's name and figure into too little room.
 */
export const cardGridClass = "grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3";

/**
 * The shared "create action, dashed and quiet" recipe every add tile/row in
 * the app builds on — a grid tile (`addTileClass`), a list's closing row
 * (`addRowClass`), and a denser cut for a tighter list (`addRowClassCompact`,
 * e.g. the account activity list's inline create tiles) used to each define
 * this same string by hand, one character apart from the next. Disabled
 * states are part of the base recipe (not every call site uses them, but a
 * `disabled` attribute with no matching `disabled:` classes would otherwise
 * render as a plain, still-hoverable button).
 */
const dashedTileBase = `flex items-center justify-center rounded-card border border-dashed border-line text-sm font-medium text-content-muted transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 hover:text-content disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:bg-transparent disabled:hover:text-content-muted ${focusRing}`;

/**
 * The create action as a grid's last item, sized like a card: `h-full`
 * stretches it to the row, `min-h-20` keeps it card-sized when it sits alone
 * in its row.
 */
export const addTileClass = `${dashedTileBase} h-full min-h-20 px-5 py-4`;

/** The create action as the last row of a one-column list: the add tile's look at a row's height. */
export const addRowClass = `${dashedTileBase} w-full px-5 py-4`;

/** The same row, at a denser padding — a list with more, shorter rows (e.g. account activity's create tiles). */
export const addRowClassCompact = `${dashedTileBase} w-full px-4 py-3`;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The shape every form field shares: full width, 40px, 16px text, border, radius, fill and focus ring. */
const fieldShell = `block h-10 w-full min-w-0 rounded-control border border-line bg-surface-2 text-base text-content transition-colors duration-150 ${focusRing} disabled:cursor-not-allowed disabled:opacity-50`;

export const inputClass = `${fieldShell} px-3 placeholder:text-content-placeholder`;

export const labelClass = "block text-sm font-medium text-content-secondary";

/**
 * In-field clear (✕) button for a text-like input. Two classes make one
 * control. The button is the hit area: absolutely positioned over the
 * input's reserved right padding (`w-8`), full height, so the target is the
 * whole strip, not just the glyph. The visible control is the circle inside
 * it (`inputClearCircleClass`, wrapping an `xMark` icon): the ✕ shows at
 * rest, and the circle's background fills in on the button's hover and
 * keyboard focus (`group-*`, so the state lives on the button that actually
 * receives it). The focus ring draws on the circle, not the rectangular hit
 * area. The base for the touch recipes below, which every call site uses.
 */
export const inputClearButtonClass =
  "group absolute inset-y-0 right-0 flex w-8 items-center justify-center outline-none";

/**
 * The same clear control a thumb's 44px wide below `md` and
 * `inputClearButtonClass`'s 32px at `md`+, such as the transactions search,
 * whose field is 44px tall on a phone. Pair it with `touchInputClearablePad`
 * on the input.
 */
export const touchInputClearButtonClass = `${inputClearButtonClass} max-md:w-11`;
/** The input's right padding under `touchInputClearButtonClass`. */
export const touchInputClearablePad = "pr-8 max-md:pr-11";

/**
 * The touch clear control on a 40px field: `NativeDateInput`'s optional date
 * or month, and `SearchableCombobox`'s clearable Bucket, Category or payee.
 * Below `md` it is 44px wide and reaches 2px past the field above and below,
 * so it is 44px tall too while the field keeps its 40px. The overhang is
 * transparent and falls in the gap every form leaves between fields. Pair it
 * with `fieldClearablePad` on the input.
 */
export const fieldClearButtonClass = `${touchInputClearButtonClass} max-md:-inset-y-0.5`;
/** The input's right padding under `fieldClearButtonClass`. */
export const fieldClearablePad = touchInputClearablePad;

/** The visible circle inside `inputClearButtonClass` — see that comment. */
export const inputClearCircleClass =
  "flex h-6 w-6 items-center justify-center rounded-full text-content-muted transition-colors duration-150 group-hover:bg-surface-active group-hover:text-content group-focus-visible:bg-surface-active group-focus-visible:text-content group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-focus";

// The app's one select look, which `SelectField` (components/ui/SelectField.tsx)
// builds. A select among the text fields of a form takes their shape at every
// width: `inputClass`'s shell, with room on the right for its chevron. Its own
// arrow is removed so it draws the same on every browser, and the chevron is
// drawn beside it. 16px text also keeps iOS from zooming on focus.
export const selectFieldClass = `${fieldShell} appearance-none pl-3 pr-9`;
/** Holds a `selectFieldClass` select and its chevron. */
export const selectFieldWrap = "relative flex w-full";
/** The drawn chevron of a `selectFieldClass` select, at every width. */
export const selectFieldChevron =
  "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted";

/**
 * A small control in a row of them, such as the Transactions pager: 44px
 * tall below `md` for the touch minimum, 36px from `md`. No text colour and
 * no padding: a square icon button and a select want different ones.
 */
export const compactControlShell = `inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface-2 text-sm font-medium transition-colors duration-150 md:h-9 ${focusRing}`;
/**
 * The compact select, `SelectField`'s `compact` variant: the shell, with room
 * on the right for its chevron. 16px text below `md`, as every field there
 * has, so an iPhone does not zoom the page when it takes focus.
 */
export const selectCompactClass = `${compactControlShell} w-full appearance-none pl-3 pr-9 text-content max-md:text-base`;

/** A short explanatory line under a field — never a colour signal. */
export const fieldHintClass = "mt-1 text-sm text-content-muted";

/** A field's validation error line. */
export const fieldErrorClass = "mt-1 text-sm text-negative";

/**
 * A list's place-holding line, "Loading…" or "Nothing here yet", in a solid
 * subtle box. The two share it so a list keeps its height when the first
 * load turns into an empty state. Solid, not dashed: a dashed box is a
 * pressable add tile.
 */
export const statusBox = "rounded-control border border-line-subtle px-4 py-5 text-sm text-content-muted";

/**
 * Text to be copied exactly, such as a key or a command: monospace on the
 * field fill, and one tap selects all of it. Size, padding and scrolling are
 * the caller's.
 */
export const codeSurface = "rounded-control border border-line bg-surface-2 font-mono text-content select-all";

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export const cardClass = "rounded-card border border-line-subtle bg-surface-1 shadow-card";
/** Generous padding — dashboard/overview surfaces. */
export const cardPadClass = "p-6";
/** Dense padding — tables and list-heavy surfaces. */
export const cardPadDenseClass = "p-4";
/**
 * A list card below `md` only: `cardClass` without its shadow, the look of a
 * phone's per-bucket budget card on the dashboard. For a row
 * that becomes a card of its own on a phone.
 */
export const listCardBelowMd = "max-md:rounded-card max-md:border max-md:border-line-subtle max-md:bg-surface-1";
/**
 * Takes a card's own chrome off below `md`, for a panel whose rows become
 * cards of their own on a phone. Undoes every `cardClass` token and either
 * padding.
 */
export const cardChromeOffBelowMd =
  "max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none";
/**
 * A dashboard panel's padding below `md`: the standing panel's `p-4`, so on a
 * phone every panel's text starts on the same left edge and ends on the same
 * right one. Layered over the element's `md`+ padding, which it replaces below
 * `md` only.
 */
export const panelPadBelowMd = "max-md:p-4";
/**
 * Drops a panel row's side padding and its hover fill below `md`. The padding
 * is room for the fill, so the two go together: the row's first column sits on
 * the panel's text edge, and a narrow mouse window paints no fill flush
 * against the text. A budget row does the same on its own element.
 */
export const rowPadOffBelowMd = "max-md:px-0 max-md:hover:bg-transparent";
/** A card's header row: title + optional trailing action. */
export const panelHeadClass = "mb-4 flex items-center justify-between gap-3";
export const sectionTitle = "text-lg font-semibold tracking-tight text-content";
export const eyebrowClass = "text-xs font-semibold uppercase tracking-wider text-content-muted";

// ---------------------------------------------------------------------------
// Tables — the dense-data recipe (docs/design/ui-overhaul.md §b)
// ---------------------------------------------------------------------------

export const tableClass = "w-full text-sm";
export const theadClass = "sticky top-0 z-10 bg-surface-2 text-content-muted";
export const thClass = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide";
export const thNumClass = `${thClass} text-right`;
export const trClass = `border-b border-line-subtle transition-colors duration-150 hover:bg-surface-2`;
export const tdClass = "px-3 py-2.5";
export const tdNumClass = `${tdClass} text-right tnum`;

/**
 * A table whose last columns are pinned to the right from `md`. When the
 * table is wider than its box, the pinned cells cover the columns that run on
 * under them, and the pinned edge is the only cue that the table scrolls.
 *
 * `tableScrollBox` goes on the scroll box, together with `useScrollMoreCue`
 * on the same element, which marks the box with `data-scroll-more` while
 * there is more table to its right. `pinnedEdge` goes on the leftmost pinned
 * cell of every row: a hairline on its left, plus a soft shadow over the
 * columns underneath while the box is marked. Scrolled to the right end, the
 * shadow goes, since nothing is hidden any more. `pinnedEdgeHead` is the
 * header cell's cut, which also draws the head's bottom rule.
 */
export const tableScrollBox = "group/table-scroll";
//
// The hairline is an inset shadow on the cell. The cue is an outer shadow,
// and a cell cannot cast one: Chromium paints no outer `box-shadow` on a
// table cell while the table collapses its borders, which Tailwind's
// preflight sets on every table. So a `::before` the size of the cell casts
// it instead. The sticky cell is its containing block, so it moves with the
// cell, and it lets every pointer through. Its clip-path cuts the shadow at
// the cell's top and bottom and lets it out on the left only, so the strip
// runs on unbroken from row to row. Kept off the top and bottom by a negative
// spread instead, each cell's shadow faded out at its own edges and the strip
// read as a dashed line.
const pinnedCue =
  "md:before:pointer-events-none md:before:absolute md:before:inset-0 md:before:[clip-path:inset(0_0_0_-2rem)] md:group-data-[scroll-more]/table-scroll:before:shadow-pinned";
export const pinnedEdge = `md:inset-shadow-[1px_0_0_var(--line-subtle)] ${pinnedCue}`;
export const pinnedEdgeHead = `md:inset-shadow-[1px_0_0_var(--line-subtle),0_-1px_0_var(--line-subtle)] ${pinnedCue}`;

// ---------------------------------------------------------------------------
// Badges / chips
// ---------------------------------------------------------------------------

export const badgeBase = "inline-flex items-center rounded-pill border px-2.5 py-0.5 text-xs font-medium";
export const badgeNeutral = `${badgeBase} border-line bg-surface-2 text-content-secondary`;
export const badgeAccent = `${badgeBase} border-accent-line bg-accent-soft text-accent`;
export const badgePositive = `${badgeBase} border-positive-line bg-positive-soft text-positive`;
export const badgeNegative = `${badgeBase} border-negative-line bg-negative-soft text-negative`;
export const badgeWarning = `${badgeBase} border-warning-line bg-warning-soft text-warning`;
/** An outline chip for a state that is over, such as an expired key. Reads apart from `badgeNeutral` without borrowing a hue. */
export const badgeMuted = `${badgeBase} border-line-strong text-content-muted`;

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

/**
 * The glass surface every floating panel shares — modals, popovers, menus and
 * the mobile drawer: a translucent `surface-1` that blurs whatever sits
 * behind it, a soft border and a hairline ring. One recipe, so a menu, a
 * popover and a modal read as the same material at different sizes. The
 * `supports-backdrop-filter:` step goes a touch more translucent only where
 * the blur is actually available, so browsers without it get a more opaque
 * panel instead of see-through text.
 */
export const glassSurface =
  "border border-line/60 bg-surface-1/70 ring-1 ring-line-subtle backdrop-blur-md supports-backdrop-filter:bg-surface-1/60";

/**
 * The denser cut of the same glass, for menus and combobox listboxes: rows of
 * options sit directly over rows of form labels or table text, and at the
 * panel translucency that underlying text ghosts through between the
 * options (live-checked: a bucket listbox over the transaction form showed
 * "Description (optional)" bleeding through "Transport"). Same border, ring
 * and blur — only the fill is near-opaque (95%, no lighter step even with
 * backdrop-filter: at 90% the ghosting was still faintly readable), so the
 * edges still read as glass while the text inside stays clean.
 */
export const glassSurfaceDense = "border border-line/60 bg-surface-1/95 ring-1 ring-line-subtle backdrop-blur-md";

/** A popover panel: glass at card radius, padded, popover shadow. */
export const popoverPanel = `rounded-card ${glassSurface} p-3 shadow-popover`;
/**
 * The denser cut of a popover panel, for one that floats over undimmed,
 * dense content it has no scrim to protect — a table row's own text, not a
 * modal's darkened backdrop. Same border, ring, radius and shadow as
 * `popoverPanel`; only the fill is the near-opaque `glassSurfaceDense` cut,
 * so the underlying row stops ghosting through the panel's own labels.
 */
export const popoverPanelDense = `rounded-card ${glassSurfaceDense} p-3 shadow-popover`;
/** A table row's prompt panel (confirm, paperwork date, the quick-fill card): the dense popover cut at a fixed 288px wide. */
export const rowPromptPanel = `w-72 ${popoverPanelDense}`;
/**
 * A table row's files popover: the same dense cut at 384px, room for a
 * whole Drive file name. Every name a row's files get starts with the same
 * date and payee, so a narrower panel cuts them all to the same words.
 */
export const rowFilesPanel = `w-96 ${popoverPanelDense}`;
/** A panel that drops from the app header row (balance, date range): glass at card radius, `p-4`, popover shadow. */
export const headerPanel = `rounded-card ${glassSurface} p-4 shadow-popover`;

// ---------------------------------------------------------------------------
// Sheets — the parts `BottomSheet` renders on Base UI's Drawer
// (docs/design/mobile-sheets-stage-4.md §d.6). Below `md` a sheet hangs off
// the bottom edge of the viewport; at `md`+ the same DOM is a centred panel.
// The motion lives in `globals.css` (`sheet-backdrop-motion`,
// `sheet-popup-motion`), timed by the motion tokens there.
// ---------------------------------------------------------------------------

/** The dimmed page behind a sheet. It fades in and out, and lightens as the sheet is dragged away. */
export const sheetBackdrop = "fixed inset-0 z-50 bg-overlay sheet-backdrop-motion";

/**
 * The full-screen box that places the sheet: at the bottom edge below `md`,
 * centred at `md`+. `touch-none` keeps a drag on it from scrolling the page
 * behind; the sheet's body opts back in to scroll.
 */
export const sheetViewport = "fixed inset-0 z-50 flex touch-none items-end justify-center md:items-center md:p-4";

/**
 * The viewport once its md+ panel has opened: the panel's top is pinned by
 * a margin (`useAnchoredPanel`), so a change in its height moves only its
 * bottom edge. Below `md` it is the same as `sheetViewport`.
 */
export const sheetViewportAnchored =
  "fixed inset-0 z-50 flex touch-none items-end justify-center md:items-start md:p-4";

/**
 * The sheet's shape, shared by both glass cuts below: rounded at the top
 * corners only while it hangs off the bottom edge and fully rounded once it
 * is a centred panel. Below `md` it stops 1.5rem short of the top safe area
 * and stands at least `--sheet-min-height` tall above the home indicator, so
 * a prompt with one field does not sit as a sliver at the bottom; at `md`+ it
 * keeps the dialog cap of 90dvh and sizes to its content. Its width at `md`+
 * comes from `BottomSheet`'s `panelClassName`.
 */
const sheetPopupShape =
  "relative flex w-full flex-col outline-hidden rounded-t-card shadow-modal max-md:border-b-0 md:rounded-card max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] max-md:min-h-[calc(var(--sheet-min-height)+env(safe-area-inset-bottom))] md:max-h-[90dvh] sheet-popup-motion";

/** The sheet itself, in the glass every floating panel shares. */
export const sheetPopup = `${sheetPopupShape} ${glassSurface}`;

/**
 * A sheet stacked on another sheet, in the denser glass: the rows of the
 * sheet underneath would otherwise ghost through its own, the reason menus
 * use the dense cut too.
 */
export const sheetPopupStacked = `${sheetPopupShape} ${glassSurfaceDense}`;

/** The drag handle: the one visible cue that a sheet can be swiped. A phone-only affordance. */
export const sheetHandle = "mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-pill bg-line-strong md:hidden";

/**
 * A sheet's title row, fixed above its scrolling body, so the title never
 * scrolls away under a long form.
 */
export const sheetHeader = "shrink-0 px-4 pt-4 md:px-6 md:pt-6";
/**
 * The title in a `sheetHeader`: the dialog heading's size and weight. A title
 * that wraps is balanced, so its lines come out about even instead of a full
 * line and a stray word or two on the next.
 */
export const sheetTitle = "text-lg font-semibold text-balance text-content";

/** The scrolling part every sheet body shares. `touch-auto` undoes the viewport's `touch-none`, so the body scrolls under a finger. */
const sheetBodyScroll = "min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain px-4 md:px-6";

/**
 * The sheet's scrolling body, padded for what sits around it. Under a title
 * row it keeps one step below the title; above a footer it keeps one step
 * above the footer's border, and the footer clears the home indicator.
 * Alone, its own bottom padding clears the home indicator.
 */
export function sheetBodyClass({ header, footer }: { header: boolean; footer: boolean }): string {
  const top = header ? "pt-4" : "pt-4 md:pt-6";
  const bottom = footer ? "pb-4" : "pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6";
  return `${sheetBodyScroll} ${top} ${bottom}`;
}

/**
 * A sheet's action row, fixed below its scrolling body, so the actions stay
 * in reach however long the body is, and a short sheet's spare height sits
 * between the fields and the buttons rather than under the buttons. Below
 * `md` its bottom padding clears whichever is taller, the home indicator or
 * the software keyboard: `--drawer-keyboard-inset` is the keyboard's height
 * while one is open (Base UI's `Drawer.VirtualKeyboardProvider` sets it, for
 * a `keyboardAware` sheet), and the keyboard already covers the home
 * indicator, so the two never add up. At `md`+ it is the dialog's footer
 * row, `py-4`.
 */
export const sheetFooter =
  "shrink-0 border-t border-line-subtle px-4 pt-4 pb-[calc(1rem+max(env(safe-area-inset-bottom),var(--drawer-keyboard-inset,0px)))] md:px-6 md:pb-4";

/** The buttons in a `sheetFooter`: two equal 44px halves below `md`, the dialog's right-aligned row at `md`+. */
export const sheetActions = "grid grid-cols-2 gap-2 md:flex md:justify-end";

/**
 * Why a save failed, at the top of a sheet's footer, above the actions that
 * retry it: in view however far down the body is scrolled, where the end of
 * a long form is not.
 */
export const sheetFooterError = "mb-3 text-sm text-negative";

// ---------------------------------------------------------------------------
// The mobile nav drawer — the parts `MobileNavDrawer` renders on Base UI's
// Drawer. Phone-only: it hangs off the left edge below `md` and never renders
// at `md`+, where the static rail takes over. `z-[45]` keeps it under every
// sheet (z-50), so a sheet always paints over it whatever the DOM order. The
// motion is `nav-drawer-motion` in `globals.css`, on the sheet's tokens.
// ---------------------------------------------------------------------------

/** The dimmed page behind the nav drawer. Same dim and motion as a sheet's backdrop. */
export const navDrawerBackdrop = "fixed inset-0 z-[45] bg-overlay sheet-backdrop-motion md:hidden";

/** The full-screen box that places the nav drawer against the left edge. */
export const navDrawerViewport = "fixed inset-0 z-[45] flex touch-none md:hidden";

/**
 * The nav drawer itself: full height, 18rem wide but never more than 85% of
 * a narrow screen, in the shared glass with its one visible edge on the right.
 */
export const navDrawerPopup =
  "relative flex h-dvh w-72 max-w-[85vw] flex-col border-r border-line/60 bg-surface-1/70 px-2 py-4 shadow-modal outline-hidden backdrop-blur-md supports-backdrop-filter:bg-surface-1/60 nav-drawer-motion";

/** A floating menu panel (row-actions menu, dropdown, combobox listbox): the dense glass at control radius. */
export const menuPanel = `rounded-control ${glassSurfaceDense} py-1 shadow-popover`;
/** One row inside a `menuPanel`. */
export const menuItem =
  "w-full px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-2 hover:text-content";

// ---------------------------------------------------------------------------
// Touch targets (docs/design/transactions-mobile.md §f)
// ---------------------------------------------------------------------------

/**
 * Below `md`, any control a thumb must hit is at least 44x44 — the touch
 * minimum a mouse-driven header control never needed. Inert at `md`+, where
 * every call site already sizes correctly for a pointer. Composed into
 * `headerIconBtn` below rather than added per call site, so +Add,
 * the filter toggle and every `PeriodSelector` button all grow together.
 *
 * Scoped with `max-md:` rather than reset with `md:min-h-0`: a reset also
 * undoes a control's own minimum from `md` (a `min-h-10` field dropped to
 * its content height), where inert has to mean untouched.
 */
export const touchTarget = "max-md:min-h-11 max-md:min-w-11";

/**
 * A hit area of at least 44x44 below `md` for a control that must not grow,
 * such as a chip's × or a short segment: an invisible `::after` centred on
 * the control takes the taps, so nothing around it moves. It covers the
 * control's own box and reaches past it only where that box is under 44px,
 * so a 12px glyph gets a 44x44 square and a 90x32 segment gets a 90x44 band.
 * Leave room for it: a neighbour inside its reach would lose taps to it. It
 * sets `relative` to anchor the pseudo-element, so it is for a statically
 * positioned control, not an `absolute` or `sticky` one. Inert at `md`+.
 */
export const touchHitArea =
  "relative max-md:after:absolute max-md:after:top-1/2 max-md:after:left-1/2 max-md:after:size-full max-md:after:min-h-11 max-md:after:min-w-11 max-md:after:-translate-x-1/2 max-md:after:-translate-y-1/2";

// ---------------------------------------------------------------------------
// Header controls (docs/design/ui-overhaul.md Slice 2)
// ---------------------------------------------------------------------------

/**
 * The shape every icon-only header control shares — size, radius, border
 * box, padding, colour-transition timing, focus ring and the 44px touch
 * minimum below `md` — with none of the resting colours baked in. Split out
 * from `headerIconBtn` below (Item 1, round 3 owner screenshot: the
 * dashboard eye rendered visibly smaller than the Transactions filter
 * button on mobile) because `ConfirmedToggle` needs this exact box at two
 * *different* colour states (off/on) and used to hand-roll its own class
 * list instead — which is how it silently drifted out of `touchTarget`
 * entirely. Any header icon button with its own colour states (the eye) or
 * without one (`headerIconBtn` below) composes from this single shape, so
 * the two can never again render at different sizes.
 *
 * `inline-flex items-center justify-center` keeps the icon centred once
 * `touchTarget` grows the box past the icon's own size.
 */
export const headerIconBtnShape = `inline-flex items-center justify-center rounded-control border p-2 transition-colors duration-150 ${focusRing} ${touchTarget}`;

/**
 * Resting (non-stateful) colours for a header icon button — `surface-1` at
 * rest, `surface-2` on hover, matching the header's period and balance
 * pills so every control in that row rests on one shade and lifts to one
 * shade; an icon button resting on the pills' hover shade read as a
 * different kind of control, and in light theme the two simply swapped.
 */
const headerIconBtnColours = "border-line bg-surface-1 text-content-secondary hover:bg-surface-2";

/**
 * A small icon-only control used in the header's period/filter cluster
 * (PeriodSelector's prev/next/today/custom-range/cancel buttons,
 * FilterToggle). Distinct from `btnIcon` (a fixed 36px square) — these size
 * to their icon plus `p-1.5` at `md`+, and grow to the 44px touch minimum
 * below it via `headerIconBtnShape`. Shared as one constant, not inlined per
 * call site, because `AppHeader.test.tsx` pins FilterToggle's class list to
 * exactly this recipe — reordering the tokens inside it is safe as long as
 * this constant (built from `headerIconBtnShape`) stays the single source.
 */
export const headerIconBtn = `${headerIconBtnShape} ${headerIconBtnColours}`;

// ---------------------------------------------------------------------------
// The floating Add button (docs/design/quick-view-retirement.md §f.4)
//
// Below `md` the header's Add button leaves the header row and floats at the
// bottom right, where a thumb reaches it. It is the same element at every
// width: these classes only apply below `md`, so the `md`+ header is untouched.
// ---------------------------------------------------------------------------

/**
 * A 56px circle, 16px from the right edge and 24px above the bottom edge plus
 * the safe-area inset. The inset is zero until the app opts into
 * `viewport-fit=cover`. `z-40` keeps it over the page and under every overlay:
 * the nav drawer (`z-[45]`), the sheets (`z-50`) and the popovers and menus
 * (`z-9999`), so a sheet's backdrop covers it.
 */
export const floatingActionBelowMd =
  "max-md:fixed max-md:right-4 max-md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:size-14 max-md:shadow-popover";

/**
 * The layers of an in-page popup that is not portalled (a card's menu, an
 * inline editor), in the band above the floating button (`z-40`) and under
 * the nav drawer (`z-[45]`). The overlay that closes the popup on an outside
 * tap covers the button too, so a tap there closes the popup like any other
 * outside tap; the popup sits one step above its overlay. A portalled
 * `AnchoredPopover` with `underSheets` uses the popup's layer, so a dialog it
 * opens paints over it.
 */
export const inPagePopupOverlayLayer = "z-[41]";
export const inPagePopupLayer = "z-[42]";

/**
 * Room at the bottom of `<main>` below `md`, so the last element of a page
 * scrolls clear of the floating button with 8px to spare. The button's top
 * edge sits 5rem (24 + 56px) plus the safe area above the viewport bottom,
 * and `PageContainer` already ends every page with 3rem, so `<main>` adds
 * 5rem + 0.5rem - 3rem = 2.5rem, plus the safe area.
 *
 * The scroll padding keeps the same 5.5rem free when the browser scrolls an
 * element into view, as it does for a control that takes keyboard focus, so a
 * focused control never lands under the button.
 */
export const floatingActionClearanceBelowMd =
  "max-md:pb-[calc(2.5rem+env(safe-area-inset-bottom))] max-md:scroll-pb-[calc(5.5rem+env(safe-area-inset-bottom))]";

// ---------------------------------------------------------------------------
// Segmented controls (tab switchers) — docs/design/ui-overhaul.md deviation #82
//
// Colour-only recipes, not full layout: every call site keeps its own
// padding/radius/sizing (two tray shapes are in deliberate use — see below —
// and per-segment padding varies with the modal), but every one of them
// composes `segmentActive`/`segmentInactive` for the active/rest colours so
// the active segment can never again match its own panel's background
// (TransactionForm's Expense tab was unreadable in dark theme: its active
// segment read `bg-surface-active`, which used to equal the panel's own
// `surface-3`). Adopted by TransactionForm, RecurringTemplateForm,
// ReconcileDialog, AccountReconcileDialog, AccountTransferForm,
// AccountDetailView and the settings page's tab bar.
//
// The keyboard half is `useRovingChoice` (hooks/useRovingChoice.ts): every
// segmented control is a `radiogroup` of `radio` buttons, or a `tablist` of
// `tab` buttons when it switches a view, and is one Tab stop whose arrow
// keys move the choice.
// ---------------------------------------------------------------------------

/**
 * The padded tray a segmented control's individually-rounded pill segments
 * sit in — ReconcileDialog/AccountReconcileDialog's Set/Adjust,
 * AccountTransferForm's deposit/withdrawal, AccountDetailView's
 * Transfers/Adjustments, and the settings page's tab bar. TransactionForm and
 * RecurringTemplateForm's type switcher use the older
 * edge-to-edge two-rectangle toggle instead (the container clips with
 * `overflow-hidden` and its segments carry no gap or individual radius) — a
 * deliberate different shape, not a use of this recipe — but they still take
 * `segmentActive`/`segmentInactive` below for colour.
 */
export const segmentedTray = "flex gap-1 rounded-control border border-line bg-surface-2 p-0.5";

/**
 * The active segment inside either tray shape. `surface-active` is a
 * distinct step above both `surface-2` (this tray) and `surface-3` (a modal
 * panel), so it stays visibly raised whichever the tray sits on.
 * `font-semibold` plus a subtle `shadow-card` lift mean the active state
 * reads at a glance even where the colour step alone is subtle — this is
 * what fixes "can barely distinguish the Expense tab" (owner feedback #82).
 */
export const segmentActive = "bg-surface-active text-content font-semibold shadow-card";

/**
 * The resting (inactive) segment inside the same control. The hover step is
 * gated on `:enabled`, so a locked segment (a type the edit form cannot
 * change) does not answer the pointer. Every caller renders a `<button>`.
 */
export const segmentInactive = "text-content-muted font-medium enabled:hover:text-content-secondary";

/**
 * One segment inside `segmentedTray`: equal widths and the tray's radius.
 * Colour comes from `segmentActive`/`segmentInactive`. A control a finger
 * works in a sheet adds `max-md:min-h-11` for the 44px target.
 */
export const segmentButton = `flex-1 rounded-control px-3 py-1.5 text-sm transition-colors ${focusRing}`;

// ---------------------------------------------------------------------------
// Donut legends
//
// Every allocation donut on the app carries the same legend: a colour dot, a
// name, an amount and a share. Four of them exist — the dashboard's Spending
// and Income halves, and the Buckets page's own two panels — and each used to
// build its own row box. They drifted twice over: Spending's rows are links
// and carry `-mx-1 px-1 py-0.5` so the hover tint clears the text, the rest
// carried nothing, and the difference showed as rows sitting 4px apart with a
// taller rhythm on one side than the other (owner, 2026-09-19 and 2026-09-21).
//
// Whether a row is clickable must not be visible in where it sits, so all four
// build from these two strings. A link adds hover, focus and transition on
// top — none of which move anything.
// ---------------------------------------------------------------------------

/** One legend row: the box, shared by link rows and plain rows alike. */
export const legendRow = "-mx-1 flex items-center justify-between gap-3 rounded-control px-1 py-0.5";

/** The `<ul>` around them, so the row rhythm is one decision. */
export const legendList = "space-y-2 text-sm";

/**
 * Data on screen that belongs to another query than the one asked for (the
 * previous page, filter or period while the next loads). The caller also
 * sets `aria-busy` on the same element.
 */
export function dimmedWhileLoading(dimmed: boolean): string {
  return `transition-opacity duration-150 ${dimmed ? "opacity-60" : ""}`;
}
