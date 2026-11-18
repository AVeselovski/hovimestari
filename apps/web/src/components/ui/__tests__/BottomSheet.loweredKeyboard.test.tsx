import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BottomSheet } from "../BottomSheet";

// The keyboard lowered with its own button: on an iPhone the field keeps
// focus and the keyboard goes away. Base UI's keyboard handling then takes the
// next tap on a field: it cancels the browser's own handling at `touchend`
// and focuses the field itself. On the owner's iPhone that raised no keyboard
// while a field still held focus. The first tap in a fresh sheet, when no
// field holds focus, always did. These tests drive Base UI's real handling and
// pin what the sheet now guarantees: when the finger lifts, the tapped field
// does not already hold focus, so the provider's focus is a real focus, as on
// that first tap. It does so only after it has seen the keyboard go up and
// then down: where the reading is wrong while a keyboard is up, it never sees
// that, and focus goes straight from field to field. Whether iOS then raises its keyboard is the owner's check on
// the phone: no test environment here has a software keyboard.

const innerHeight = window.innerHeight;
let viewport: EventTarget & { height: number };

/** The visual viewport: `keyboard` px shorter than the window while a keyboard is up. */
function standInViewport(keyboard: number): void {
  viewport = Object.assign(new EventTarget(), {
    width: window.innerWidth,
    height: innerHeight - keyboard,
    offsetTop: 0,
    offsetLeft: 0,
    pageTop: 0,
    pageLeft: 0,
    scale: 1,
  });
  Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
}

/** The keyboard changes height: the visual viewport resizes, as a browser's does. */
function keyboardTo(keyboard: number): void {
  act(() => {
    viewport.height = innerHeight - keyboard;
    viewport.dispatchEvent(new Event("resize"));
  });
}

/** The reader raises the keyboard on the focused field, then lowers it with its own button. */
function raiseAndLower(): void {
  keyboardTo(300);
  keyboardTo(0);
}

afterEach(() => {
  delete (window as { visualViewport?: unknown }).visualViewport;
});

function TwoFieldSheet() {
  return (
    <BottomSheet open onClose={jest.fn()} title="Targets" keyboardAware footer={<button type="button">Save</button>}>
      <label>
        From
        <input type="text" inputMode="numeric" />
      </label>
      <label>
        To
        <input type="text" inputMode="numeric" />
      </label>
      <button type="button">Choose</button>
    </BottomSheet>
  );
}

async function openWithFromFocused() {
  render(<TwoFieldSheet />);
  const from = screen.getByRole("textbox", { name: "From" });
  const to = screen.getByRole("textbox", { name: "To" });
  await waitFor(() => expect(from).toHaveFocus());
  return { from, to, dialog: screen.getByRole("dialog", { name: "Targets" }) };
}

/** A tap: what was focused as the finger lifted, and whether the browser's own handling was cancelled. */
function tap(el: HTMLElement, fingers = 1): { focusedAtLift: Element | null; cancelled: boolean } {
  let focusedAtLift: Element | null = null;
  const atLift = () => (focusedAtLift = document.activeElement);
  document.addEventListener("touchend", atLift, { capture: true });
  const point = { clientX: 100, clientY: 300 };
  const touches = Array.from({ length: fingers }, (_, i) => ({ clientX: 100 + 40 * i, clientY: 300 }));
  let cancelled = false;
  act(() => {
    fireEvent.touchStart(el, { touches, changedTouches: touches });
    cancelled = !fireEvent.touchEnd(el, { touches: [], changedTouches: [point] });
  });
  document.removeEventListener("touchend", atLift, { capture: true });
  return { focusedAtLift, cancelled };
}

describe("BottomSheet after the keyboard was lowered by hand", () => {
  it("a tap on the field that kept focus reaches the provider with that field no longer focused, then focuses it", async () => {
    standInViewport(0);
    const { from, dialog } = await openWithFromFocused();
    raiseAndLower();

    const { focusedAtLift, cancelled } = tap(from);

    expect(focusedAtLift).toBe(dialog);
    // The provider's own path ran: it cancelled the browser's handling and focused the field.
    expect(cancelled).toBe(true);
    expect(from).toHaveFocus();
  });

  it("a tap on another field reaches the provider with no field focused, then focuses the tapped one", async () => {
    standInViewport(0);
    const { to, dialog } = await openWithFromFocused();
    raiseAndLower();

    const { focusedAtLift, cancelled } = tap(to);

    expect(focusedAtLift).toBe(dialog);
    expect(cancelled).toBe(true);
    expect(to).toHaveFocus();
  });

  it("a tap on a field's label counts as a tap on its field", async () => {
    standInViewport(0);
    const { to, dialog } = await openWithFromFocused();
    raiseAndLower();

    const { focusedAtLift } = tap(screen.getByText("To"));

    expect(focusedAtLift).toBe(dialog);
    expect(to).toHaveFocus();
  });

  // With the keyboard up, moving between fields keeps the keyboard: a blur in
  // between would drop it and raise it again.
  it("with the keyboard up, focus goes straight from field to field", async () => {
    standInViewport(0);
    const { from, to } = await openWithFromFocused();
    keyboardTo(300);

    const { focusedAtLift } = tap(to);

    expect(focusedAtLift).toBe(from);
    expect(to).toHaveFocus();
  });

  it("leaves focus alone for a tap on anything but a field", async () => {
    standInViewport(0);
    const { from } = await openWithFromFocused();
    raiseAndLower();

    const { focusedAtLift } = tap(screen.getByRole("button", { name: "Choose" }));

    expect(focusedAtLift).toBe(from);
  });

  // Where the keyboard reading never says "up" while a keyboard is up (a
  // browser that resizes the layout viewport, a floating iPad keyboard), a
  // blur between fields would drop the keyboard. With no lowering seen, the
  // provider's path runs unchanged.
  it("with no lowering seen, focus goes straight from field to field", async () => {
    standInViewport(0);
    const { from, to } = await openWithFromFocused();

    const { focusedAtLift } = tap(to);

    expect(focusedAtLift).toBe(from);
    expect(to).toHaveFocus();
  });

  it("forgets the lowering once focus leaves the sheet's fields", async () => {
    standInViewport(0);
    const { from, to } = await openWithFromFocused();
    raiseAndLower();
    act(() => screen.getByRole("button", { name: "Choose" }).focus());
    act(() => from.focus());

    const { focusedAtLift } = tap(to);

    expect(focusedAtLift).toBe(from);
  });

  it("keeps the lowering while focus moves between the sheet's fields", async () => {
    standInViewport(0);
    const { to, dialog } = await openWithFromFocused();
    raiseAndLower();
    act(() => to.focus());

    expect(tap(screen.getByRole("textbox", { name: "From" })).focusedAtLift).toBe(dialog);
  });

  // A keyboard already up when a field takes focus counts as raised for it:
  // the field was focused into a keyboard, then the keyboard was lowered.
  it("counts a keyboard that was up when a field took focus", async () => {
    standInViewport(0);
    const { from, to, dialog } = await openWithFromFocused();
    act(() => screen.getByRole("button", { name: "Choose" }).focus());
    keyboardTo(300);
    act(() => from.focus());
    keyboardTo(0);

    expect(tap(to).focusedAtLift).toBe(dialog);
    expect(to).toHaveFocus();
  });

  it("leaves a touch with two fingers alone", async () => {
    standInViewport(0);
    const { from, to } = await openWithFromFocused();
    raiseAndLower();

    expect(tap(to, 2).focusedAtLift).toBe(from);
  });

  // Pinch-zoomed, the visual viewport's height says nothing about a keyboard.
  it("leaves a tap alone while pinch-zoomed", async () => {
    standInViewport(0);
    const { from, to } = await openWithFromFocused();
    raiseAndLower();
    act(() => {
      (viewport as unknown as { scale: number }).scale = 2;
    });

    expect(tap(to).focusedAtLift).toBe(from);
  });

  // A stacked sheet is portalled beside the one under it. With a field in the
  // top sheet focused, only the top sheet's hook may act: the one underneath
  // must not pull focus out of the top sheet.
  it("with a sheet stacked on it, only the top sheet acts", async () => {
    standInViewport(0);
    render(<StackedFieldSheets />);
    const topField = await screen.findByRole("textbox", { name: "On top" });
    // Hidden from the accessibility tree while the top sheet is open.
    const parentField = screen.getByRole("textbox", { name: "Under", hidden: true });
    act(() => topField.focus());
    raiseAndLower();

    expect(tap(parentField).focusedAtLift).toBe(topField);
  });
});

function StackedFieldSheets() {
  return (
    <BottomSheet
      open
      onClose={jest.fn()}
      title="Under"
      keyboardAware
      stacked={
        <BottomSheet open onClose={jest.fn()} title="Top" keyboardAware>
          <label>
            On top
            <input type="text" />
          </label>
        </BottomSheet>
      }
    >
      <label>
        Under
        <input type="text" />
      </label>
    </BottomSheet>
  );
}
