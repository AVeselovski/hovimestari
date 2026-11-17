import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { BottomSheet } from "../BottomSheet";
import { CLOSING_PRESS_MS } from "../closingSheet";

// A sheet closed by a press inside it swallows a press near that press's
// point on the page until CLOSING_PRESS_MS after it, however soon its exit
// ends (components/ui/closingSheet.ts): from `md` a dialog's exit is shorter
// than a slow mouse double click, whose second click lands where the first
// did. A press elsewhere lands. Here the exit ends at once, so what is left
// is the time and the place. The clock is fake. The double click itself is
// measured in a real browser at 768 and 1280.

function Page({ onUnder }: { onUnder: () => void }) {
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <button type="button" onClick={onUnder}>
        under
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        reopen
      </button>
      <button type="button" onClick={() => setMounted(false)}>
        unmount
      </button>
      {mounted && (
        <BottomSheet ariaLabel="Test sheet" open={open} onClose={() => setOpen(false)}>
          <button type="button" onClick={() => setOpen(false)}>
            Done
          </button>
          <button type="button">inside</button>
        </BottomSheet>
      )}
    </>
  );
}

/** A sheet with a sheet stacked on it, whose Done closes both and unmounts the stacked one, as Save and log does. */
function Stacked({ onUnder }: { onUnder: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={onUnder}>
        under
      </button>
      <BottomSheet
        ariaLabel="Parent"
        open={open}
        onClose={() => setOpen(false)}
        stacked={
          open && (
            <BottomSheet ariaLabel="Child" open onClose={() => setOpen(false)}>
              <button type="button" onClick={() => setOpen(false)}>
                Done
              </button>
            </BottomSheet>
          )
        }
      >
        <p>Parent body</p>
      </BottomSheet>
    </>
  );
}

/** A mouse press at a point (the top left corner unless given): down, up and the click. */
function mouseClick(el: HTMLElement, at: { clientX: number; clientY: number } = { clientX: 0, clientY: 0 }): void {
  fireEvent.pointerDown(el, at);
  fireEvent.mouseDown(el, at);
  fireEvent.pointerUp(el, at);
  fireEvent.mouseUp(el, at);
  fireEvent.click(el, { detail: 1, ...at });
}

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const button = (name: string) => screen.getByRole("button", { name, hidden: true });

// jsdom has no PointerEvent, so a pointerdown it fires carries no point. A
// browser's PointerEvent is a MouseEvent with its clientX and clientY.
const hadPointerEvent = "PointerEvent" in window;
beforeAll(() => {
  if (!hadPointerEvent)
    Object.defineProperty(window, "PointerEvent", { value: class extends MouseEvent {}, configurable: true });
});
afterAll(() => {
  if (!hadPointerEvent) delete (window as { PointerEvent?: unknown }).PointerEvent;
});

describe("A sheet closed by a press inside it", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each([60, 150, 300, 450])("swallows a second click %i ms after the press that closed it", (gap) => {
    const onUnder = jest.fn();
    render(<Page onUnder={onUnder} />);
    mouseClick(screen.getByRole("button", { name: "Done" }));
    advance(gap);
    mouseClick(button("under"));
    expect(onUnder).not.toHaveBeenCalled();
  });

  it.each([100, 250, 450])("lets a press far from the closing press land %i ms after it", (gap) => {
    const onUnder = jest.fn();
    render(<Page onUnder={onUnder} />);
    mouseClick(screen.getByRole("button", { name: "Done" }), { clientX: 200, clientY: 600 });
    advance(gap);
    mouseClick(button("under"), { clientX: 200, clientY: 300 });
    expect(onUnder).toHaveBeenCalledTimes(1);
  });

  it("swallows a press within 24 px of the closing press, and lets one 30 px away land", () => {
    const onUnder = jest.fn();
    render(<Page onUnder={onUnder} />);
    mouseClick(screen.getByRole("button", { name: "Done" }), { clientX: 200, clientY: 600 });
    advance(150);
    mouseClick(button("under"), { clientX: 216, clientY: 616 });
    expect(onUnder).not.toHaveBeenCalled();
    mouseClick(button("under"), { clientX: 230, clientY: 600 });
    expect(onUnder).toHaveBeenCalledTimes(1);
  });

  it("swallows a touch's second tap at the same point, by its touchend", () => {
    const onUnder = jest.fn();
    render(<Page onUnder={onUnder} />);
    mouseClick(screen.getByRole("button", { name: "Done" }), { clientX: 200, clientY: 600 });
    advance(200);
    const tap = new Event("touchend", { bubbles: true, cancelable: true });
    Object.defineProperty(tap, "changedTouches", { value: [{ clientX: 202, clientY: 598 }] });
    button("under").dispatchEvent(tap);
    expect(tap.defaultPrevented).toBe(true);
  });

  it("lets a click through 600 ms after the press that closed it", () => {
    const onUnder = jest.fn();
    render(<Page onUnder={onUnder} />);
    mouseClick(screen.getByRole("button", { name: "Done" }));
    advance(499);
    mouseClick(button("under"));
    expect(onUnder).not.toHaveBeenCalled();
    advance(101);
    mouseClick(button("under"));
    expect(onUnder).toHaveBeenCalledTimes(1);
    expect(CLOSING_PRESS_MS).toBe(500);
  });

  it("never swallows a click from the keyboard", () => {
    const onUnder = jest.fn();
    render(<Page onUnder={onUnder} />);
    mouseClick(screen.getByRole("button", { name: "Done" }));
    advance(100);
    fireEvent.click(button("under"), { detail: 0 });
    expect(onUnder).toHaveBeenCalledTimes(1);
  });

  it("swallows nothing after a close by a key, even soon after a press inside", () => {
    const onUnder = jest.fn();
    render(<Page onUnder={onUnder} />);
    mouseClick(screen.getByRole("button", { name: "inside" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "inside" }), { key: "Escape" });
    advance(100);
    mouseClick(button("under"));
    expect(onUnder).toHaveBeenCalledTimes(1);
  });

  it("stops swallowing at once when it opens again, and when it unmounts", () => {
    const onUnder = jest.fn();
    render(<Page onUnder={onUnder} />);
    mouseClick(screen.getByRole("button", { name: "Done" }));
    advance(100);
    // A reopen from code (the same sheet asked for again) ends the swallow.
    act(() => button("reopen").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    mouseClick(button("under"));
    expect(onUnder).toHaveBeenCalledTimes(1);
    mouseClick(screen.getByRole("button", { name: "Done" }));
    advance(100);
    act(() => button("unmount").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    mouseClick(button("under"));
    expect(onUnder).toHaveBeenCalledTimes(2);
  });

  it("swallows on the parent too when a stacked sheet closes both and leaves the document", () => {
    const onUnder = jest.fn();
    render(<Stacked onUnder={onUnder} />);
    mouseClick(screen.getByRole("button", { name: "Done", hidden: true }));
    expect(screen.queryByRole("dialog", { name: "Child", hidden: true })).toBeNull();
    advance(300);
    mouseClick(button("under"));
    expect(onUnder).not.toHaveBeenCalled();
  });
});
