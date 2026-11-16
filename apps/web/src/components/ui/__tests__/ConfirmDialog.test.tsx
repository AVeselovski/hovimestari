import {
  controlSheetAnimations,
  getSheetBackdrop,
  holdSheetExits,
  pressOutsideSheet,
  swipeSheetDown,
} from "@/__tests__/sheet";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog";

// ConfirmDialog is a BottomSheet: a sheet below `md`, the centred dialog at
// `md`+. The swipe, the motion and the two layouts are measured live
// (docs/design/mobile-sheets-stage-4.md §i S5); these pin the contracts,
// above all NFR-UX-03: every dismissal cancels, only the button confirms.

describe("ConfirmDialog", () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const defaultProps = {
    open: true,
    title: "Delete transaction",
    message: "This can't be undone.",
    onConfirm,
    onCancel,
  };

  beforeEach(() => jest.clearAllMocks());

  /** Base UI moves focus into the sheet a frame after it opens. */
  async function waitForFocusInside() {
    await waitFor(() => expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement));
  }

  it("is a modal dialog named by its title and described by its message", () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Delete transaction");
    expect(dialog).toHaveAccessibleDescription("This can't be undone.");
    expect(within(dialog).getByRole("heading", { name: "Delete transaction" })).toBeInTheDocument();
  });

  it("renders nothing while closed", () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Cancel invokes onCancel", () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("the confirm button invokes onConfirm once the sheet is at rest", async () => {
    render(<ConfirmDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute("data-armed"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  // Destructive buttons use the accent, as the primary action does: the
  // identity has one chromatic colour.
  it("uses the accent fill for the confirm button by default", () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("bg-accent", "text-on-accent");
  });

  it("uses the primary style for the confirm button when tone is primary", () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Pause" busyLabel="Pausing…" tone="primary" />);
    expect(screen.getByRole("button", { name: "Pause" })).toHaveClass("bg-accent", "text-on-accent");
  });

  it("names the button by the caller's busy label while it runs", () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Pause" busyLabel="Pausing…" tone="primary" isLoading />);
    expect(screen.getByRole("button", { name: "Pausing…" })).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // The sheet: the message in the body, the two buttons in the footer.
  // -------------------------------------------------------------------------

  it("puts the message in the body and Cancel then the confirm button in the footer, as two equal 44px halves below md", () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    const body = dialog.querySelector("[data-sheet-body]") as HTMLElement;
    const footer = dialog.querySelector("[data-sheet-footer]") as HTMLElement;
    expect(within(body).getByText("This can't be undone.")).toBeInTheDocument();
    expect(within(body).queryByRole("button")).not.toBeInTheDocument();

    const buttons = within(footer).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Cancel", "DeleteDeleting…"]);
    const row = buttons[0].parentElement as HTMLElement;
    expect(row).toBe(buttons[1].parentElement);
    // `sheetActions`: a two-column grid below md, the dialog's right-aligned row at md+.
    expect(row).toHaveClass("grid", "grid-cols-2", "md:flex", "md:justify-end", "md:gap-3");
    for (const button of buttons) expect(button).toHaveClass("max-md:min-h-11");
  });

  it("is the dialog's max-w-sm width at md+", () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toHaveClass("md:max-w-sm");
  });

  // The body's own padding is 16px on each side; the margins bring it to the
  // dialog's spacing (measured against master at md+).
  it("keeps the dialog's spacing: 8px under the title, 12px to an error, 20px to the footer", () => {
    render(<ConfirmDialog {...defaultProps} error="Could not delete." />);
    const message = screen.getByText("This can't be undone.");
    expect(message.parentElement).toHaveClass("-mt-2");
    expect(message).toHaveClass("mb-1");
    expect(screen.getByRole("alert")).toHaveClass("mt-3", "mb-1");
  });

  // -------------------------------------------------------------------------
  // Every dismissal cancels, and none confirms (NFR-UX-03).
  // -------------------------------------------------------------------------

  describe("dismissal", () => {
    it("Escape cancels without confirming", async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog {...defaultProps} />);
      await waitForFocusInside();
      await user.keyboard("{Escape}");
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("a tap outside cancels without confirming", () => {
      render(<ConfirmDialog {...defaultProps} />);
      pressOutsideSheet(getSheetBackdrop());
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("a swipe down cancels without confirming", () => {
      render(<ConfirmDialog {...defaultProps} />);
      swipeSheetDown(screen.getByRole("dialog"));
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    // While the request runs Cancel is disabled, and every other way out is
    // refused with it: cancelling from under a running delete would orphan
    // the caller's loading state.
    describe("while the confirm request is in flight", () => {
      it("refuses Escape", async () => {
        const user = userEvent.setup();
        render(<ConfirmDialog {...defaultProps} isLoading />);
        await waitForFocusInside();
        await user.keyboard("{Escape}");
        expect(onCancel).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
      });

      it("refuses a tap outside", () => {
        render(<ConfirmDialog {...defaultProps} isLoading />);
        pressOutsideSheet(getSheetBackdrop());
        pressOutsideSheet(screen.getByRole("dialog").parentElement!);
        expect(onCancel).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      it("refuses a swipe", () => {
        render(<ConfirmDialog {...defaultProps} isLoading />);
        swipeSheetDown(screen.getByRole("dialog"));
        expect(onCancel).not.toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      it("takes Escape again once the request is over", async () => {
        const user = userEvent.setup();
        const { rerender } = render(<ConfirmDialog {...defaultProps} isLoading />);
        rerender(<ConfirmDialog {...defaultProps} isLoading={false} error="Could not delete." />);
        await waitForFocusInside();
        await user.keyboard("{Escape}");
        expect(onCancel).toHaveBeenCalledTimes(1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // The confirm button takes a press only once the sheet is at rest: on a
  // phone the sheet slides up under the finger that opened it, and the second
  // tap of a double tap would otherwise land on it (NFR-UX-03).
  // -------------------------------------------------------------------------

  /** Below `md`, as `useIsMobile` reads it. */
  function stubPhone(matches: boolean) {
    window.matchMedia = ((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  describe("while it slides in, on a phone", () => {
    let animations: ReturnType<typeof controlSheetAnimations>;
    const desktopMatchMedia = window.matchMedia;
    beforeEach(() => {
      stubPhone(true);
      animations = controlSheetAnimations();
    });
    afterEach(() => {
      animations.restore();
      window.matchMedia = desktopMatchMedia;
    });

    /** Let the entry finish once Base UI has started it. */
    async function finishEntry() {
      await waitFor(() => {
        animations.finish();
        expect(screen.getByRole("dialog").querySelector("[data-armed]")).not.toBeNull();
      });
    }

    it.each([
      ["danger", "Delete", undefined],
      ["primary", "Pause", "primary" as const],
    ])(
      "the %s confirm button ignores a press until the entry has finished, then takes one",
      async (_tone, name, tone) => {
        render(<ConfirmDialog {...defaultProps} confirmLabel={name} busyLabel={`${name}…`} tone={tone} />);
        const confirm = screen.getByRole("button", { name });

        fireEvent.click(confirm);
        expect(onConfirm).not.toHaveBeenCalled();
        expect(confirm).not.toHaveAttribute("data-armed");

        await finishEntry();
        fireEvent.click(confirm);
        expect(onConfirm).toHaveBeenCalledTimes(1);
      },
    );

    // With reduced motion the sheet is at rest after a short fade, inside a
    // double tap: the button waits out its delay as well.
    it("stays unarmed after a quick entry until its delay has passed", async () => {
      render(<ConfirmDialog {...defaultProps} />);
      const confirm = screen.getByRole("button", { name: "Delete" });
      const opened = performance.now();
      // The entry finishes at once.
      await waitFor(() => {
        animations.finish();
        expect(screen.getByRole("dialog")).not.toHaveAttribute("data-starting-style");
      });
      await act(async () => {
        animations.finish();
      });
      if (performance.now() - opened < 400) {
        fireEvent.click(confirm);
        expect(onConfirm).not.toHaveBeenCalled();
        expect(confirm).not.toHaveAttribute("data-armed");
      }
      await finishEntry();
      fireEvent.click(confirm);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    // A touch on an entering sheet ends its entry at once, so the button can
    // arm under the second tap itself: that press started unarmed.
    it("ignores a press that started before it armed, and takes the next one", async () => {
      render(<ConfirmDialog {...defaultProps} />);
      const confirm = screen.getByRole("button", { name: "Delete" });
      fireEvent.pointerDown(confirm);
      await finishEntry();
      fireEvent.click(confirm);
      expect(onConfirm).not.toHaveBeenCalled();

      fireEvent.pointerDown(confirm);
      fireEvent.click(confirm);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("Cancel works during the entry", () => {
      render(<ConfirmDialog {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("disarms again on the next open", async () => {
      const { rerender } = render(<ConfirmDialog {...defaultProps} />);
      await finishEntry();
      rerender(<ConfirmDialog {...defaultProps} open={false} />);
      rerender(<ConfirmDialog {...defaultProps} />);

      const reopened = performance.now();
      const confirm = screen.getByRole("button", { name: "Delete" });
      expect(confirm).not.toHaveAttribute("data-armed");
      fireEvent.click(confirm);
      expect(onConfirm).not.toHaveBeenCalled();

      // Its delay starts over too: a quick entry does not arm it at once.
      await waitFor(() => {
        animations.finish();
        expect(screen.getByRole("dialog")).not.toHaveAttribute("data-starting-style");
      });
      await act(async () => {
        animations.finish();
      });
      if (performance.now() - reopened < 400) {
        fireEvent.click(confirm);
        expect(onConfirm).not.toHaveBeenCalled();
      }
      await finishEntry();
    });
  });

  // At md+ the dialog fades in centred, away from the opener: the button
  // works at once, so a keyboard Enter right after opening confirms.
  it("at md+ the confirm button takes a press at once, even while the dialog fades in", () => {
    const animations = controlSheetAnimations();
    try {
      stubPhone(false);
      render(<ConfirmDialog {...defaultProps} />);
      const confirm = screen.getByRole("button", { name: "Delete" });
      expect(confirm).toHaveAttribute("data-armed");
      fireEvent.pointerDown(confirm);
      fireEvent.click(confirm);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    } finally {
      animations.restore();
    }
  });

  // -------------------------------------------------------------------------
  // Focus: in on open, trapped, parked while loading, back on close.
  // -------------------------------------------------------------------------

  it("moves focus to Cancel when it opens, so Enter never confirms by accident", async () => {
    render(<ConfirmDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /cancel/i })).toHaveFocus());
  });

  it("keeps Tab inside the dialog: Tab from the last button wraps to the first, Shift+Tab wraps back", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Behind the overlay</button>
        <ConfirmDialog {...defaultProps} />
      </>,
    );
    const cancel = screen.getByRole("button", { name: /cancel/i });
    const confirm = screen.getByRole("button", { name: "Delete" });
    await waitFor(() => expect(cancel).toHaveFocus());

    await user.tab();
    await waitFor(() => expect(confirm).toHaveFocus());
    await user.tab();
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.tab({ shift: true });
    await waitFor(() => expect(confirm).toHaveFocus());
  });

  /** A page with a trigger that opens the dialog, kept mounted the way every call site uses it. */
  function Harness({ returnFocusTo }: { returnFocusTo?: HTMLElement | null }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        <ConfirmDialog {...defaultProps} open={open} returnFocusTo={returnFocusTo} onCancel={() => setOpen(false)} />
      </>
    );
  }

  it("returns focus to the button that opened it when it closes", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    const cancel = await screen.findByRole("button", { name: /cancel/i });
    await waitFor(() => expect(cancel).toHaveFocus());

    fireEvent.click(cancel);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  // A tapped button on iOS never takes focus, and a menu item is gone by the
  // time the dialog closes: the caller names where focus goes.
  it("returns focus to returnFocusTo when the caller names it", async () => {
    const named = document.body.appendChild(document.createElement("button"));
    try {
      render(<Harness returnFocusTo={named} />);
      const trigger = screen.getByRole("button", { name: "Open" });
      trigger.focus();
      fireEvent.click(trigger);
      await waitForFocusInside();

      pressOutsideSheet();
      expect(named).toHaveFocus();
    } finally {
      named.remove();
    }
  });

  it("moves focus into the body while loading, so disabling the buttons never drops it to the page", async () => {
    const { rerender } = render(<ConfirmDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /cancel/i })).toHaveFocus());

    rerender(<ConfirmDialog {...defaultProps} isLoading />);
    const dialog = screen.getByRole("dialog");
    const body = dialog.querySelector("[data-confirm-body]") as HTMLElement;
    expect(body).toHaveFocus();
    expect(body).toHaveAttribute("tabindex", "-1");
    expect(dialog.querySelector("[data-sheet-body]")).toContainElement(body);
  });

  it("keeps focus inside when it opens already loading", async () => {
    render(<ConfirmDialog {...defaultProps} isLoading />);
    await waitForFocusInside();
    expect(screen.getByRole("dialog").querySelector("[data-confirm-body]")).toHaveFocus();
  });

  // -------------------------------------------------------------------------
  // The confirm button's width, and the error.
  // -------------------------------------------------------------------------

  it("renders both confirm labels in one cell with only the current one visible, so the button never changes width", () => {
    const { rerender } = render(<ConfirmDialog {...defaultProps} />);
    const confirm = screen.getByRole("button", { name: "Delete" });
    const idle = within(confirm).getByText("Delete");
    const loading = within(confirm).getByText("Deleting…");
    for (const span of [idle, loading]) expect(span).toHaveClass("[grid-area:1/1]");
    expect(idle).not.toHaveClass("invisible");
    expect(idle).not.toHaveAttribute("aria-hidden");
    expect(loading).toHaveClass("invisible");
    expect(loading).toHaveAttribute("aria-hidden", "true");

    rerender(<ConfirmDialog {...defaultProps} isLoading />);
    // Same button node, now named by the loading label.
    expect(screen.getByRole("button", { name: "Deleting…" })).toBe(confirm);
    expect(idle).toHaveClass("invisible");
    expect(idle).toHaveAttribute("aria-hidden", "true");
    expect(loading).not.toHaveClass("invisible");
    expect(loading).not.toHaveAttribute("aria-hidden");
  });

  it("shows an error as an alert inside the dialog, above the buttons", () => {
    render(<ConfirmDialog {...defaultProps} error="Could not delete." />);
    const dialog = screen.getByRole("dialog");
    const alert = within(dialog).getByRole("alert");
    expect(alert).toHaveTextContent("Could not delete.");
    expect(alert).toHaveClass("text-accent");
    const cancel = within(dialog).getByRole("button", { name: /cancel/i });
    expect(alert.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders no alert when there is no error", () => {
    render(<ConfirmDialog {...defaultProps} error={null} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Closing: it slides out with what it showed.
  // -------------------------------------------------------------------------

  describe("while it slides out", () => {
    let releaseExits: () => void;
    beforeEach(() => {
      releaseExits = holdSheetExits();
    });
    afterEach(() => releaseExits());

    it("keeps its title, message and buttons on screen after open turns false", () => {
      const { rerender } = render(<ConfirmDialog {...defaultProps} />);
      rerender(<ConfirmDialog {...defaultProps} open={false} />);
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveAttribute("data-ending-style");
      expect(within(dialog).getByText("This can't be undone.")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /cancel/i, hidden: true })).toBeInTheDocument();
    });
  });
});
