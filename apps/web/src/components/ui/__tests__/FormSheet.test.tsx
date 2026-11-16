import { stubPhone } from "@/__tests__/formSheet";
import { FormSheet, type FormSheetProps } from "@/components/ui/FormSheet";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { useState } from "react";

// The frame every form sheet shares. The contract each sheet keeps (dismissal,
// focus, the footer) runs on the sheets themselves through
// `describeFormSheetContract`. This covers what FormSheet adds on its own.

function renderSheet(props: Partial<FormSheetProps> = {}) {
  const onSubmit = jest.fn();
  const fieldProps: Array<{ autoFocus: boolean }> = [];
  render(
    <FormSheet
      open
      onClose={jest.fn()}
      title="Name it"
      returnFocusTo={null}
      dirty={false}
      submitting={false}
      onSubmit={onSubmit}
      formError={null}
      idle="Save"
      busy="Saving…"
      {...props}
    >
      {(field) => {
        fieldProps.push(field);
        return <input aria-label="Name" autoFocus={field.autoFocus} />;
      }}
    </FormSheet>,
  );
  const form = screen.getByRole("dialog").querySelector("form")!;
  return { onSubmit, fieldProps, form };
}

describe("FormSheet", () => {
  it("submits through its form, with the default action prevented", () => {
    const { onSubmit, form } = renderSheet();
    const event = new Event("submit", { bubbles: true, cancelable: true });
    fireEvent(form, event);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  // Enter in a field submits even while the button is busy, where the browser
  // has no disabled default button to stop it. Only this guard does.
  it("ignores a submit while a save runs", () => {
    const { onSubmit, form } = renderSheet({ submitting: true });
    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("while held, ignores the submit and the secondary action, and keeps Cancel and dismissal free", () => {
    const onClose = jest.fn();
    const onPress = jest.fn();
    const { onSubmit, form } = renderSheet({ held: true, onClose, footerStart: { label: "Remove", onPress } });
    fireEvent.submit(form);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Save" })).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByRole("button", { name: "Remove" })).toHaveAttribute("aria-disabled", "true");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(cancel).not.toHaveAttribute("aria-disabled");
    fireEvent.click(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows the description above the form and the refusal in the pinned footer, above the buttons", () => {
    renderSheet({ description: "What this does.", formError: "That did not work." });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleDescription("What this does.");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("That did not work.");
    // In the footer, outside the scrolling body, so it is in sight however the body is scrolled.
    const footer = dialog.querySelector("[data-sheet-footer]")!;
    expect(footer).toContainElement(alert);
    expect(dialog.querySelector("form")).not.toContainElement(alert);
    const cancel = within(footer as HTMLElement).getByRole("button", { name: "Cancel" });
    expect(alert.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the refusal line's room in the footer, given back to the body only while the keyboard is open", () => {
    renderSheet({ formError: null });
    const line = screen.getByRole("dialog").querySelector("[data-sheet-footer] [data-form-error]")!;
    expect(line.className.split(" ")).toContain("footer-error-room");
    // jsdom computes no clamp(), so the rule itself is read: two lines and their gap
    // while the keyboard is closed, none while it is open and the line is empty.
    const css = fs.readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
    const rule = css.slice(css.indexOf("@utility footer-error-room"));
    const block = rule.slice(0, rule.indexOf("\n}\n"));
    expect(block).toMatch(/^\s*min-height: 2\.5rem;$/m);
    expect(block).toMatch(/^\s*margin-bottom: 0\.5rem;$/m);
    const empty = block.slice(block.indexOf("&:empty"));
    expect(empty).toContain("min-height: clamp(0px, calc(2.5rem - var(--drawer-keyboard-inset, 0px) * 1000), 2.5rem)");
    expect(empty).toContain(
      "margin-bottom: clamp(0px, calc(0.5rem - var(--drawer-keyboard-inset, 0px) * 1000), 0.5rem)",
    );
  });

  it("carries the address for password managers only when given one", () => {
    const { form } = renderSheet({ username: "someone@example.test" });
    const hidden = form.querySelector<HTMLInputElement>('input[name="username"]')!;
    expect(hidden).toHaveAttribute("autocomplete", "username");
    expect(hidden).toHaveValue("someone@example.test");
    expect(hidden).not.toBeVisible();
  });

  it("has no hidden address without one", () => {
    const { form } = renderSheet();
    expect(form.querySelector('input[name="username"]')).toBeNull();
  });

  it("tells the fields to autofocus from md", () => {
    expect(renderSheet().fieldProps.at(-1)).toEqual({ autoFocus: true });
  });

  it("tells the fields not to autofocus on a phone, where the body takes focus", () => {
    const restore = stubPhone();
    try {
      expect(renderSheet().fieldProps.at(-1)).toEqual({ autoFocus: false });
    } finally {
      restore();
    }
  });

  // A sheet that awaits something (a barcode lookup) before it sets
  // `submitting`: the prop is still false when Enter submits again.
  it("ignores a second submit while the first one's promise is pending, before the caller sets submitting", async () => {
    let finish!: () => void;
    const onSubmit = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { form } = renderSheet({ onSubmit });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Once it settles, the next submit goes through.
    await act(async () => finish());
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("takes submits again after a submit whose promise rejected", async () => {
    const onSubmit = jest.fn().mockRejectedValueOnce(new Error("refused")).mockResolvedValue(undefined);
    const { form } = renderSheet({ onSubmit });
    fireEvent.submit(form);
    await act(async () => {});
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("passes the sheet's options through, with md:max-w-sm as the default width", () => {
    const onClosed = jest.fn();
    renderSheet({
      sheet: {
        panelClassName: "md:max-w-lg",
        headerNote: "A note under the title.",
        holdScroll: true,
        onClosed,
        stacked: <p>Stacked content</p>,
      },
    });
    const dialog = screen.getByRole("dialog", { name: "Name it" });
    expect(dialog).toHaveClass("md:max-w-lg");
    expect(dialog).not.toHaveClass("md:max-w-sm");
    expect(dialog.querySelector("[data-sheet-header]")).toHaveTextContent("A note under the title.");
    expect(dialog.querySelector("[data-sheet-body]")).toHaveClass("[overflow-anchor:none]");
    expect(screen.getByText("Stacked content")).toBeInTheDocument();
  });

  it("is md:max-w-sm without options", () => {
    renderSheet();
    expect(screen.getByRole("dialog")).toHaveClass("md:max-w-sm");
  });

  it("puts a secondary action in a row of its own above Cancel and Save", () => {
    renderSheet({ footerStart: { label: "Delete entry", onPress: jest.fn() } });
    const footer = screen.getByRole("dialog").querySelector<HTMLElement>("[data-sheet-footer]")!;
    const names = within(footer)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(["Delete entry", "Cancel", "SaveSaving…"]);
    const slot = footer.querySelector("[data-footer-start]")!;
    // A row of its own: the full width below md, and the whole flex line from md.
    expect(slot.className.split(" ")).toEqual(expect.arrayContaining(["col-span-2", "md:basis-full"]));
    expect(slot.parentElement!.className.split(" ")).toContain("md:flex-wrap");
    // No group around it for a screen reader to announce without a name.
    expect(within(footer).queryByRole("group")).toBeNull();
  });

  describe("while a save runs", () => {
    function Sheet({
      submitting,
      onDelete,
      onClose,
    }: {
      submitting: boolean;
      onDelete: (opener: HTMLElement) => void;
      onClose: () => void;
    }) {
      return (
        <FormSheet
          open
          onClose={onClose}
          title="Name it"
          returnFocusTo={null}
          dirty
          submitting={submitting}
          onSubmit={jest.fn()}
          formError={submitting ? null : "That did not work."}
          idle="Save"
          busy="Saving…"
          footerStart={{ label: "Delete entry", onPress: (opener) => onDelete(opener) }}
        >
          {() => <input aria-label="Name" />}
        </FormSheet>
      );
    }

    // A disabled button drops the focus it holds to <body>, outside the
    // modal. A phone's tap does not move focus off the button pressed last,
    // so a focused Delete or Cancel is the common case there.
    it.each(["Delete entry", "Cancel"])(
      "%s keeps focus through a save that fails, looks unavailable and ignores a press",
      (name) => {
        const onDelete = jest.fn();
        const onClose = jest.fn();
        const { rerender } = render(<Sheet submitting={false} onDelete={onDelete} onClose={onClose} />);
        const button = screen.getByRole("button", { name });
        act(() => button.focus());
        rerender(<Sheet submitting onDelete={onDelete} onClose={onClose} />);
        expect(button).toHaveAttribute("aria-disabled", "true");
        expect(button).not.toBeDisabled();
        expect(button.className.split(/\s+/)).toContain("aria-disabled:opacity-60");
        expect(button).toHaveFocus();
        fireEvent.click(button);
        expect(onDelete).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();

        // The save fails: the sheet stays, focus where it was, the button works again.
        rerender(<Sheet submitting={false} onDelete={onDelete} onClose={onClose} />);
        expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
        expect(button).toHaveFocus();
        expect(button).not.toHaveAttribute("aria-disabled");
        fireEvent.click(button);
        expect(name === "Cancel" ? onClose : onDelete).toHaveBeenCalledTimes(1);
      },
    );

    it("hands the secondary action its own button, for the confirmation to return focus to", () => {
      const onDelete = jest.fn();
      render(<Sheet submitting={false} onDelete={onDelete} onClose={jest.fn()} />);
      const button = screen.getByRole("button", { name: "Delete entry" });
      fireEvent.click(button);
      expect(onDelete).toHaveBeenCalledWith(button);
    });
  });

  describe("the secondary action's kinds", () => {
    const classes = (el: HTMLElement) => el.className.split(/\s+/);

    it("draws a press in the accent by default", () => {
      renderSheet({ footerStart: { label: "Delete entry", onPress: jest.fn() } });
      expect(classes(screen.getByRole("button", { name: "Delete entry" }))).toContain("text-accent");
    });

    it("draws a neutral press in ink, and hands it its button", () => {
      const onPress = jest.fn();
      renderSheet({ footerStart: { label: "Scan a label", tone: "neutral", onPress } });
      const button = screen.getByRole("button", { name: "Scan a label" });
      expect(classes(button)).toContain("text-ink");
      expect(classes(button)).not.toContain("text-accent");
      fireEvent.click(button);
      expect(onPress).toHaveBeenCalledWith(button);
    });

    it("submits the form in its own mode, while Save and Enter submit with none", () => {
      const { onSubmit, form } = renderSheet({
        footerStart: { label: "Save meal", busy: "Saving meal…", tone: "neutral", submit: "meal" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
      expect(onSubmit).toHaveBeenLastCalledWith("meal");
      fireEvent.submit(form);
      expect(onSubmit).toHaveBeenCalledTimes(2);
      expect(onSubmit.mock.calls[1]).toEqual([]);
      // Enter picks the form's first submit button: Save, never the secondary action.
      const save = screen.getByRole("button", { name: "Save" });
      expect(form.ownerDocument.querySelector(`button[type="submit"][form="${form.id}"]`)).toBe(save);
      expect(screen.getByRole("button", { name: "Save meal" })).toHaveAttribute("type", "button");
    });

    it("goes through the same in-flight guard as Save", async () => {
      let settle: () => void = () => {};
      const onSubmit = jest.fn(() => new Promise<void>((resolve) => (settle = resolve)));
      renderSheet({ onSubmit, footerStart: { label: "Save meal", busy: "Saving meal…", submit: "meal" } });
      fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
      fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      await act(async () => settle());
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    function Saving({ onSubmit }: { onSubmit: (mode?: string) => void }) {
      const [submitting, setSubmitting] = useState(false);
      return (
        <FormSheet
          open
          onClose={jest.fn()}
          title="Name it"
          returnFocusTo={null}
          dirty
          submitting={submitting}
          onSubmit={(mode) => {
            onSubmit(mode);
            setSubmitting(true);
          }}
          formError={null}
          idle="Save and log"
          busy="Saving…"
          footerStart={{ label: "Save meal", busy: "Saving meal…", tone: "neutral", submit: "meal" }}
        >
          {() => <input aria-label="Name" />}
        </FormSheet>
      );
    }

    it("shows its busy label on itself alone while its submit runs, and ignores a second press", () => {
      const onSubmit = jest.fn();
      render(<Saving onSubmit={onSubmit} />);
      fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
      const busy = screen.getByRole("button", { name: "Saving meal…" });
      expect(busy).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByRole("button", { name: "Save and log" })).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(busy);
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("leaves its label at rest while Save's submit runs", () => {
      render(<Saving onSubmit={jest.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Save and log" }));
      expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save meal" })).toHaveAttribute("aria-disabled", "true");
    });
  });
});
