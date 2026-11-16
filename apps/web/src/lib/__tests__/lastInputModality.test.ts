import { lastInputWasKeyboard, restoreFocus } from "../lastInputModality";

// Owner, 2026-09-23: closing the date-range sheet by tapping left a focus
// ring on the trigger. Focus restoration itself is a correctness requirement
// — a screen reader and a keyboard both need focus put back — so the fix is
// not to stop restoring, but to stop PAINTING when the reader never used a
// keyboard. `:focus-visible` cannot be set from script, so the ring is
// suppressed in CSS off a marker attribute, and this decides when it goes on.
describe("restoreFocus", () => {
  function trigger() {
    const el = document.createElement("button");
    document.body.appendChild(el);
    return el;
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("puts focus back either way", () => {
    const el = trigger();
    restoreFocus(el);
    expect(el).toHaveFocus();
  });

  it("marks the element after a tap, so the ring stays off", () => {
    const el = trigger();
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    restoreFocus(el);
    expect(el).toHaveAttribute("data-focus-restored");
  });

  it("leaves the ring alone when the reader is on a keyboard", () => {
    const el = trigger();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    restoreFocus(el);
    expect(el).not.toHaveAttribute("data-focus-restored");
  });

  it("drops the marker as soon as a key is pressed, so the ring is never disabled for good", () => {
    const el = trigger();
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    restoreFocus(el);
    expect(el).toHaveAttribute("data-focus-restored");

    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(el).not.toHaveAttribute("data-focus-restored");
  });

  // An element that cannot take focus (the hamburger, hidden at md+ when the
  // nav drawer closes on a resize) never fires the blur or keydown that
  // would clear the marker: left on, it would swallow the ring the next time
  // a keyboard reaches it.
  it("leaves no marker on an element that did not take focus", () => {
    const el = trigger();
    el.disabled = true; // jsdom's stand-in for an element that cannot take focus
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    restoreFocus(el);
    expect(el).not.toHaveFocus();
    expect(el).not.toHaveAttribute("data-focus-restored");
  });

  it("tracks the last input, not the first", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(lastInputWasKeyboard()).toBe(true);
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(lastInputWasKeyboard()).toBe(false);
  });
});

// The first close on a page must know about the keys pressed before it. When
// the listeners only started on the first question, a keyboard reader's first
// Escape found no answer yet and lost the focus ring they rely on.
describe("listening from the start", () => {
  it("counts a key pressed before anything has asked", () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh: typeof import("../lastInputModality") = require("../lastInputModality");
      document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      const el = document.createElement("button");
      document.body.appendChild(el);
      fresh.restoreFocus(el);
      expect(el).not.toHaveAttribute("data-focus-restored");
      el.remove();
    });
  });
});
