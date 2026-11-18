"use client";

import {
  sheetBackdrop,
  sheetBodyClass,
  sheetFooter,
  sheetHandle,
  sheetHeader,
  sheetPopup,
  sheetPopupHeld,
  sheetPopupStacked,
  sheetPopupTall,
  sheetTitle,
  sheetViewport,
  sheetViewportAnchored,
} from "@/components/ui/styles";
import { useAnchoredPanel } from "@/hooks/useAnchoredPanel";
import { useEntryPressGuard } from "@/hooks/useEntryPressGuard";
import { useHeldSheetHeight } from "@/hooks/useHeldSheetHeight";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMainScrollLock } from "@/hooks/useMainScrollLock";
import { useNativeTapWhileKeyboardDown } from "@/hooks/useNativeTapWhileKeyboardDown";
import { useScrollHold } from "@/hooks/useScrollHold";
import { useStillUnderFinger } from "@/hooks/useStillUnderFinger";
import { focusIsInsideOrLost } from "@/lib/focus";
import { restoreFocus } from "@/lib/lastInputModality";
import { Drawer } from "@base-ui/react/drawer";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { closingBackdropHandlers, closingBackdropStyle, useClosingPresses } from "./closingSheet";

// ---------------------------------------------------------------------------
// BottomSheet: the app's one sheet primitive, on Base UI's Drawer. Lifted
// from finanssi, where docs/design/mobile-sheets-stage-4.md designed it.
// docs/app/shell.md states the conventions every sheet keeps.
//
// Below `md` it hangs off the bottom edge of the viewport: it slides up on
// open, follows a finger down, and lets go past half its height. At `md`+
// the same DOM is a centred panel that fades and scales. The layout is the
// `sheet*` recipes in styles.ts; the motion is the `sheet-*-motion`
// utilities in globals.css.
//
// Base UI owns the swipe, the focus trap, Escape and the outside press. This
// component owns five things Base UI does not do the way this app needs (presses while closing: closingSheet.ts):
//
// 1. The entry animation. Base UI plays an entry only for a root that
//    mounted closed and then opened; most callers mount this component
//    already open. So the Drawer root starts closed and follows `open` from
//    a layout effect, one synchronous commit later, before the first paint.
//
// 2. The `<main>` scroll lock. `<main>` is the app shell's one scroll
//    container (components/shell/AppShell.tsx). Base UI's own lock
//    targets `<html>`/`<body>`, which never scroll here. So the Drawer runs
//    with `modal="trap-focus"` and this component locks `<main>`, restoring
//    both `overflow` and the exact `scrollTop` on close.
//
// 3. Focus return. Base UI returns focus only once the exit animation has
//    finished, and can paint a ring on a tap close. So `finalFocus` is off
//    and this component restores focus itself the moment `open` goes false,
//    through `restoreFocus` (ringed only after a keyboard close). The target
//    is `returnFocusTo` when the caller names one, otherwise the element
//    captured in a layout effect when `open` turns true. It restores only
//    while focus is inside the sheet, on <body>, or still on that captured
//    element: Base UI moves focus in a frame after opening, so a sheet closed
//    within that frame has never held focus. The sheet's content
//    mounts one commit after that capture (point 1), so a body that focuses
//    itself on mount can no longer be captured by mistake.
//
//    `returnFocusTo` is for the two cases the capture gets wrong. WebKit does
//    not focus a tapped button, so a sheet opened from a tapped row captures
//    <body>. And when one sheet hands over to another in the same click (the
//    row sheet's Confirm opens the confirm prompt), the new sheet captures
//    focus while it is still inside the closing one.
//
//    The content also mounts fresh on every open. A sheet closed with
//    `open={false}` stays in the DOM while it slides out, and reopening it
//    then cancels the exit and would reuse the same content: a body's
//    mount-time self-focus would not run again, Base UI would focus the
//    first field instead (popping a combobox), and a cancelled draft would
//    still be there. A key bumped on each open remounts it.
//
// 4. `dismissible`. While it is false, Escape, an outside press and a swipe
//    are refused, and a swiped sheet springs back to rest. The Android back
//    gesture is refused only once: Base UI's CloseWatcher is used up by the
//    first back and not recreated while the sheet stays open, so a second
//    back navigates. Finanssi's owner kept that, and it is kept here.
//
// 5. A tap outside during the entry. Until the sheet has finished sliding in,
//    an outside press is refused: the second tap of a double tap on its opener
//    must not close a sheet the reader has not seen yet. Escape and a swipe
//    are not affected. A refused press leaves focus in the sheet
//    (`useEntryPressGuard`).
//
// A sheet that is mostly typed into passes `keyboardAware`, and is then
// wrapped in Base UI's `Drawer.VirtualKeyboardProvider`, which keeps the
// focused field in view and sets `--drawer-keyboard-inset`, so the footer
// rides above the keyboard (`sheetFooter`).
// It also takes over every tap on a text field in the sheet and focuses the
// field inside the tap itself, which is what lets iOS raise the keyboard,
// with a trick that keeps WebKit from scrolling to the field as it focuses;
// moving between fields with the keyboard up gets the same treatment. It
// places that tap where the finger lifts, so the body holds still while a
// finger is down (`useStillUnderFinger`): a field the provider's own scroll
// slid away mid-tap would lose it to whatever slid in.
//
// Once the reader hides the keyboard with its own button, iOS raises it
// again only for a real tap, never for that focus from code. So while the
// keyboard is down, a tap on a text field is left to the browser
// (`useNativeTapWhileKeyboardDown`). Base UI takes over only while it is up,
// which is when moving between fields needs its trick.
//
// A field focused by code gets no such trick: iOS shoves the sheet off the
// top as the keyboard rises, so no sheet focuses a text field on open on a
// phone. A short sheet with no footer would be left under the keyboard
// instead of being panned into view, so the keyboard handling is opt-in.
//
// Once open, a sheet holds still. At `md`+ the centred panel keeps its top
// where the centring put it and never gets shorter, so a line that grows it
// grows it downwards (`useAnchoredPanel`). Below `md` the sheet keeps the
// height it opened at, so a line that appears scrolls the body rather than
// moving the sheet's top edge (`useHeldSheetHeight`).
//
// A sheet whose content changes under the thumb, such as a list of search
// results that changes on every keystroke, passes `size="tall"`: one fixed
// height that never follows its content, so its top edge and its fixed
// header never move. Such a sheet often names itself with `ariaLabel` and
// puts its own `header` in the fixed row, such as a search field.
//
// A long form whose fields come and go passes `holdScroll`: scrolled to its
// end, a field that goes away leaves its space as a blank reserve rather
// than pulling everything above it down (`useScrollHold`).
//
// A sheet can stack on another.
// Whatever goes in `stacked` renders inside this sheet's Popup, and a
// `BottomSheet` there is nested in Base UI's sense, which reads nesting from
// the React tree: its DOM lands in this sheet's portal, beside this sheet
// rather than inside it; while it is open this sheet recedes (the recede is
// CSS in `sheet-popup-motion`, written against the variables Base UI sets on
// this Popup), ignores Escape and outside presses, and cannot be swiped. A
// nested sheet knows it is nested through `SheetStackContext` and then:
//
// - leaves `<main>` alone: the sheet underneath holds the lock and releases
//   it last;
// - renders its own backdrop at a lighter dim (Base UI renders none for a
//   nested drawer unless asked) and the raised surface;
// - returns focus to `returnFocusTo`, else the element it captured, else the
//   Popup of the sheet underneath, so focus stays in that sheet when the
//   control that opened this one is gone.
//
// When both close in one update, React runs this sheet's cleanup before the
// one underneath, so focus goes into the sheet underneath, then where it returns it.
// ---------------------------------------------------------------------------

interface SheetStack {
  /** The Popup of the sheet a nested sheet is stacked on: its last focus fallback. */
  parentPopupRef: RefObject<HTMLDivElement | null>;
}

const SheetStackContext = createContext<SheetStack | null>(null);

/**
 * What names the dialog: a visible `title` in a fixed row above the body, or,
 * for a sheet with no title row, an `ariaLabel`. A sheet named by `ariaLabel`
 * may put its own `header` in the fixed row instead, such as a search field
 * or a Back button over a heading.
 */
type SheetName =
  { title: string; ariaLabel?: never; header?: never } | { ariaLabel: string; title?: never; header?: ReactNode };

export type BottomSheetProps = SheetName & BottomSheetBaseProps;

interface BottomSheetBaseProps {
  open: boolean;
  /** Every dismissal the sheet accepts: Escape, a tap outside it, a swipe. */
  onClose: () => void;
  children: ReactNode;
  /** The panel's width at `md`+, e.g. `md:max-w-lg`. Default `md:max-w-md`. */
  panelClassName?: string;
  /**
   * Extra classes for the title, such as the room for its longest form, for
   * a sheet whose title changes while it is open.
   */
  titleClassName?: string;
  /** DOM id for the `role="dialog"` element, for a trigger whose `aria-controls` names it. */
  id?: string;
  /**
   * `false` while the content holds input that a stray gesture must not
   * throw away: Escape, an outside press and a swipe are all refused, and a
   * swiped sheet springs back. Default `true`.
   */
  dismissible?: boolean;
  /**
   * Where focus goes on close, instead of the element that had focus when
   * the sheet opened. For a sheet opened from a tapped control (WebKit does
   * not focus it) or from another sheet (focus is still inside that one).
   */
  returnFocusTo?: HTMLElement | null;
  /**
   * `false` when the caller restores focus itself on every close path. The
   * sheet then restores nothing, and `returnFocusTo` is ignored. Default `true`.
   * Read when the sheet closes, so a caller can also turn it off in the same
   * update that closes the sheet, for one close that placed focus itself.
   */
  restoreFocusOnClose?: boolean;
  /**
   * Called once the sheet has finished sliding in (or fading in, with reduced
   * motion). For content that wants a field focused only when the sheet is at
   * rest: on iOS a date field focused mid-slide opens its picker as a
   * full-screen calendar instead of a popover pointing at the field.
   */
  onOpened?: () => void;
  /**
   * Called once the sheet has finished sliding out (or fading out, with
   * reduced motion). For content that must stay on screen while the sheet
   * leaves and then be forgotten: a secret shown once is cleared here, not
   * when the close starts, so the sheet does not change under the reader as
   * it slides away. Not called when the sheet unmounts before its exit ends.
   */
  onClosed?: () => void;
  /**
   * The action row, fixed below the scrolling body: the actions stay in
   * reach, and a short sheet's spare height sits above them.
   */
  footer?: ReactNode;
  /**
   * A muted note under the title, the full width of the header, for a fact
   * about what the sheet shows. It wraps
   * and is never cut short. Pass it from the first render, or not at all:
   * the header grows by its height, so content arriving later would move
   * everything below it. Left out, the header is the title alone. Not part
   * of the dialog's name. Needs a `title`.
   */
  headerNote?: ReactNode;
  /**
   * The sheet is typed into: its footer rides above a phone's software
   * keyboard, and its body keeps the focused field in view (see the top of
   * this file). Default `false`.
   */
  keyboardAware?: boolean;
  /**
   * The body keeps its scroll position when its content gets shorter, so a
   * field that goes away at the end of a scrolled form moves nothing above
   * it. For a long form with fields that come and go. Default `false`.
   */
  holdScroll?: boolean;
  /**
   * A sheet stacked on this one: a `BottomSheet`, or content that renders
   * one. While it is open this sheet recedes behind it, ignores Escape and
   * outside presses, and cannot be swiped; closing it brings this one back.
   * Rendered outside the body, so this sheet re-rendering never remounts it.
   */
  stacked?: ReactNode;
  /**
   * `"auto"` (default): the sheet's height follows its content. `"tall"`: one
   * fixed height that never follows its content, nearly the whole screen on a
   * phone and `min(48rem, 100dvh - 1rem)` as the centred panel, so content that
   * changes under the thumb (a list of search results) never moves the
   * sheet's top edge or anything in its fixed header.
   */
  size?: "auto" | "tall";
}

/**
 * Text that describes the sheet, rendered in its body: the dialog's
 * `aria-describedby` points at it, so a screen reader reads it with the
 * sheet's name when the sheet opens. A `<p>`.
 */
export function SheetDescription({ className, children }: { className?: string; children: ReactNode }): ReactElement {
  return <Drawer.Description className={className}>{children}</Drawer.Description>;
}

export function BottomSheet({
  open,
  onClose,
  ariaLabel,
  title,
  header,
  children,
  panelClassName = "md:max-w-md",
  titleClassName,
  id,
  dismissible = true,
  returnFocusTo,
  restoreFocusOnClose = true,
  onOpened,
  onClosed,
  footer,
  headerNote,
  keyboardAware = false,
  holdScroll = false,
  stacked,
  size = "auto",
}: BottomSheetProps): ReactElement {
  const popupRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const parentStack = useContext(SheetStackContext);
  const nested = parentStack !== null;
  const stack = useMemo<SheetStack>(() => ({ parentPopupRef: popupRef }), []);
  // Read by the restore when the sheet closes, so the latest element wins.
  const returnFocusToRef = useRef(returnFocusTo);
  const restoreFocusOnCloseRef = useRef(restoreFocusOnClose);
  useLayoutEffect(() => {
    returnFocusToRef.current = returnFocusTo;
    restoreFocusOnCloseRef.current = restoreFocusOnClose;
  });

  const previouslyFocusedRef = useRef<Element | null>(null);
  useLayoutEffect(() => {
    if (open) previouslyFocusedRef.current = document.activeElement;
  }, [open]);

  // The entry animation (point 1 above), and a fresh content mount on every
  // open (point 3 above).
  const [rootOpen, setRootOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  // Whether this open has finished its entry: from then on the md+ panel
  // holds its top (see the top of this file). Still true while it closes, so
  // the panel leaves from where it stood.
  const [settled, setSettled] = useState(false);
  useLayoutEffect(() => {
    if (open) {
      setGeneration((g) => g + 1);
      setSettled(false);
    }
    setRootOpen(open);
  }, [open]);
  const anchored = useAnchoredPanel(settled && !isMobile);
  const held = useHeldSheetHeight(settled && isMobile && size === "auto");
  const nativeTapRef = useNativeTapWhileKeyboardDown(keyboardAware && open);
  const setPopup = useCallback(
    (el: HTMLDivElement | null) => {
      popupRef.current = el;
      anchored.panelRef(el);
      held.panelRef(el);
      nativeTapRef(el);
    },
    [anchored.panelRef, held.panelRef, nativeTapRef],
  );
  const holdRef = useScrollHold(holdScroll);
  const stillRef = useStillUnderFinger(keyboardAware);
  const bodyRef = useCallback(
    (el: HTMLDivElement | null) => {
      holdRef(el);
      stillRef(el);
    },
    [holdRef, stillRef],
  );

  // Focus return (point 3 above). Only while focus is still inside the
  // closing sheet, has been dropped on <body>, or has not moved since the
  // sheet opened, so a sheet closed by an action that moved focus elsewhere
  // leaves it there. Base UI moves focus in a frame after opening, and a
  // sheet closed before that frame still holds the stale focus it opened on.
  useEffect(() => {
    if (!open) return;
    return () => {
      // The latest value: the update that closes the sheet may have turned it off.
      if (!restoreFocusOnCloseRef.current) return;
      const named = returnFocusToRef.current;
      const captured = previouslyFocusedRef.current;
      // A `returnFocusTo` that has left the document (its row re-rendered
      // away) falls back to the element captured at open. A nested sheet
      // never falls back to <body>: it hands focus to the sheet underneath.
      const target = nested
        ? ([named, captured].find((el) => el?.isConnected && el !== document.body) ??
          parentStack.parentPopupRef.current)
        : named?.isConnected
          ? named
          : captured;
      const unmoved = captured !== null && document.activeElement === captured;
      if (target instanceof HTMLElement && (unmoved || focusIsInsideOrLost(popupRef.current))) restoreFocus(target);
    };
  }, [open, nested, parentStack]);

  // The `<main>` scroll lock (point 2 above). A nested sheet skips it: the
  // sheet underneath already holds the lock.
  useMainScrollLock(open && !nested);

  // Base UI's keyboard handling, only for a sheet that asks for it.
  const KeyboardScope = keyboardAware ? Drawer.VirtualKeyboardProvider : Fragment;

  // The tap outside during the entry (point 5 above), and the presses after a close.
  const entryGuard = useEntryPressGuard(open, popupRef);
  const closingPresses = useClosingPresses(open);

  function handleOpenChange(nextOpen: boolean, details: Drawer.Root.ChangeEventDetails): void {
    if (nextOpen) return;
    if (entryGuard.refuses(details) || !dismissible) {
      details.cancel();
      if (details.reason === "outside-press") entryGuard.keepFocusInside();
      return;
    }
    onClose();
  }

  return (
    <SheetStackContext.Provider value={stack}>
      <Drawer.Root
        open={rootOpen}
        onOpenChange={handleOpenChange}
        onOpenChangeComplete={(isOpen) => {
          entryGuard.onOpenChangeComplete(isOpen);
          if (isOpen) setSettled(true);
          if (isOpen) onOpened?.();
          else onClosed?.();
        }}
        modal="trap-focus"
        swipeDirection="down"
      >
        <KeyboardScope>
          <Drawer.Portal>
            {/* Base UI renders no backdrop for a nested drawer unless forced. */}
            <Drawer.Backdrop
              forceRender={nested}
              data-sheet-backdrop=""
              data-sheet-stacked={nested ? "" : undefined}
              aria-hidden="true"
              className={sheetBackdrop}
              style={closingBackdropStyle}
              {...closingBackdropHandlers}
            />
            <Drawer.Viewport className={anchored.pinned ? sheetViewportAnchored : sheetViewport}>
              <Drawer.Popup
                ref={setPopup}
                id={id}
                aria-modal="true"
                aria-label={ariaLabel}
                // The first field, as the app's dialogs have always done. Base UI
                // skips this when focus is already inside: an `autoFocus` field
                // or a body that focuses itself keeps its focus.
                initialFocus
                finalFocus={false}
                data-sheet-size={size}
                {...closingPresses}
                className={`${nested ? sheetPopupStacked : sheetPopup}${size === "tall" ? ` ${sheetPopupTall}` : ""}${held.held ? ` ${sheetPopupHeld}` : ""} ${panelClassName}`}
                style={{ ...anchored.style, ...held.style }}
              >
                {/* Outside Drawer.Content, so a mouse can drag it as well as a finger. */}
                <div data-sheet-handle="" className={sheetHandle} aria-hidden="true" />
                <Drawer.Content className="flex min-h-0 flex-1 flex-col">
                  {title !== undefined && (
                    <div data-sheet-header="" className={sheetHeader}>
                      {/* Names the dialog: Base UI points the Popup's aria-labelledby at it. */}
                      <Drawer.Title className={titleClassName ? `${sheetTitle} ${titleClassName}` : sheetTitle}>
                        {title}
                      </Drawer.Title>
                      {headerNote !== undefined && (
                        <div data-sheet-header-note="" className="mt-1">
                          {headerNote}
                        </div>
                      )}
                    </div>
                  )}
                  {header !== undefined && (
                    <div data-sheet-header="" className={sheetHeader}>
                      {header}
                    </div>
                  )}
                  <Fragment key={generation}>
                    <div
                      ref={bodyRef}
                      data-sheet-body=""
                      // The hold owns the scroll position, so the browser's
                      // own scroll anchoring is off: on a phone it picked a
                      // field below one that appeared and pushed everything
                      // above it up by the new field's height.
                      className={`${sheetBodyClass({ header: title !== undefined || header !== undefined, footer: Boolean(footer) })}${holdScroll ? " [overflow-anchor:none]" : ""}`}
                    >
                      {holdScroll ? (
                        <>
                          <div data-scroll-hold-content="">{children}</div>
                          <div data-scroll-hold-reserve="" aria-hidden="true" />
                        </>
                      ) : (
                        children
                      )}
                    </div>
                    {footer && (
                      <div data-sheet-footer="" className={sheetFooter}>
                        {footer}
                      </div>
                    )}
                  </Fragment>
                </Drawer.Content>
                {stacked}
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </KeyboardScope>
      </Drawer.Root>
    </SheetStackContext.Provider>
  );
}
