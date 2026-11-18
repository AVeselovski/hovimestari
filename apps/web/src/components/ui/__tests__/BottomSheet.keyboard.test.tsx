import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BottomSheet } from "../BottomSheet";

// Neither jsdom nor Playwright has a software keyboard. These tests stand one
// in: the visual viewport is shorter than the window by more than browser
// chrome, which is how Base UI's keyboard handling tells that a keyboard is
// open. The iOS behaviour itself is the owner's device check.

const keyboard = 368;

let viewport: EventTarget & { height: number };
beforeEach(() => {
  viewport = Object.assign(new EventTarget(), {
    width: window.innerWidth,
    height: window.innerHeight - keyboard,
    offsetTop: 0,
    offsetLeft: 0,
    pageTop: 0,
    pageLeft: 0,
    scale: 1,
  });
  Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
});
afterEach(() => {
  delete (window as { visualViewport?: unknown }).visualViewport;
});

function TypingSheet({ keyboardAware }: { keyboardAware?: boolean }) {
  return (
    <BottomSheet
      open
      onClose={jest.fn()}
      title="Typing"
      keyboardAware={keyboardAware}
      footer={<button type="button">Save</button>}
    >
      <label>
        Name
        <input type="text" />
      </label>
    </BottomSheet>
  );
}

const frames = (n: number) =>
  act(async () => {
    for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
  });

// This pins that the sheet is wired to Base UI's keyboard handling at all:
// with a keyboard open and a text field focused, the keyboard's height
// reaches the sheet as `--drawer-keyboard-inset`, which the footer's padding
// adds.
describe("BottomSheet and the software keyboard", () => {
  it("hands the keyboard's height to a keyboard-aware sheet, and the footer rides above it", async () => {
    render(<TypingSheet keyboardAware />);
    const dialog = screen.getByRole("dialog", { name: "Typing" });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus());

    const viewportEl = dialog.parentElement!;
    await waitFor(() => expect(viewportEl.style.getPropertyValue("--drawer-keyboard-inset")).toBe(`${keyboard}px`));
    const footer = screen.getByRole("button", { name: "Save" }).closest<HTMLElement>("[data-sheet-footer]")!;
    // The footer pads by the popup's `--sheet-footer-pad`, which adds the inset.
    expect(footer.className.split(" ")).toContain("pb-(--sheet-footer-pad)");
    expect(dialog.className.split(" ")).toContain(
      "[--sheet-footer-pad:calc(1rem+max(var(--safe-bottom),var(--drawer-keyboard-inset,0px)))]",
    );
  });

  // The provider takes over every tap on a text field, which a short sheet
  // with no footer should not get: it is opt-in.
  it("leaves a sheet that does not ask for it alone", async () => {
    render(<TypingSheet />);
    const dialog = screen.getByRole("dialog", { name: "Typing" });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus());
    await frames(2);
    expect(dialog.parentElement!.style.getPropertyValue("--drawer-keyboard-inset")).toBe("");
  });
});

// With the keyboard up, Base UI scrolls the body to keep the focused field in
// view, and does it again on every change of the visual viewport, as the
// keyboard slides or changes height between a number pad and a text keyboard.
// A field that slides away under a finger loses the tap: Base UI resolves the
// tap where the finger lifts, so it lands on whatever moved in. Measured in a
// real browser (the Amount and Payee fields of the entry sheet); here the
// body's layout is stood in so that Base UI wants to scroll it.
describe("BottomSheet holds its body still under a finger", () => {
  const nativeScrollTo = Element.prototype.scrollTo;
  beforeAll(() => {
    // jsdom has no scrolling. An instant scroll is all a test can observe.
    Element.prototype.scrollTo = function (this: Element, arg?: ScrollToOptions | number) {
      if (typeof arg === "object" && arg.top !== undefined) this.scrollTop = arg.top;
    } as typeof Element.prototype.scrollTo;
  });
  afterAll(() => {
    Element.prototype.scrollTo = nativeScrollTo;
  });

  // jsdom has no DOMRect: a box with the fields Base UI reads.
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, left: 0, right: 390, x: 0, y: top, width: 390, height }) as DOMRect;

  /** A body 200px tall over 1000px of content, its field 320px down: off centre, so Base UI scrolls. */
  function standInLayout(body: HTMLElement, field: HTMLElement) {
    // What `overflow-y-auto` gives it in the browser: jsdom applies no stylesheet.
    body.style.overflowY = "auto";
    // jsdom keeps no scroll position: a plain one stands in.
    let scrollTop = 0;
    Object.defineProperty(body, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => (scrollTop = v),
    });
    Object.defineProperty(body, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 200 });
    body.getBoundingClientRect = () => rect(80, 200);
    field.getBoundingClientRect = () => rect(400 - body.scrollTop, 40);
  }

  async function setUp() {
    render(<TypingSheet keyboardAware />);
    const field = screen.getByRole("textbox", { name: "Name" });
    await waitFor(() => expect(field).toHaveFocus());
    const body = field.closest<HTMLElement>("[data-sheet-body]")!;
    await frames(4);
    standInLayout(body, field);
    return { field, body };
  }

  /** The keyboard changes height: Base UI aligns the focused field again. */
  async function keyboardResizes() {
    act(() => {
      viewport.height -= 10;
      viewport.dispatchEvent(new Event("resize"));
    });
    await frames(6);
  }

  it("does not scroll the body while a finger is down, and aligns again once it lifts", async () => {
    const { field, body } = await setUp();

    fireEvent.touchStart(field, { touches: [{ clientX: 100, clientY: 300 }] });
    await keyboardResizes();
    // The finger is down: what is under it stays under it.
    expect(body.scrollTop).toBe(0);

    fireEvent.touchEnd(field, { touches: [], changedTouches: [{ clientX: 100, clientY: 300 }] });
    await keyboardResizes();
    // The finger has lifted: the focused field is brought into view again.
    expect(body.scrollTop).toBeGreaterThan(0);
  });

  // A smooth scroll already under way does not stop for a touch: each step
  // it takes lands as a scroll event, and the hold puts it back.
  it("holds a scroll already under way where it stood when the finger landed", async () => {
    const { field, body } = await setUp();
    body.scrollTop = 120;
    fireEvent.touchStart(field, { touches: [{ clientX: 100, clientY: 300 }] });
    body.scrollTop = 134;
    fireEvent.scroll(body);
    expect(body.scrollTop).toBe(120);
  });

  // The reader's own scroll starts with the finger moving. The hold lets go
  // before the browser's scroll starts, so it never fights it.
  it("lets go once the finger moves, so the reader's own scroll is never put back", async () => {
    const { field, body } = await setUp();
    fireEvent.touchStart(field, { touches: [{ clientX: 100, clientY: 300 }] });
    fireEvent.touchMove(field, { touches: [{ clientX: 100, clientY: 290 }] });
    body.scrollTop = 30;
    fireEvent.scroll(body);
    expect(body.scrollTop).toBe(30);
  });

  it("scrolls the body as before when no finger is down", async () => {
    const { body } = await setUp();
    await keyboardResizes();
    expect(body.scrollTop).toBeGreaterThan(0);
  });
});
