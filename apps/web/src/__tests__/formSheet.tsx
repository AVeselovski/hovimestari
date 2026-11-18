import type { FormSheetCallerProps } from "@/components/ui/FormSheet";
import { MOBILE_QUERY } from "@/hooks/useIsMobile";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { useRef, useState, type ReactElement } from "react";
import { holdSheetExits, pressOutsideSheet, swipeSheetDown, trackFocus } from "./sheet";

/**
 * Below `md`, as `useIsMobile` reads it. Returns the function that puts the
 * test setup's desktop `matchMedia` back.
 */
export function stubPhone(): () => void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query === MOBILE_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

export interface FormSheetContract {
  /** The dialog's accessible name. */
  name: RegExp;
  /** The form sheet, rendered with the caller's props. */
  renderSheet: (props: Required<FormSheetCallerProps>) => ReactElement;
  /** Makes the form dirty with a value `typedValue()` can read back. */
  type: () => void;
  /** The field `type` wrote into, for the "value unchanged" checks. */
  typedField: () => HTMLElement;
  /** Fills the form so Save is enabled. */
  fillValid: () => void;
  /** Makes the next save hang until the returned `resolve` is called, or fail at `reject`. */
  holdSave: () => { resolve: () => void; reject: () => void };
  /** The field that takes focus on open at `md`+. */
  firstField: () => HTMLElement;
  /** The panel's width at `md`+. Default `md:max-w-sm`. */
  panelClass?: string;
  /** The primary action's name while idle. Default "Save". */
  saveName?: RegExp;
  /** The primary action's name while its save runs. Default "Saving…". */
  busyName?: RegExp;
  /**
   * Whether the sheet tells its caller about a save through `onSaved`.
   * Default true. A sheet whose save refetches what it moved through its own
   * mutation, and only closes, passes false.
   */
  reportsSave?: boolean;
  /**
   * Whether the form's last block ends in a field's reserved line, which is
   * then the room above the footer (`form-ends-in-line`). Every sheet states
   * it, so a sheet whose last line sits deeper than the rule reaches fails.
   */
  endsInLine: boolean;
}

/**
 * The selectors of the `form-ends-in-line` rule in globals.css, read from the
 * file, each anchored at the form. jsdom matches `:has()` in a selector,
 * though it lays nothing out.
 */
function formEndsInLineSelector(): string {
  const css = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
  const rule = css.slice(css.indexOf("@utility form-ends-in-line"));
  const block = rule.slice(0, rule.indexOf("\n}\n"));
  const selectors = [...block.matchAll(/^\s*& (>[^,{]+)[,{]/gm)].map((m) => `:scope ${m[1].trim()}`);
  if (selectors.length === 0) throw new Error("no form-ends-in-line selectors in globals.css");
  return selectors.join(", ");
}

/**
 * The contract every form sheet keeps (docs/app/shell.md, "Sheets and
 * dialogs"): named by its title, the actions in a footer outside the scrolling
 * body, dismissible only while clean and idle, a save that ends its own open
 * and slides out showing what was on screen, focus back to `returnFocusTo`, no
 * field focused on open on a phone and the first field at `md`+.
 */
export function describeFormSheetContract(c: FormSheetContract): void {
  const panelClass = c.panelClass ?? "md:max-w-sm";
  const saveName = c.saveName ?? /^save$/i;
  const busyName = c.busyName ?? /saving/i;
  describe("as a sheet", () => {
    const onClose = jest.fn();
    const onSaved = jest.fn();

    function renderOpen() {
      return render(c.renderSheet({ open: true, returnFocusTo: null, onClose, onSaved }));
    }

    /** Keeps the sheet mounted after it closes, as its callers do. */
    function Caller() {
      const [open, setOpen] = useState(false);
      const openerRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button">Elsewhere</button>
          <button type="button" ref={openerRef} onClick={() => setOpen(true)}>
            Open it
          </button>
          {c.renderSheet({
            open,
            returnFocusTo: openerRef.current,
            onClose: () => {
              onClose();
              setOpen(false);
            },
            onSaved,
          })}
        </>
      );
    }

    beforeEach(() => {
      onClose.mockClear();
      onSaved.mockClear();
    });

    it(
      c.endsInLine
        ? "lets its last field's reserved line be the room above the footer"
        : "keeps the body's padding above the footer: its form ends in no field's line",
      () => {
        renderOpen();
        const form = screen.getByRole("dialog").querySelector<HTMLFormElement>("[data-sheet-body] form")!;
        expect(form.className.split(/\s+/)).toContain("form-ends-in-line");
        expect(form.querySelector(formEndsInLineSelector()) !== null).toBe(c.endsInLine);
      },
    );

    it(`is a modal dialog named by its title, the centred ${panelClass} panel at md+`, () => {
      renderOpen();
      const dialog = screen.getByRole("dialog", { name: c.name });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog.querySelector("[data-sheet-header]")).toHaveTextContent(c.name);
      expect(dialog).toHaveClass(panelClass);
    });

    it("keeps Cancel and Save in a footer outside the scrolling body; Save reaches the form by its form attribute", () => {
      renderOpen();
      const dialog = screen.getByRole("dialog");
      const body = dialog.querySelector<HTMLElement>("[data-sheet-body]")!;
      const footer = dialog.querySelector<HTMLElement>("[data-sheet-footer]")!;
      const save = within(footer).getByRole("button", { name: saveName }) as HTMLButtonElement;
      const cancel = within(footer).getByRole("button", { name: /^cancel$/i });
      expect(body).not.toContainElement(save);
      expect(body).not.toContainElement(cancel);
      expect(body).toContainElement(save.form);
      expect(save).toHaveAttribute("form", save.form!.id);
      // Two equal halves below `md`, the dialog's right-aligned row at `md`+.
      // Cancel and Save are one group (`contents` below md, so they stay the row's two cells).
      expect(save.parentElement).toHaveClass("contents", "md:flex");
      expect(save.parentElement).toContainElement(cancel);
      expect(save.parentElement!.parentElement).toHaveClass(
        "grid",
        "grid-cols-2",
        "md:flex",
        "md:justify-end",
        "md:gap-3",
      );
      expect(save).toHaveClass("max-md:min-h-11");
      expect(cancel).toHaveClass("max-md:min-h-11");
    });

    it("clean, it closes on Escape, a tap outside and a swipe", () => {
      const { unmount } = renderOpen();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      unmount();

      const second = renderOpen();
      pressOutsideSheet();
      expect(onClose).toHaveBeenCalledTimes(2);
      second.unmount();

      renderOpen();
      swipeSheetDown(screen.getByRole("dialog"));
      expect(onClose).toHaveBeenCalledTimes(3);
    });

    it("once something is typed, Escape, a tap outside and a swipe are refused and the entry stays; Cancel still closes", () => {
      renderOpen();
      c.type();
      const typed = (c.typedField() as HTMLInputElement).value;

      fireEvent.keyDown(document, { key: "Escape" });
      pressOutsideSheet();
      swipeSheetDown(screen.getByRole("dialog"));

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(c.typedField()).toHaveValue(typed);

      fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("clearing what was typed makes it dismissible again", () => {
      renderOpen();
      const field = c.typedField() as HTMLInputElement;
      const original = field.value;
      c.type();
      fireEvent.change(field, { target: { value: original } });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("is not dismissible while the save runs and Cancel is unavailable; the save then closes it", async () => {
      const save = c.holdSave();
      renderOpen();
      c.fillValid();
      fireEvent.click(screen.getByRole("button", { name: saveName }));
      await screen.findByRole("button", { name: busyName });
      const cancel = screen.getByRole("button", { name: /^cancel$/i });
      expect(cancel).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(cancel);

      fireEvent.keyDown(document, { key: "Escape" });
      pressOutsideSheet();
      swipeSheetDown(screen.getByRole("dialog"));
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => save.resolve());
      if (c.reportsSave ?? true) await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("keeps focus on Save while the save runs and after it fails, so keyboard focus never leaves the dialog", async () => {
      const save = c.holdSave();
      renderOpen();
      c.fillValid();
      const button = screen.getByRole("button", { name: saveName });
      act(() => button.focus());
      fireEvent.click(button);
      const busy = await screen.findByRole("button", { name: busyName });
      expect(busy).toBe(button);
      expect(button).toHaveFocus();
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toBeDisabled();

      // A second press while it runs sends nothing more.
      fireEvent.click(button);
      expect(onSaved).not.toHaveBeenCalled();

      await act(async () => save.reject());
      await screen.findByRole("button", { name: saveName });
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
      expect(button).toHaveFocus();
      expect(button).not.toHaveAttribute("aria-disabled");
    });

    it("keeps focus on Cancel through a save that fails, and ignores a press on it while the save runs", async () => {
      const save = c.holdSave();
      renderOpen();
      c.fillValid();
      const cancel = screen.getByRole("button", { name: /^cancel$/i });
      act(() => cancel.focus());
      // Enter in a field, or a tap on Save that leaves focus where it was, as on a phone.
      fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
      await screen.findByRole("button", { name: busyName });
      expect(cancel).toHaveAttribute("aria-disabled", "true");
      expect(cancel).not.toBeDisabled();
      expect(cancel).toHaveFocus();
      fireEvent.click(cancel);
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => save.reject());
      await screen.findByRole("button", { name: saveName });
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
      expect(cancel).toHaveFocus();
      expect(cancel).not.toHaveAttribute("aria-disabled");
    });

    describe("while it slides out", () => {
      let restore: () => void;
      beforeEach(() => {
        restore = holdSheetExits();
      });
      afterEach(() => restore());

      it("a save slides out showing what was on screen: the busy label and the entry", async () => {
        const save = c.holdSave();
        render(<Caller />);
        fireEvent.click(screen.getByRole("button", { name: "Open it" }));
        c.fillValid();
        const typed = (c.typedField() as HTMLInputElement).value;
        fireEvent.click(screen.getByRole("button", { name: saveName }));
        await screen.findByRole("button", { name: busyName });

        await act(async () => save.resolve());
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

        const closing = screen.getByRole("dialog", { hidden: true });
        expect(within(closing).getByRole("button", { name: busyName, hidden: true })).toHaveAttribute(
          "aria-disabled",
          "true",
        );
        expect(c.typedField()).toHaveValue(typed);
      });
    });

    it("returns focus to returnFocusTo when it closes, not to what had focus when it opened", async () => {
      render(<Caller />);
      screen.getByRole("button", { name: "Elsewhere" }).focus();
      // A tap: the opener is not focused (WebKit never focuses a tapped button).
      fireEvent.click(screen.getByRole("button", { name: "Open it" }));
      await waitFor(() => expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement));

      fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
      expect(screen.getByRole("button", { name: "Open it" })).toHaveFocus();
    });

    // Typed into on a phone: the footer rides above the software keyboard.
    // The keyboard's height (the visual viewport shorter than the window)
    // reaches the sheet while a field has focus. The iOS behaviour itself is
    // the owner's device check.
    it("is keyboard-aware: the keyboard's height reaches the sheet while a field is focused", async () => {
      const keyboard = 300;
      const viewport = Object.assign(new EventTarget(), {
        width: window.innerWidth,
        height: window.innerHeight - keyboard,
        offsetTop: 0,
        offsetLeft: 0,
        pageTop: 0,
        pageLeft: 0,
        scale: 1,
      });
      Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
      try {
        renderOpen();
        await waitFor(() => expect(c.firstField()).toHaveFocus());
        // A text field: a date field raises no keyboard.
        act(() => c.typedField().focus());
        const sheetViewport = screen.getByRole("dialog").parentElement!;
        await waitFor(() =>
          expect(sheetViewport.style.getPropertyValue("--drawer-keyboard-inset")).toBe(`${keyboard}px`),
        );
      } finally {
        delete (window as { visualViewport?: unknown }).visualViewport;
      }
    });

    it("at md+ the first field takes focus on open", async () => {
      renderOpen();
      await waitFor(() => expect(c.firstField()).toHaveFocus());
    });

    // The owner's iPhone (S3): a field focused on open pops the keyboard or
    // the date picker over a sheet still sliding in. The body takes focus.
    it("on a phone no field takes focus on open: the sheet's body does", async () => {
      const restorePhone = stubPhone();
      const trail = trackFocus();
      try {
        renderOpen();
        await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
        trail.stop();
        const body = screen.getByRole("dialog").querySelector("[data-prompt-sheet-body]");
        expect(body).not.toBeNull();
        expect(document.activeElement).toBe(body);
        expect(trail.focused.filter((el) => el !== body)).toEqual([]);
      } finally {
        trail.stop();
        restorePhone();
      }
    });
  });
}
