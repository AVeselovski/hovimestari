import { stubPhone } from "@/__tests__/formSheet";
import { installResizeObserver, resize, setLayout } from "@/__tests__/helpers/resizeObserver";
import { controlSheetAnimations, pressOutsideSheet } from "@/__tests__/sheet";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BottomSheet } from "../BottomSheet";
import { Harness, waitForFocusInside } from "./bottomSheetHarness";

// The swipe, the motion and the handle's look are checked live in a real
// browser (docs/design/mobile-sheets-stage-4.md §i, M1 to M6): jsdom has no
// layout, no touch and no transitions. These pin the contracts.

describe("BottomSheet footer and minimum height", () => {
  it("renders the footer below the scrolling body, not inside it", () => {
    render(
      <BottomSheet open onClose={jest.fn()} ariaLabel="With footer" footer={<button type="button">Save</button>}>
        <p>Body</p>
      </BottomSheet>,
    );
    const body = screen.getByText("Body").parentElement!;
    const save = screen.getByRole("button", { name: "Save" });
    expect(body.className.split(" ")).toContain("overflow-y-auto");
    expect(body).not.toContainElement(save);
    expect(save.closest("[data-sheet-footer]")).not.toBeNull();
    // The footer clears the home indicator, so the body above it does not.
    expect(body.className).not.toContain("safe-area-inset-bottom");
  });

  it("stands at least the minimum sheet height below md", () => {
    render(
      <BottomSheet open onClose={jest.fn()} ariaLabel="Short">
        <p>One line</p>
      </BottomSheet>,
    );
    expect(screen.getByRole("dialog").className.split(" ")).toContain(
      "max-md:min-h-[calc(var(--sheet-min-height)+var(--safe-bottom))]",
    );
  });
});

describe("BottomSheet size", () => {
  const TALL = ["h-[calc(100dvh-var(--safe-top)-3rem)]", "md:h-[min(44rem,85dvh)]"];

  it("follows its content by default", () => {
    render(
      <BottomSheet open onClose={jest.fn()} ariaLabel="Auto">
        <p>Body</p>
      </BottomSheet>,
    );
    const classes = screen.getByRole("dialog").className.split(" ");
    for (const c of TALL) expect(classes).not.toContain(c);
    expect(screen.getByRole("dialog")).toHaveAttribute("data-sheet-size", "auto");
  });

  it("stands at one fixed height when tall, whatever its content", () => {
    const { rerender } = render(
      <BottomSheet open onClose={jest.fn()} ariaLabel="Tall" size="tall">
        <p>One line</p>
      </BottomSheet>,
    );
    const before = screen.getByRole("dialog").className;
    expect(before.split(" ")).toEqual(expect.arrayContaining(TALL));
    rerender(
      <BottomSheet open onClose={jest.fn()} ariaLabel="Tall" size="tall">
        {Array.from({ length: 50 }, (_, i) => (
          <p key={i}>Row {i}</p>
        ))}
      </BottomSheet>,
    );
    expect(screen.getByRole("dialog").className).toBe(before);
  });

  it("puts a custom header in the fixed row above the body, and is named by its label", () => {
    render(
      <BottomSheet open onClose={jest.fn()} ariaLabel="Foods" header={<input aria-label="Search" />} size="tall">
        <p>Body</p>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Foods" });
    const headerRow = dialog.querySelector("[data-sheet-header]")!;
    expect(headerRow).toContainElement(screen.getByLabelText("Search"));
    expect(dialog.querySelector("[data-sheet-body]")).not.toContainElement(screen.getByLabelText("Search"));
  });
});

describe("BottomSheet title", () => {
  it("names the dialog with a heading in a fixed row above the scrolling body", () => {
    render(
      <BottomSheet open onClose={jest.fn()} title="Add transaction" footer={<button type="button">Save</button>}>
        <p>Body</p>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Add transaction" });
    const heading = screen.getByRole("heading", { name: "Add transaction" });
    expect(dialog).not.toHaveAttribute("aria-label");
    expect(dialog).toHaveAttribute("aria-labelledby", heading.id);

    const body = screen.getByText("Body").parentElement!;
    expect(heading.closest("[data-sheet-header]")).not.toBeNull();
    expect(body).not.toContainElement(heading);
  });

  it("keeps the body one step under the title and one above the footer, at every width", () => {
    render(
      <BottomSheet open onClose={jest.fn()} title="Titled" footer={<button type="button">Save</button>}>
        <p>Body</p>
      </BottomSheet>,
    );
    const tokens = screen.getByText("Body").parentElement!.className.split(" ");
    expect(tokens).toEqual(expect.arrayContaining(["pt-4", "pb-4"]));
    expect(tokens).not.toContain("md:pt-6");
    expect(tokens).not.toContain("md:pb-6");
  });
});
// A second tap on the control that opened a sheet (a double tap on the
// header's +) lands on the backdrop already covering it. Until the sheet has
// finished sliding in, that tap must not close it.
describe("BottomSheet while it is still entering", () => {
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

  it("refuses a tap outside until the entry has finished, then closes on one", async () => {
    const animations = controlSheetAnimations();
    try {
      const onClose = jest.fn();
      const onOpened = jest.fn();
      render(<Harness initialOpen onClose={onClose} onOpened={onOpened} />);
      await settle();
      expect(onOpened).not.toHaveBeenCalled();

      pressOutsideSheet();
      await settle();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      animations.finish();
      await settle();
      expect(onOpened).toHaveBeenCalledTimes(1);
      pressOutsideSheet();
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      animations.restore();
    }
  });

  it("still closes on Escape while entering", async () => {
    const animations = controlSheetAnimations();
    try {
      const onClose = jest.fn();
      render(<Harness initialOpen onClose={onClose} />);
      await waitForFocusInside();
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      animations.restore();
    }
  });

  it("refuses a tap outside again on the next open until that entry has finished", async () => {
    const animations = controlSheetAnimations();
    try {
      const onClose = jest.fn();
      render(<Harness onClose={onClose} />);
      fireEvent.click(screen.getByRole("button", { name: "open" }));
      await settle();
      animations.finish();
      await settle();
      pressOutsideSheet();
      expect(onClose).toHaveBeenCalledTimes(1);
      await settle();
      animations.finish();
      await settle();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "open" }));
      await settle();
      pressOutsideSheet();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    } finally {
      animations.restore();
    }
  });
});

describe("BottomSheet holds still while open", () => {
  let restoreObserver: () => void;
  beforeEach(() => {
    restoreObserver = installResizeObserver();
  });
  afterEach(() => restoreObserver());

  /** An 800px viewport with 16px padding and a 300px panel centred in it. */
  function layOut() {
    const popup = screen.getByRole("dialog");
    const viewport = popup.parentElement!;
    setLayout(viewport, { clientHeight: 800 });
    setLayout(popup, { offsetTop: 250, offsetHeight: 300 });
    return { popup, viewport };
  }

  it("at md+ pins the centred panel once it has finished opening, so it grows downwards", async () => {
    const animations = controlSheetAnimations();
    try {
      render(<Harness initialOpen />);
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      const { popup, viewport } = layOut();
      // Still entering: content landing now is centred like the rest.
      act(() => resize(popup, viewport));
      expect(viewport.className).toContain("md:items-center");

      animations.finish();
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      act(() => resize(popup, viewport));
      expect(viewport.className).toContain("md:items-start");
      expect(viewport.className).not.toContain("md:items-center");
      // The viewport's padding is not in the jsdom style, so the margin is the whole top.
      expect(popup.style.marginTop).toBe("250px");
      expect(popup.style.minHeight).toBe("300px");

      // An inline error grows it by a line: the top stays.
      setLayout(popup, { offsetTop: 250, offsetHeight: 324 });
      act(() => resize(popup));
      expect(popup.style.marginTop).toBe("250px");
      expect(popup.style.minHeight).toBe("324px");
    } finally {
      animations.restore();
    }
  });

  it("below md it hangs from the bottom edge as always, never pinned", async () => {
    const restorePhone = stubPhone();
    try {
      render(<Harness initialOpen />);
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      const { popup, viewport } = layOut();
      act(() => resize(popup, viewport));
      expect(viewport.className).toContain("items-end");
      expect(viewport.className).toContain("md:items-center");
      expect(popup.style.marginTop).toBe("");
    } finally {
      restorePhone();
    }
  });

  it("holdScroll puts the body's content in a wrapper with an empty reserve after it", () => {
    const { unmount } = render(
      <BottomSheet open onClose={jest.fn()} ariaLabel="Long form" holdScroll>
        <p>Body</p>
      </BottomSheet>,
    );
    const wrapper = screen.getByText("Body").parentElement!;
    expect(wrapper).toHaveAttribute("data-scroll-hold-content");
    expect(wrapper.parentElement).toHaveAttribute("data-sheet-body");
    // The hold owns the scroll position: the browser's scroll anchoring would
    // move what is above a field that appears (measured live at 390px).
    expect(wrapper.parentElement!.className.split(" ")).toContain("[overflow-anchor:none]");
    const reserve = wrapper.nextElementSibling as HTMLElement;
    expect(reserve).toHaveAttribute("data-scroll-hold-reserve");
    expect(reserve).toHaveAttribute("aria-hidden", "true");
    expect(reserve.style.height).toBe("");
    unmount();

    render(
      <BottomSheet open onClose={jest.fn()} ariaLabel="Short form">
        <p>Body</p>
      </BottomSheet>,
    );
    expect(screen.getByText("Body").parentElement).toHaveAttribute("data-sheet-body");
    expect(screen.getByText("Body").parentElement!.className).not.toContain("overflow-anchor");
  });

  it("balances a title that wraps", () => {
    render(
      <BottomSheet open onClose={jest.fn()} title="Move 22 transactions to Food / Supplies?">
        <p>Body</p>
      </BottomSheet>,
    );
    expect(screen.getByRole("heading").className.split(" ")).toContain("text-balance");
  });
});
