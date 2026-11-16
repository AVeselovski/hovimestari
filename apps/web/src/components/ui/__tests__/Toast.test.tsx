import { holdSheetExits } from "@/__tests__/sheet";
import { Toast } from "@base-ui/react/toast";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ToastProvider, ToastRegion, useToast } from "../Toast";

// Two callers of useToast share one region. Their toasts never share an id,
// which the toast manager closes and times them by.

function Caller({ name, onUndo }: { name: string; onUndo?: () => void }): ReactElement {
  const toast = useToast();
  const show = () =>
    toast.show({ message: `From ${name}.`, action: onUndo ? { label: "Undo", onPress: onUndo } : undefined });
  return (
    <button type="button" onClick={show}>
      {name}
    </button>
  );
}

const seen = new Set<string>();
function Ids(): null {
  for (const t of Toast.useToastManager().toasts) seen.add(`${t.id}:${String(t.title)}`);
  return null;
}

describe("useToast", () => {
  it("gives every toast its own id across callers", async () => {
    render(
      <ToastProvider>
        <Caller name="One" />
        <Caller name="Two" />
        <ToastRegion />
        <Ids />
      </ToastProvider>,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "One" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Two" })));
    const byId = new Map<string, string>();
    for (const entry of seen) {
      const [id, title] = entry.split(":");
      expect(byId.get(id) ?? title).toBe(title);
      byId.set(id, title);
    }
    expect([...byId.values()].sort()).toEqual(["From One.", "From Two."]);
    const live = [...document.querySelectorAll("[data-toast]")].filter((t) => !t.hasAttribute("data-ending"));
    expect(live.map((t) => t.textContent)).toEqual(["From Two."]);
  });

  it("keeps a closing toast catching presses, hidden from assistive tech and out of the Tab order, so a double tap runs its action once and reaches nothing under it", async () => {
    const onUndo = jest.fn();
    const under = jest.fn();
    render(
      <ToastProvider>
        <Caller name="One" onUndo={onUndo} />
        <ToastRegion />
      </ToastProvider>,
    );
    // The fade, which jsdom does not run, held as the browser holds it: Base UI keeps a closing toast until it ends.
    const release = holdSheetExits();
    document.addEventListener("click", under);
    try {
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "One" })));
      under.mockClear();
      const toast = document.querySelector<HTMLElement>("[data-toast]")!;
      const undo = toast.querySelector("button")!;
      await act(async () => fireEvent.click(undo));
      const closing = document.querySelector<HTMLElement>("[data-toast][data-ending]")!;
      expect(closing).not.toBeNull();
      fireEvent.click(closing.querySelector("button")!);
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(closing).not.toHaveAttribute("inert");
      expect(closing).toHaveAttribute("aria-hidden", "true");
      expect(closing.querySelector("button")).toHaveAttribute("tabindex", "-1");
      // Only the first press reached the document: the closing toast caught the second.
      expect(under).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("click", under);
      release();
    }
  });

  it("draws the live toast after every closing one, so the closing toast never paints over the new one's Undo", async () => {
    const release = holdSheetExits();
    try {
      render(
        <ToastProvider>
          <Caller name="One" onUndo={jest.fn()} />
          <Caller name="Two" onUndo={jest.fn()} />
          <ToastRegion />
        </ToastProvider>,
      );
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "One" })));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Two" })));
      const all = [...document.querySelectorAll<HTMLElement>("[data-toast]")];
      const live = all.filter((t) => !t.hasAttribute("data-ending"));
      const ending = all.filter((t) => t.hasAttribute("data-ending"));
      expect(live.map((t) => t.textContent)).toEqual(["From Two.Undo"]);
      expect(ending).toHaveLength(1);
      // Later in the document paints on top: the toasts share one place and no z-index.
      expect(ending[0].compareDocumentPosition(live[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    } finally {
      release();
    }
  });

  it("takes no focus on a pointer press of its action, and the press still runs it", async () => {
    const onUndo = jest.fn();
    render(
      <ToastProvider>
        <Caller name="One" onUndo={onUndo} />
        <ToastRegion />
      </ToastProvider>,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "One" })));
    const undo = document.querySelector<HTMLElement>("[data-toast] button")!;
    // false: the default, which is to move focus to the button, was prevented.
    expect(fireEvent.pointerDown(undo)).toBe(false);
    expect(fireEvent.mouseDown(undo)).toBe(false);
    await act(async () => fireEvent.click(undo, { detail: 1 }));
    expect(onUndo).toHaveBeenCalledWith({ fromKeyboard: false });
  });

  it("moves focus out of a toast pressed from the keyboard before hiding it, back to where focus came from", async () => {
    const release = holdSheetExits();
    try {
      render(
        <ToastProvider>
          <Caller name="One" onUndo={jest.fn()} />
          <ToastRegion />
        </ToastProvider>,
      );
      const opener = screen.getByRole("button", { name: "One" });
      await act(async () => fireEvent.click(opener));
      const undo = document.querySelector<HTMLElement>("[data-toast] button")!;
      opener.focus();
      // Tab from the opener into the toast.
      act(() => undo.focus());
      const hiddenWithFocus: boolean[] = [];
      const watch = new MutationObserver(() => {
        const hidden = document.activeElement?.closest('[aria-hidden="true"]');
        hiddenWithFocus.push(hidden !== null && hidden !== undefined);
      });
      watch.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["aria-hidden"] });
      await act(async () => fireEvent.click(undo, { detail: 0 }));
      watch.disconnect();
      expect(document.querySelector("[data-toast][data-ending]")).not.toBeNull();
      expect(document.activeElement).toBe(opener);
      expect(hiddenWithFocus).not.toContain(true);
    } finally {
      release();
    }
  });
});
