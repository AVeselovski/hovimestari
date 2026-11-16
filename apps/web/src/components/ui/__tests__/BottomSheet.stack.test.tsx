import { pressOutsideSheet, trackFocus } from "@/__tests__/sheet";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StackHarness, openStack } from "./bottomSheetHarness";

// The swipe, the motion and the handle's look are checked live in a real
// browser (docs/design/mobile-sheets-stage-4.md §i, M1 to M6): jsdom has no
// layout, no touch and no transitions. These pin the contracts.

describe("BottomSheet with a sheet stacked on it", () => {
  it("marks itself as having a sheet stacked on it while that sheet is open, and not after", async () => {
    const user = userEvent.setup();
    render(<StackHarness />);
    const { parent } = await openStack(user);
    expect(parent).toHaveAttribute("data-nested-drawer-open");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Stacked sheet" })).not.toBeInTheDocument();
    expect(parent).not.toHaveAttribute("data-nested-drawer-open");
  });

  it("Escape closes only the stacked sheet", async () => {
    const user = userEvent.setup();
    const onParentClose = jest.fn();
    const onChildClose = jest.fn();
    render(<StackHarness onParentClose={onParentClose} onChildClose={onChildClose} />);
    const { parent } = await openStack(user);

    await user.keyboard("{Escape}");
    expect(onChildClose).toHaveBeenCalledTimes(1);
    expect(onParentClose).not.toHaveBeenCalled();
    expect(parent).toBeInTheDocument();
  });

  it("a press outside the stacked sheet closes only it", async () => {
    const user = userEvent.setup();
    const onParentClose = jest.fn();
    const onChildClose = jest.fn();
    render(<StackHarness onParentClose={onParentClose} onChildClose={onChildClose} />);
    const { parent } = await openStack(user);

    const backdrops = document.querySelectorAll("[data-sheet-backdrop]");
    expect(backdrops).toHaveLength(2);
    pressOutsideSheet(backdrops[1]);
    expect(onChildClose).toHaveBeenCalledTimes(1);
    expect(onParentClose).not.toHaveBeenCalled();
    expect(parent).toBeInTheDocument();
  });

  it("the stacked sheet has its own lighter backdrop and the raised surface", async () => {
    const user = userEvent.setup();
    render(<StackHarness />);
    const { parent, child } = await openStack(user);
    const [parentBackdrop, childBackdrop] = document.querySelectorAll("[data-sheet-backdrop]");
    expect(parentBackdrop).not.toHaveAttribute("data-sheet-stacked");
    expect(childBackdrop).toHaveAttribute("data-sheet-stacked");
    expect(child.className.split(" ")).toContain("bg-surface-raised");
    expect(parent.className.split(" ")).toContain("bg-surface");
    // Beside the parent in the parent's portal, not inside the parent itself.
    expect(parent).not.toContainElement(child);
    expect(parent.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // The sheet underneath holds the lock and releases it last. A stacked sheet
  // that locked too would capture <main>'s position when it opened and put
  // it back when it closed.
  it("a stacked sheet leaves <main> alone", async () => {
    const user = userEvent.setup();
    render(<StackHarness />);
    const main = screen.getByTestId("main");
    Object.defineProperty(main, "scrollTop", { value: 240, writable: true });

    await user.click(screen.getByRole("button", { name: "open" }));
    await screen.findByRole("dialog", { name: "Parent sheet" });
    expect(main.style.overflow).toBe("hidden");
    main.scrollTop = 500;
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByRole("dialog", { name: "Stacked sheet" });
    main.scrollTop = 999;

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Stacked sheet" })).not.toBeInTheDocument();
    expect(main.style.overflow).toBe("hidden");
    expect(main.scrollTop).toBe(999);

    await user.keyboard("{Escape}");
    expect(main.style.overflow).toBe("auto");
    expect(main.scrollTop).toBe(240);
  });

  it("closing the stacked sheet returns focus to the control in the parent that opened it", async () => {
    const user = userEvent.setup();
    render(<StackHarness />);
    await openStack(user);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Add" })).toHaveFocus();
  });

  // A quick-fill: the picker closes and the Add control becomes the value in
  // the same update. Focus must stay in the parent, not drop to <body>.
  it("hands focus to the parent sheet when the control that opened it is gone", async () => {
    const user = userEvent.setup();
    render(<StackHarness />);
    const { parent } = await openStack(user);
    await user.click(screen.getByRole("button", { name: "Fill" }));

    expect(screen.getByText("Filled")).toBeInTheDocument();
    expect(parent).toHaveFocus();
  });

  it("with no return target at all, still hands focus to the parent sheet, never to <body>", async () => {
    const user = userEvent.setup();
    render(<StackHarness childReturnsToOpener={false} />);
    await user.click(screen.getByRole("button", { name: "open" }));
    const parent = await screen.findByRole("dialog", { name: "Parent sheet" });
    await waitFor(() => expect(parent).toContainElement(document.activeElement as HTMLElement));
    // The WebKit case: a tapped control never takes focus, so the stacked
    // sheet captures <body> when it opens. (A focusable body stands in for
    // it: jsdom's `blur()` reports the document as the related target, which
    // Base UI cannot read.)
    document.body.tabIndex = -1;
    try {
      act(() => document.body.focus());
      expect(document.activeElement).toBe(document.body);
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      const child = await screen.findByRole("dialog", { name: "Stacked sheet" });
      await waitFor(() => expect(child).toContainElement(document.activeElement as HTMLElement));

      fireEvent.click(screen.getByRole("button", { name: "Fill" }));
      expect(parent).toHaveFocus();
    } finally {
      document.body.removeAttribute("tabindex");
    }
  });

  // A confirm: both close in one update. The stacked sheet restores first,
  // into the parent; the parent then restores to its own trigger.
  it("closing both in one update restores <main> and ends focus on the parent's trigger", async () => {
    const user = userEvent.setup();
    const onParentClose = jest.fn();
    render(<StackHarness onParentClose={onParentClose} />);
    const main = screen.getByTestId("main");
    const trigger = screen.getByRole("button", { name: "open" });
    trigger.focus();
    await openStack(user);
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    const add = screen.getByRole("button", { name: "Add", hidden: true });
    const focusTrail = trackFocus();

    fireEvent.click(save);
    focusTrail.stop();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(main.style.overflow).toBe("auto");
    // Through the parent's own control first, then to the parent's trigger,
    // never through <body>.
    expect(focusTrail.focused).toEqual([add, trigger]);
    expect(onParentClose).not.toHaveBeenCalled();
  });
});
