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

// Base UI takes over every tap on a text field: it cancels the tap's default
// and focuses the field from code inside the tap, which iOS answers with the
// keyboard. Once the reader has hidden the keyboard with the keyboard's own
// button, iOS shows it again only for a real tap on a field, never for a
// focus from code, so every taken-over tap after that leaves the field
// without a keyboard. While the keyboard is down, a tap on a text field is
// left to the browser. A cancelled `touchend` is what a taken-over tap looks
// like from outside.
describe("BottomSheet while the keyboard is down", () => {
  const onButtonClick = jest.fn();
  const onTouch = jest.fn();

  function EntrySheet({ keyboardAware = true }: { keyboardAware?: boolean }) {
    return (
      <BottomSheet
        open
        onClose={jest.fn()}
        ariaLabel="Entry"
        keyboardAware={keyboardAware}
        // The log sheet's search field sits in the fixed header row, outside the body.
        header={
          <label>
            Search
            <input type="text" inputMode="search" />
          </label>
        }
      >
        {/* A React touch handler inside the sheet: it runs only when nothing stopped the touch. */}
        <div onTouchStart={onTouch}>
          <label>
            Amount
            <input type="text" inputMode="decimal" />
          </label>
          <label>
            Name
            <input type="text" />
          </label>
          <label>
            Note
            <textarea />
          </label>
          <label>
            Day
            <input type="date" />
          </label>
          <button type="button" onClick={onButtonClick}>
            Eaten
          </button>
        </div>
      </BottomSheet>
    );
  }

  beforeEach(() => {
    onButtonClick.mockClear();
    onTouch.mockClear();
  });

  function keyboardTo(height: number) {
    act(() => {
      viewport.height = height;
      viewport.dispatchEvent(new Event("resize"));
    });
  }
  const keyboardUp = () => keyboardTo(window.innerHeight - keyboard);
  const keyboardDown = () => keyboardTo(window.innerHeight);

  /** A tap on `el`. True when the browser keeps its own tap: its `touchend` is not cancelled. */
  function tap(el: HTMLElement): boolean {
    const point = { clientX: 100, clientY: 300 };
    fireEvent.touchStart(el, { touches: [point], changedTouches: [point] });
    const native = fireEvent.touchEnd(el, { touches: [], changedTouches: [point] });
    // The browser's own tap ends in its own focus and click.
    if (native) {
      act(() => el.focus());
      fireEvent.click(el);
    }
    return native;
  }

  async function setUp(keyboardAware?: boolean) {
    render(<EntrySheet keyboardAware={keyboardAware} />);
    const search = screen.getByRole("textbox", { name: "Search" });
    await waitFor(() => expect(search).toHaveFocus());
    await frames(2);
    return {
      search,
      amount: screen.getByRole("textbox", { name: "Amount" }),
      name: screen.getByRole("textbox", { name: "Name" }),
      note: screen.getByRole("textbox", { name: "Note" }),
      day: screen.getByLabelText("Day"),
      eaten: screen.getByRole("button", { name: "Eaten" }),
    };
  }

  it("takes over a tap on a text field while the keyboard is up", async () => {
    const { name } = await setUp();
    expect(tap(name)).toBe(false);
    expect(name).toHaveFocus();
  });

  it("leaves a tap on a text field after the keyboard goes down to the browser", async () => {
    const { name } = await setUp();
    keyboardDown();
    expect(tap(name)).toBe(true);
    expect(name).toHaveFocus();
  });

  it("does the same for a tap on the field that kept focus when the keyboard went down", async () => {
    const { search } = await setUp();
    keyboardDown();
    expect(tap(search)).toBe(true);
  });

  it("does the same for a tap on a field's label", async () => {
    const { name } = await setUp();
    keyboardDown();
    expect(tap(name.closest("label")!)).toBe(true);
  });

  it("does the same for a field in the sheet's header row", async () => {
    const { search, name } = await setUp();
    act(() => name.focus());
    keyboardDown();
    expect(tap(search)).toBe(true);
    expect(search).toHaveFocus();
  });

  // Across states: the takeover is back once the keyboard is.
  it("takes over taps again once that field has focus and the keyboard is up", async () => {
    const { name, note } = await setUp();
    keyboardDown();
    expect(tap(name)).toBe(true);
    keyboardUp();
    expect(tap(note)).toBe(false);
    expect(note).toHaveFocus();
  });

  it("takes over again once the keyboard is back, even with no new focus", async () => {
    const { search, name } = await setUp();
    keyboardDown();
    // The browser's tap on the field that kept focus raises the keyboard and focuses nothing new.
    keyboardUp();
    expect(tap(name)).toBe(false);
    expect(search).not.toHaveFocus();
  });

  // A field that took focus while the keyboard stays down (the browser's tap
  // did not raise it, or code focused it) is no sign that iOS will raise it
  // for the next focus from code. Only the keyboard coming up is.
  it("leaves every tap to the browser while the keyboard stays down", async () => {
    const { name, note } = await setUp();
    keyboardDown();
    expect(tap(name)).toBe(true);
    expect(tap(note)).toBe(true);
    expect(note).toHaveFocus();
  });

  // The search field's clear button focuses its field from code.
  it("leaves the next tap to the browser after code focused a field with the keyboard down", async () => {
    const { name, note } = await setUp();
    keyboardDown();
    act(() => note.focus());
    expect(tap(name)).toBe(true);
  });

  // Focus left the sheet's text fields (a button took it) and the keyboard went away.
  it("leaves a tap to the browser after focus left the fields with the keyboard down", async () => {
    const { search, eaten } = await setUp();
    act(() => eaten.focus());
    keyboardDown();
    expect(tap(search)).toBe(true);
    expect(search).toHaveFocus();
  });

  // A sheet that opens with the keyboard down: the keyboard was perhaps hidden
  // over another sheet, and nothing has raised it since.
  it("leaves a tap to the browser when the keyboard has been down since the sheet opened", async () => {
    viewport.height = window.innerHeight;
    render(<EntrySheet />);
    const name = screen.getByRole("textbox", { name: "Name" });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Search" })).toHaveFocus());
    await frames(2);
    expect(tap(name)).toBe(true);
    expect(name).toHaveFocus();
  });

  it("leaves a tap on a button alone", async () => {
    const { name, eaten } = await setUp();
    keyboardDown();
    tap(eaten);
    expect(onTouch).toHaveBeenCalledTimes(1);
    expect(onButtonClick).toHaveBeenCalledTimes(1);
    // The keyboard is still down: the next tap on a field goes to the browser.
    expect(tap(name)).toBe(true);
  });

  // A date field opens the platform's own picker, not a keyboard: Base UI
  // leaves it alone, and so does the sheet.
  it("leaves a tap on a date field alone", async () => {
    const { day } = await setUp();
    keyboardDown();
    expect(tap(day)).toBe(true);
    expect(onTouch).toHaveBeenCalledTimes(1);
  });

  it("keeps the touch from reaching the sheet's handlers only while the keyboard is down", async () => {
    const { name, note } = await setUp();
    keyboardDown();
    tap(name);
    expect(onTouch).not.toHaveBeenCalled();
    keyboardUp();
    tap(note);
    expect(onTouch).toHaveBeenCalledTimes(1);
  });

  // Pinch-zoomed, the visual viewport's height says nothing about a keyboard,
  // and Base UI reads it as no keyboard and takes over nothing.
  it("leaves every tap to the browser while pinch-zoomed", async () => {
    const { name } = await setUp();
    act(() => {
      (viewport as unknown as { scale: number }).scale = 2;
    });
    expect(tap(name)).toBe(true);
  });

  it("changes nothing for a sheet that is not keyboard-aware", async () => {
    const { name } = await setUp(false);
    keyboardDown();
    expect(tap(name)).toBe(true);
    expect(onTouch).toHaveBeenCalledTimes(1);
  });
});
