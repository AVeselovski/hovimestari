import { getSheetBackdrop, pressOutsideSheet, swipeSheetDown } from "@/__tests__/sheet";
import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { BottomSheet, SheetDescription } from "../BottomSheet";
import { Harness, waitForFocusInside } from "./bottomSheetHarness";

// The swipe, the motion and the handle's look are checked live in a real
// browser (docs/design/mobile-sheets-stage-4.md §i, M1 to M6): jsdom has no
// layout, no touch and no transitions. These pin the contracts.

describe("BottomSheet", () => {
  it("renders nothing when closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Most callers mount the sheet already open. The dialog must be there
  // straight away, with its name, its modality and the caller's id.
  it("renders a named modal dialog right after mounting with open, carrying the given id", () => {
    render(
      <BottomSheet open onClose={jest.fn()} ariaLabel="Test sheet" id="my-panel-id">
        <button type="button">only</button>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Test sheet" });
    expect(dialog).toHaveAttribute("id", "my-panel-id");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("a SheetDescription in the body describes the dialog", () => {
    render(
      <BottomSheet open onClose={jest.fn()} title="Delete tag">
        <SheetDescription>It will be gone.</SheetDescription>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete tag" });
    expect(dialog).toHaveAccessibleDescription("It will be gone.");
    expect(dialog.querySelector("[data-sheet-body]")).toContainElement(screen.getByText("It will be gone."));
  });

  // Base UI plays an entry only for a root that mounted closed and then
  // opened. A sheet mounted already open must still start from its starting
  // style, or it appears without sliding in.
  it("enters from its starting style even when mounted already open", () => {
    render(
      <BottomSheet open onClose={jest.fn()} ariaLabel="Test sheet">
        <button type="button">only</button>
      </BottomSheet>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("data-starting-style");
  });

  it("focuses the first field on open", async () => {
    render(<Harness initialOpen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "first" })).toHaveFocus());
  });

  it("Tab from the last field wraps to the first, Shift+Tab from the first wraps to the last", async () => {
    const user = userEvent.setup();
    render(<Harness initialOpen />);
    await waitForFocusInside();
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });

    last.focus();
    await user.tab();
    await waitFor(() => expect(first).toHaveFocus());

    await user.tab({ shift: true });
    await waitFor(() => expect(last).toHaveFocus());
  });

  it("the handle is hidden from assistive tech", () => {
    render(<Harness initialOpen />);
    const handle = screen.getByRole("dialog").firstElementChild as HTMLElement;
    expect(handle).toHaveAttribute("aria-hidden", "true");
    expect(handle).toBeEmptyDOMElement();
  });

  it("Escape closes without writing", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<Harness initialOpen onClose={onClose} />);
    await waitForFocusInside();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a press on the backdrop closes without writing", () => {
    const onClose = jest.fn();
    render(<Harness initialOpen onClose={onClose} />);
    pressOutsideSheet(getSheetBackdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // The backdrop sits under the box that places the sheet, so a real tap on
  // the empty area above the sheet lands on that box, not the backdrop.
  it("a press on the empty area around the sheet closes it", () => {
    const onClose = jest.fn();
    render(<Harness initialOpen onClose={onClose} />);
    pressOutsideSheet(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a press inside the sheet does not close it", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<Harness initialOpen onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "first" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  describe("dismissible={false}", () => {
    it("refuses Escape", async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(<Harness initialOpen onClose={onClose} dismissible={false} />);
      await waitForFocusInside();
      await user.keyboard("{Escape}");
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("refuses a press on the backdrop and on the empty area", () => {
      const onClose = jest.fn();
      render(<Harness initialOpen onClose={onClose} dismissible={false} />);
      pressOutsideSheet();
      pressOutsideSheet(screen.getByRole("dialog").parentElement!);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // A browser blurs the focused element on the press's mousedown, before
    // Base UI sees the press. Refused, it must not leave focus on <body>.
    it("keeps focus in the sheet after a refused press outside", async () => {
      render(<Harness initialOpen dismissible={false} />);
      await waitForFocusInside();
      const backdrop = getSheetBackdrop();
      fireEvent.pointerDown(backdrop);
      fireEvent.mouseDown(backdrop);
      // What the browser does on that mousedown. Not `blur()`: jsdom reports
      // the document as the focusout's relatedTarget, which Base UI throws on.
      const blurred = jest.spyOn(document, "activeElement", "get").mockReturnValue(document.body);
      fireEvent.pointerUp(backdrop);
      fireEvent.mouseUp(backdrop);
      fireEvent.click(backdrop);
      blurred.mockRestore();

      expect(screen.getByRole("dialog")).toHaveFocus();
    });

    it("leaves a focused field alone after a refused press outside", async () => {
      render(
        <Harness initialOpen dismissible={false}>
          <input aria-label="Amount" />
        </Harness>,
      );
      await waitForFocusInside();
      const input = screen.getByRole("textbox", { name: "Amount" });
      input.focus();
      pressOutsideSheet();
      expect(input).toHaveFocus();
    });

    // A mouse press on a desktop: the field the press blurred gets focus back,
    // so the caret is where it was. A touch goes to the sheet itself (above).
    it("gives focus back to the field a refused mouse press blurred", async () => {
      render(
        <Harness initialOpen dismissible={false}>
          <input aria-label="Amount" />
          <button type="button">other</button>
        </Harness>,
      );
      await waitForFocusInside();
      const input = screen.getByRole("textbox", { name: "Amount" });
      input.focus();
      const backdrop = getSheetBackdrop();
      // jsdom's pointer events carry no pointerType.
      const down = createEvent.pointerDown(backdrop);
      Object.defineProperty(down, "pointerType", { value: "mouse" });
      fireEvent(backdrop, down);
      fireEvent.mouseDown(backdrop);
      // The browser's blur on that mousedown; focus lands elsewhere in the
      // sheet first, so only the restore can bring it back to the field.
      screen.getByRole("button", { name: "other" }).focus();
      // A real click comes a moment after the press, not in the same task.
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      const blurred = jest.spyOn(document, "activeElement", "get").mockReturnValue(document.body);
      fireEvent.pointerUp(backdrop);
      fireEvent.mouseUp(backdrop);
      fireEvent.click(backdrop);
      blurred.mockRestore();

      expect(input).toHaveFocus();
    });

    it("refuses a swipe", () => {
      const onClose = jest.fn();
      render(<Harness initialOpen onClose={onClose} dismissible={false} />);
      swipeSheetDown(screen.getByRole("dialog"));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("a swipe down from the handle closes it, once", () => {
    const onClose = jest.fn();
    render(<Harness initialOpen onClose={onClose} />);
    swipeSheetDown(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("returns focus to the trigger on a keyboard close, with its focus ring", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "open" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await waitForFocusInside();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).not.toHaveAttribute("data-focus-restored");
  });

  it("returns focus to the trigger on a tap close, without painting a ring", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "open" });
    await user.click(trigger);
    await waitForFocusInside();
    pressOutsideSheet();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("data-focus-restored");
  });

  describe("returnFocusTo", () => {
    const outside: HTMLElement[] = [];
    function outsideButton(name: string): HTMLButtonElement {
      const button = document.createElement("button");
      button.textContent = name;
      outside.push(document.body.appendChild(button));
      return button;
    }
    afterEach(() => outside.splice(0).forEach((el) => el.remove()));

    // WebKit does not focus a tapped button, so what had focus at open is
    // <body>, and a sheet that relied on it would return focus nowhere.
    it("returns focus there when the control that opened the sheet never took focus", async () => {
      const row = outsideButton("row");
      render(<Harness returnFocusTo={row} />);
      fireEvent.click(screen.getByRole("button", { name: "open" }));
      expect(document.body).toHaveFocus();
      await waitForFocusInside();

      pressOutsideSheet();

      expect(row).toHaveFocus();
      expect(row).toHaveAttribute("data-focus-restored");
    });

    it("wins over the element that had focus at open", async () => {
      const user = userEvent.setup();
      const row = outsideButton("row");
      render(<Harness returnFocusTo={row} />);
      const trigger = screen.getByRole("button", { name: "open" });
      trigger.focus();
      await user.keyboard("{Enter}");
      await waitForFocusInside();

      await user.keyboard("{Escape}");

      expect(row).toHaveFocus();
    });

    it("falls back to the element that had focus at open when it has left the document", async () => {
      const user = userEvent.setup();
      const row = outsideButton("row");
      render(<Harness returnFocusTo={row} />);
      const trigger = screen.getByRole("button", { name: "open" });
      trigger.focus();
      await user.keyboard("{Enter}");
      await waitForFocusInside();
      row.remove();

      await user.keyboard("{Escape}");

      expect(trigger).toHaveFocus();
    });

    // Base UI moves focus into the sheet a frame after it opens. A sheet
    // closed before then still holds the focus it opened on, here a control
    // an earlier sheet returned focus to, and must still hand it over.
    it("returns focus there when the sheet closes before it has taken focus", async () => {
      const stale = outsideButton("stale");
      const row = outsideButton("row");
      render(<Harness returnFocusTo={row} />);
      stale.focus();
      fireEvent.click(screen.getByRole("button", { name: "open" }));
      const dialog = screen.getByRole("dialog");
      expect(stale).toHaveFocus();

      fireEvent.keyDown(dialog, { key: "Escape" });

      expect(row).toHaveFocus();
      // The frame Base UI queued on open does not pull focus back.
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
      expect(row).toHaveFocus();
    });

    // One sheet handing over to the next in the same click (the row sheet's
    // Confirm opening the confirm prompt): the second sheet opens while focus
    // is still inside the first, which is gone by the time the second closes.
    it("brings focus back across a sheet-to-sheet handoff", async () => {
      const row = outsideButton("row");
      function Handoff() {
        const [first, setFirst] = useState(true);
        const [second, setSecond] = useState(false);
        return (
          <>
            <BottomSheet open={first} onClose={() => setFirst(false)} ariaLabel="First" returnFocusTo={row}>
              <button
                type="button"
                onClick={() => {
                  setFirst(false);
                  setSecond(true);
                }}
              >
                next
              </button>
            </BottomSheet>
            <BottomSheet open={second} onClose={() => setSecond(false)} ariaLabel="Second" returnFocusTo={row}>
              <input aria-label="field" />
            </BottomSheet>
          </>
        );
      }
      render(<Handoff />);
      const next = await screen.findByRole("button", { name: "next" });
      await waitFor(() => expect(next).toHaveFocus());

      fireEvent.click(next);
      const second = await screen.findByRole("dialog", { name: "Second" });
      await waitFor(() => expect(second).toContainElement(document.activeElement as HTMLElement));
      fireEvent.keyDown(second, { key: "Escape" });

      expect(screen.queryByRole("dialog", { name: "Second" })).not.toBeInTheDocument();
      expect(row).toHaveFocus();
    });
  });

  // Most callers close the sheet by unmounting it rather than by passing
  // `open={false}`. Focus has to come back on that path too.
  it("returns focus to the trigger when the caller unmounts the sheet to close it", async () => {
    const user = userEvent.setup();
    function Unmounting() {
      const [shown, setShown] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setShown(true)}>
            open
          </button>
          {shown && (
            <BottomSheet open onClose={() => setShown(false)} ariaLabel="Test sheet">
              <button type="button">inside</button>
            </BottomSheet>
          )}
        </>
      );
    }
    render(<Unmounting />);
    const trigger = screen.getByRole("button", { name: "open" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await waitForFocusInside();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  // A sheet closed by an action that also moved focus somewhere else (one
  // sheet handing over to the next) must leave focus where the action put it.
  it("leaves focus where an action put it when that action also closed the sheet", async () => {
    const user = userEvent.setup();
    function HandOver() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          <button type="button" id="elsewhere">
            elsewhere
          </button>
          <BottomSheet open={open} onClose={() => setOpen(false)} ariaLabel="Test sheet">
            <button
              type="button"
              onClick={() => {
                document.getElementById("elsewhere")?.focus();
                setOpen(false);
              }}
            >
              hand over
            </button>
          </BottomSheet>
        </>
      );
    }
    render(<HandOver />);
    const trigger = screen.getByRole("button", { name: "open" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await waitForFocusInside();
    // Counted rather than read at the end, so a restore that visits the
    // trigger and is then undone still shows.
    const triggerFocus = jest.fn();
    trigger.addEventListener("focus", triggerFocus);

    await user.keyboard("{Enter}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
    expect(triggerFocus).not.toHaveBeenCalled();
  });

  it("locks <main>'s scroll while open and restores overflow and the scrollTop captured at open time on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const main = screen.getByTestId("main");
    Object.defineProperty(main, "scrollTop", { value: 240, writable: true });
    main.style.overflow = "auto";

    await user.click(screen.getByRole("button", { name: "open" }));
    expect(main.style.overflow).toBe("hidden");

    // Drift while locked. The restore must bring back the value captured at
    // open time, or this would pass with the restore line deleted.
    main.scrollTop = 999;

    await user.keyboard("{Escape}");
    expect(main.style.overflow).toBe("auto");
    expect(main.scrollTop).toBe(240);
  });
});
