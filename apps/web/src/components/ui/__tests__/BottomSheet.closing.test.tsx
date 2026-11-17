import { controlSheetAnimations } from "@/__tests__/sheet";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { BottomSheet } from "../BottomSheet";
import { Harness, StackHarness } from "./bottomSheetHarness";

// A closing sheet swallows presses (components/ui/closingSheet.ts). jsdom has
// no hit testing, so these pin what decides it: from the moment the close
// starts until its exit ends, the sheet's backdrop, which covers the whole
// viewport, takes presses (`pointer-events: auto`, where Base UI sets none)
// and drops them without moving focus. Its lifetime is the exit's. The
// double tap itself is measured in a real browser.

/** The backdrops in the document, closing ones included. */
const backdrops = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("[data-sheet-backdrop]")];
const visible = (): HTMLElement[] => backdrops().filter((b) => !b.hidden);
const catching = (b: HTMLElement): boolean => b.style.pointerEvents === "auto";

let animations: ReturnType<typeof controlSheetAnimations>;
beforeEach(() => {
  animations = controlSheetAnimations();
});
afterEach(() => animations.restore());

/** Ends every running animation, so a sheet that is entering comes to rest and one leaving unmounts. */
async function finish(): Promise<void> {
  await act(async () => animations.finish());
  await act(() => new Promise((r) => setTimeout(r, 20)));
}

/** Ends exit animations round by round until no closing backdrop is left. */
async function finishExits(): Promise<void> {
  for (let i = 0; i < 6 && visible().some((b) => b.hasAttribute("data-closed")); i += 1) await finish();
}

async function openAtRest(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("button", { name: "open" }));
  const dialog = await screen.findByRole("dialog");
  await finish();
  return dialog;
}

describe("A closing sheet's backdrop", () => {
  it("leaves presses to Base UI while the sheet is open", async () => {
    render(<Harness />);
    await openAtRest();
    expect(visible()).toHaveLength(1);
    expect(catching(visible()[0])).toBe(false);
  });

  it("catches presses from the moment the close starts until the exit ends", async () => {
    render(<Harness />);
    await openAtRest();
    fireEvent.keyDown(document, { key: "Escape" });
    // Sliding out, its exit held.
    await waitFor(() => expect(visible()[0]).toHaveAttribute("data-closed"));
    expect(catching(visible()[0])).toBe(true);
    expect(visible()[0]).toHaveAttribute("aria-hidden", "true");
    expect(visible()[0]).not.toHaveAttribute("tabindex");
    await finishExits();
    expect(visible()).toHaveLength(0);
  });

  it("drops a press while it closes: no focus moves and no click reaches past it", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "open" });
    opener.focus();
    await openAtRest();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(visible()[0]).toHaveAttribute("data-closed"));
    expect(opener).toHaveFocus();
    const backdrop = visible()[0];
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    const reached = jest.fn();
    document.addEventListener("click", reached);
    try {
      backdrop.dispatchEvent(down);
      backdrop.dispatchEvent(click);
    } finally {
      document.removeEventListener("click", reached);
    }
    // A default-prevented mousedown is what keeps the browser from moving focus to <body>.
    expect(down.defaultPrevented).toBe(true);
    expect(reached).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
  });

  it("stops catching the moment a reopen interrupts the exit", async () => {
    render(<Harness />);
    await openAtRest();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(visible()[0]).toHaveAttribute("data-closed"));
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    await waitFor(() => expect(visible()[0]).toHaveAttribute("data-open"));
    expect(visible()).toHaveLength(1);
    expect(catching(visible()[0])).toBe(false);
  });

  it("over a parent: catches while the stacked sheet slides out, and the parent takes presses once that exit ends", async () => {
    render(<StackHarness />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    await screen.findByRole("dialog", { name: "Parent sheet" });
    await finish();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByRole("dialog", { name: "Stacked sheet" });
    await finish();
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    const stacked = () => document.querySelector<HTMLElement>("[data-sheet-backdrop][data-sheet-stacked]");
    await waitFor(() => expect(stacked()).toHaveAttribute("data-closed"));
    expect(catching(stacked()!)).toBe(true);
    // The parent's own backdrop is an open one.
    const parent = backdrops().find((b) => !b.hasAttribute("data-sheet-stacked"))!;
    expect(catching(parent)).toBe(false);
    await finishExits();
    expect(stacked() === null || stacked()!.hidden).toBe(true);
    expect(screen.getByRole("dialog", { name: "Parent sheet" })).toHaveTextContent("Filled");
  });

  it("two sheets closing in one update each catch until their own exit ends, then nothing is left", async () => {
    render(<StackHarness />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    await screen.findByRole("dialog", { name: "Parent sheet" });
    await finish();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByRole("dialog", { name: "Stacked sheet" });
    await finish();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(visible().every((b) => b.hasAttribute("data-closed"))).toBe(true));
    expect(visible().length).toBeGreaterThan(0);
    expect(visible().every(catching)).toBe(true);
    await finishExits();
    expect(visible()).toHaveLength(0);
  });

  it("does not cover a sheet that opens while it slides out", async () => {
    function Handoff() {
      const [first, setFirst] = useState(true);
      return (
        <>
          <BottomSheet ariaLabel="First" open={first} onClose={() => setFirst(false)}>
            <button type="button" onClick={() => setFirst(false)}>
              Next
            </button>
          </BottomSheet>
          <BottomSheet ariaLabel="Second" open={!first} onClose={() => setFirst(true)}>
            <button type="button">Inside</button>
          </BottomSheet>
        </>
      );
    }
    render(<Handoff />);
    await finish();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const second = await screen.findByRole("dialog", { name: "Second" });
    const closing = visible().find((b) => b.hasAttribute("data-closed"))!;
    expect(catching(closing)).toBe(true);
    // Later in the document, so at the same z-index it paints, and takes presses, above.
    expect(closing.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
