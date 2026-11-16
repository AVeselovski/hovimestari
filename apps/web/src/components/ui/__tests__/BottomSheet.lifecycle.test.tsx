import { controlSheetAnimations, holdSheetExits } from "@/__tests__/sheet";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect, useRef, useState } from "react";
import { Harness, SelfFocusingBody, waitForFocusInside } from "./bottomSheetHarness";

// The swipe, the motion and the handle's look are checked live in a real
// browser (docs/design/mobile-sheets-stage-4.md §i, M1 to M6): jsdom has no
// layout, no touch and no transitions. These pin the contracts.

describe("BottomSheet with a self-focusing body", () => {
  // The sheet's content mounts one commit after the sheet captures where
  // focus was, so a body that focuses itself can no longer be captured in
  // place of the trigger.
  it("still returns focus to the trigger on close", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <SelfFocusingBody />
      </Harness>,
    );
    const trigger = screen.getByRole("button", { name: "open" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("self-focusing-body")).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("keeps its own focus: the sheet does not move it to the first field", async () => {
    render(
      <Harness initialOpen>
        <SelfFocusingBody />
      </Harness>,
    );
    // Let Base UI's queued initial focus run.
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    expect(screen.getByTestId("self-focusing-body")).toHaveFocus();
  });

  // The body is not in the Tab order, so Shift+Tab from it must be caught by
  // the trap rather than walk back out to the trigger.
  it("Shift+Tab straight after opening stays inside the sheet", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <SelfFocusingBody />
      </Harness>,
    );
    await user.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByTestId("self-focusing-body")).toHaveFocus();

    await user.tab({ shift: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "a field" })).toHaveFocus());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("BottomSheet restoreFocusOnClose={false}", () => {
  it("restores nothing on close: the caller owns focus", async () => {
    const user = userEvent.setup();
    render(<Harness restoreFocusOnClose={false} />);
    const trigger = screen.getByRole("button", { name: "open" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await waitForFocusInside();

    const focusSpy = jest.spyOn(HTMLElement.prototype, "focus");
    await user.keyboard("{Escape}");
    expect(focusSpy).not.toHaveBeenCalled();
    focusSpy.mockRestore();
    expect(trigger).not.toHaveFocus();
  });
});

// A caller that closes with `open={false}` keeps the sheet mounted while it
// slides out, and reopening before the slide ends cancels the exit. The
// content must still mount fresh: a body that focuses itself must do so
// again (not have Base UI focus its first field, which pops a combobox),
// and no state from the cancelled visit may survive. jsdom has no
// animations, so this stubs one that never finishes, as a browser's exit
// is still running at the moment of the reopen.
describe("BottomSheet reopened while it is still sliding out", () => {
  let releaseExits: () => void;
  beforeEach(() => {
    releaseExits = holdSheetExits();
  });
  afterEach(() => releaseExits());

  function FreshBody({ onFirstFieldFocus }: { onFirstFieldFocus: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const [draft, setDraft] = useState("");
    useLayoutEffect(() => {
      ref.current?.focus();
    }, []);
    return (
      <div ref={ref} tabIndex={-1} data-testid="fresh-body">
        <input
          aria-label="draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={onFirstFieldFocus}
        />
      </div>
    );
  }

  it("mounts its content fresh: the body focuses itself again and the cancelled draft is gone", async () => {
    const user = userEvent.setup();
    const firstFieldFocus = jest.fn();
    render(
      <Harness>
        <FreshBody onFirstFieldFocus={firstFieldFocus} />
      </Harness>,
    );
    const trigger = screen.getByRole("button", { name: "open" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("fresh-body")).toHaveFocus();
    await user.type(screen.getByRole("textbox", { name: "draft" }), "cancelled");

    await user.keyboard("{Escape}");
    // Still in the DOM, sliding out, with focus back on the trigger.
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(trigger).toHaveFocus();
    firstFieldFocus.mockClear();

    await user.keyboard("{Enter}");
    // Let Base UI's queued initial focus run.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(screen.getByTestId("fresh-body")).toHaveFocus();
    expect(firstFieldFocus).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "draft" })).toHaveValue("");
  });
});

describe("BottomSheet onOpened", () => {
  it("fires once the sheet has finished entering, not before", async () => {
    const animations = controlSheetAnimations();
    try {
      const onOpened = jest.fn();
      render(<Harness initialOpen onOpened={onOpened} />);
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(onOpened).not.toHaveBeenCalled();

      animations.finish();
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

      expect(onOpened).toHaveBeenCalledTimes(1);
    } finally {
      animations.restore();
    }
  });
});

describe("BottomSheet onClosed", () => {
  it("fires once the sheet has finished leaving, not when the close starts, and not on a sheet that never opened", async () => {
    const animations = controlSheetAnimations();
    try {
      const onClosed = jest.fn();
      render(<Harness onClosed={onClosed} />);
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(onClosed).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "open" }));
      animations.finish();
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(onClosed).not.toHaveBeenCalled();

      fireEvent.keyDown(document, { key: "Escape" });
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      // Still sliding out: the content is on screen and nothing was forgotten yet.
      expect(onClosed).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "first", hidden: true })).toBeInTheDocument();

      animations.finish();
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(onClosed).toHaveBeenCalledTimes(1);
    } finally {
      animations.restore();
    }
  });
});
