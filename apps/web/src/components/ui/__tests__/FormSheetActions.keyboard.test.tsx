import { act, render, screen } from "@testing-library/react";
import { FormSheetActions } from "../FormSheetActions";

// A footer row that gives its room to the on-screen keyboard leaves the Tab
// order while the keyboard holds it at no height, and comes back when the
// keyboard closes. jsdom has no layout and no ResizeObserver, so the
// observer is given as a browser drives it: it reports the row's content box,
// which the clamp in globals.css takes to 0 while the keyboard is open. The
// real row is measured in Chromium with a keyboard emulated.

type Report = (height: number) => void;
let report: Report = () => {};
const original = globalThis.ResizeObserver;

beforeEach(() => {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element): void {
      report = (height) =>
        this.callback([{ target, contentRect: { height } as DOMRectReadOnly } as ResizeObserverEntry], this);
    }
    unobserve(): void {}
    disconnect(): void {
      report = () => {};
    }
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  globalThis.ResizeObserver = original;
});

function renderActions() {
  render(
    <FormSheetActions
      formId="f"
      onCancel={jest.fn()}
      submitting={false}
      idle="Save"
      busy="Saving…"
      start={{ label: "Remove entry", onPress: jest.fn(), yieldsToKeyboard: true }}
    />,
  );
  return screen.getByRole("button", { name: "Remove entry" }).closest<HTMLElement>("[data-keyboard-yields]")!;
}

describe("A footer row that yields to the keyboard", () => {
  it("is inert while the keyboard holds it at no height, and back in the Tab order when it closes", () => {
    const row = renderActions();
    expect(row).toHaveClass("keyboard-yields");
    act(() => report(44));
    expect(row).not.toHaveAttribute("inert");
    act(() => report(0));
    expect(row).toHaveAttribute("inert");
    act(() => report(44));
    expect(row).not.toHaveAttribute("inert");
  });
});
