import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Harness, StackHarness, openStack, waitForFocusInside } from "./bottomSheetHarness";

// Tab never leaves the top-most open sheet, however fast it is pressed.
// Base UI's focus guard moves focus on a frame late, so each assertion here is
// read straight after its key, with no wait: a second Tab inside that frame
// is what walked out to <body> and the page behind the sheet.

type User = ReturnType<typeof userEvent.setup>;

/** Presses Tab (or Shift+Tab) `times` times and returns where focus was after each press. */
async function pressTab(user: User, times: number, shift = false): Promise<(Element | null)[]> {
  const seen: (Element | null)[] = [];
  for (let i = 0; i < times; i++) {
    await user.tab({ shift });
    seen.push(document.activeElement);
  }
  return seen;
}

function namesOf(elements: (Element | null)[]): string[] {
  return elements.map((el) => el?.textContent || el?.tagName.toLowerCase() || "null");
}

describe("BottomSheet keeps Tab inside itself", () => {
  it("Tab from the last control goes straight to the first, and a run of Tabs never leaves", async () => {
    const user = userEvent.setup();
    render(<Harness initialOpen />);
    await waitForFocusInside();
    screen.getByRole("button", { name: "last" }).focus();

    const seen = await pressTab(user, 6);
    expect(namesOf(seen)).toEqual(["first", "last", "first", "last", "first", "last"]);
  });

  it("Shift+Tab from the first control goes straight to the last, and a run never leaves", async () => {
    const user = userEvent.setup();
    render(<Harness initialOpen />);
    await waitForFocusInside();
    screen.getByRole("button", { name: "first" }).focus();

    const seen = await pressTab(user, 6, true);
    expect(namesOf(seen)).toEqual(["last", "first", "last", "first", "last", "first"]);
  });

  it("Tab from the page behind the open sheet goes into the sheet", async () => {
    const user = userEvent.setup();
    render(<Harness initialOpen />);
    await waitForFocusInside();

    // Focus that got out, as the guard race leaves it. jsdom's blur() hands
    // Base UI a relatedTarget it cannot read, so the page's own control stands in.
    const behind = screen.getByText("open");
    behind.focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();

    behind.focus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "last" })).toHaveFocus();
  });

  it("a key a control inside the sheet already handled is left to it", async () => {
    const user = userEvent.setup();
    render(
      <Harness initialOpen>
        <button type="button">first</button>
        <button type="button" onKeyDown={(e) => e.key === "Tab" && e.preventDefault()}>
          keeps Tab
        </button>
      </Harness>,
    );
    await waitForFocusInside();
    const keeper = screen.getByRole("button", { name: "keeps Tab" });
    keeper.focus();
    await user.tab();
    expect(keeper).toHaveFocus();
  });

  it("leaves Tab on a date field at either end to the field, whose segments take it", async () => {
    render(
      <Harness initialOpen>
        <input type="date" aria-label="From" />
        <button type="button">middle</button>
        <input type="date" aria-label="To" />
      </Harness>,
    );
    await waitForFocusInside();
    // jsdom has no date segments, so the key is dispatched by hand and the
    // test reads whether the wrap took it: the browser's own move between
    // segments needs the key left unprevented.
    for (const [name, shiftKey] of [
      ["From", true],
      ["To", false],
    ] as const) {
      const field = screen.getByLabelText(name);
      field.focus();
      const key = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
      field.dispatchEvent(key);
      expect(key.defaultPrevented).toBe(false);
      expect(field).toHaveFocus();
    }
  });

  it("leaves a Tab pressed while an input method is composing to the input method", async () => {
    render(<Harness initialOpen />);
    await waitForFocusInside();
    const last = screen.getByRole("button", { name: "last" });
    last.focus();
    const key = new KeyboardEvent("keydown", { key: "Tab", isComposing: true, bubbles: true, cancelable: true });
    last.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expect(last).toHaveFocus();
  });

  it("leaves Tab in the toast region to the toast", async () => {
    const user = userEvent.setup();
    render(
      <>
        <div data-toast-region="" tabIndex={-1} data-testid="region">
          <button type="button">Undo</button>
        </div>
        <Harness initialOpen />
      </>,
    );
    await waitForFocusInside();
    screen.getByTestId("region").focus();
    await user.tab();
    // Hidden from assistive tech by the open sheet, so found by its text.
    expect(screen.getByText("Undo")).toHaveFocus();
  });

  it("stops listening once it closes: Tab on the page moves as it always does", async () => {
    const user = userEvent.setup();
    render(<Harness initialOpen />);
    await waitForFocusInside();
    await user.keyboard("{Escape}");
    const trigger = screen.getByRole("button", { name: "open" });
    (document.activeElement as HTMLElement).blur();
    await user.tab();
    expect(trigger).toHaveFocus();
  });
});

describe("BottomSheet with a sheet stacked on it keeps Tab in the top-most sheet", () => {
  it("Shift+Tab and Tab runs stay in the stacked sheet, never the sheet under it", async () => {
    const user = userEvent.setup();
    render(<StackHarness />);
    const { parent, child } = await openStack(user);
    screen.getByRole("button", { name: "Fill" }).focus();

    const back = await pressTab(user, 5, true);
    const forward = await pressTab(user, 5);
    for (const el of [...back, ...forward]) {
      expect(child).toContainElement(el as HTMLElement);
      expect(parent).not.toContainElement(el as HTMLElement);
    }
    expect(namesOf(back)).toEqual(["Save", "Fill", "Save", "Fill", "Save"]);
  });

  it("once the stacked sheet closes, Tab wraps in the sheet under it again", async () => {
    const user = userEvent.setup();
    render(<StackHarness />);
    const { parent } = await openStack(user);
    await user.keyboard("{Escape}");
    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toHaveFocus();

    const seen = await pressTab(user, 4);
    for (const el of seen) expect(parent).toContainElement(el as HTMLElement);
  });
});
