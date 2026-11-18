import { stubPhone } from "@/__tests__/formSheet";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { BottomSheet } from "../BottomSheet";

// Below md a sheet hangs from the bottom edge and is as tall as its content.
// A line that appears would then grow it and move its top edge, its title and
// the field being typed in up the screen. Once open, the sheet keeps the
// height it opened at instead, and the body scrolls. jsdom has no layout:
// the popup's height is stood in the way a browser gives it, following the
// content, so what is pinned is that the sheet's own height no longer does.
// The real geometry is measured in a browser.

const AT_REST = 412;
let lineShown = false;
// Content still on its way in during the entry: the sheet is this much shorter until it lands.
let stillLoading = 0;
const nativeOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      // A sheet that follows its content: one line taller while the line shows.
      return this.hasAttribute("data-sheet-size") ? AT_REST - stillLoading + (lineShown ? 20 : 0) : 0;
    },
  });
});
afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", nativeOffsetHeight);
});

let restorePhone: () => void = () => {};
const nativeInnerWidth = window.innerWidth;
afterEach(() => {
  restorePhone();
  lineShown = false;
  stillLoading = 0;
  setWindowWidth(nativeInnerWidth);
});

function setWindowWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
}

/** The footer's bottom padding, as the safe area and `--sheet-footer-pad` give it in a browser. */
const FOOTER_PAD = 24;

function Sheet({ size }: { size?: "auto" | "tall" }) {
  const [refused, setRefused] = useState(false);
  lineShown = refused;
  return (
    <BottomSheet
      open
      onClose={jest.fn()}
      title="Targets"
      size={size}
      footer={
        <>
          {/* The footer's padding, set as it mounts: React does not own the footer's style. */}
          <span ref={(el) => void (el && (el.parentElement!.style.paddingBottom = `${FOOTER_PAD}px`))} hidden />
          {refused && <p>That did not work.</p>}
          <button type="button" onClick={() => setRefused(true)}>
            Save
          </button>
        </>
      }
    >
      <p>Fields</p>
    </BottomSheet>
  );
}

const heldHeight = (dialog: HTMLElement): string => dialog.style.getPropertyValue("--sheet-held-height");

async function openSheet(size?: "auto" | "tall") {
  render(<Sheet size={size} />);
  const dialog = screen.getByRole("dialog", { name: "Targets" });
  // Held once the entry has finished: the sheet is at rest.
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  return dialog;
}

describe("BottomSheet holds its height on a phone", () => {
  it("keeps the height it opened at when a line appears", async () => {
    restorePhone = stubPhone();
    const dialog = await openSheet();
    await waitFor(() => expect(heldHeight(dialog)).not.toBe(""));
    // Its height at rest, less the footer's padding, which the held class adds back.
    expect(heldHeight(dialog)).toBe(`${AT_REST - FOOTER_PAD}px`);
    expect(dialog.className.split(" ")).toContain("h-[calc(var(--sheet-held-height)+var(--sheet-footer-pad))]");

    act(() => screen.getByRole("button", { name: "Save" }).click());
    expect(screen.getByText("That did not work.")).toBeInTheDocument();
    // The content grew by a line. The sheet did not: its top edge stays where it was.
    expect(heldHeight(dialog)).toBe(`${AT_REST - FOOTER_PAD}px`);
  });

  // Content that lands during the entry still sizes the sheet: the height is
  // measured once the sheet is at rest, not as it mounts. The entry is held
  // open with an animation that ends when the test says, as Base UI waits for
  // the popup's animations in a browser.
  it("measures the height the sheet has once it is at rest", async () => {
    restorePhone = stubPhone();
    const flags = globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean };
    let endEntry: () => void = () => {};
    const finished = new Promise<void>((resolve) => (endEntry = resolve));
    flags.BASE_UI_ANIMATIONS_DISABLED = false;
    Element.prototype.getAnimations = () => [{ finished } as unknown as Animation];
    try {
      stillLoading = 100;
      render(<Sheet />);
      const dialog = screen.getByRole("dialog", { name: "Targets" });
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      // Still sliding in: nothing is held yet, whatever the sheet measures now.
      expect(heldHeight(dialog)).toBe("");

      stillLoading = 0;
      await act(async () => endEntry());
      await waitFor(() => expect(heldHeight(dialog)).not.toBe(""));
      expect(heldHeight(dialog)).toBe(`${AT_REST - FOOTER_PAD}px`);
    } finally {
      flags.BASE_UI_ANIMATIONS_DISABLED = true;
      delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    }
  });

  // A keyboard that resizes the layout viewport, or a toolbar that shows or
  // hides, changes the window's height alone. The hold stays.
  it("keeps the hold through a resize that leaves the window's width alone", async () => {
    restorePhone = stubPhone();
    const dialog = await openSheet();
    await waitFor(() => expect(heldHeight(dialog)).not.toBe(""));
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(heldHeight(dialog)).toBe(`${AT_REST - FOOTER_PAD}px`);
  });

  it("lets go when the window's width changes, such as turning the phone", async () => {
    restorePhone = stubPhone();
    const dialog = await openSheet();
    await waitFor(() => expect(heldHeight(dialog)).not.toBe(""));
    act(() => {
      setWindowWidth(nativeInnerWidth + 300);
      window.dispatchEvent(new Event("resize"));
    });
    expect(heldHeight(dialog)).toBe("");
    expect(dialog.className).not.toContain("--sheet-held-height");
  });

  // A tall sheet already has one fixed height.
  it("leaves a tall sheet alone", async () => {
    restorePhone = stubPhone();
    const dialog = await openSheet("tall");
    expect(heldHeight(dialog)).toBe("");
  });

  // From md the centred dialog holds its top instead (`useAnchoredPanel`).
  it("leaves the dialog from md alone", async () => {
    const dialog = await openSheet();
    expect(heldHeight(dialog)).toBe("");
  });
});
