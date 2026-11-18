import { stubPhone } from "@/__tests__/formSheet";
import { FormSheet, type FormFailure, type FormSheetProps } from "@/components/ui/FormSheet";
import { lineRoom } from "@/components/ui/styles";
import { AuthRequestError } from "@/lib/errors";
import { OfflineError } from "@/lib/failure";
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
    renderSheet({ description: "What this does.", formError: { line: "That did not work.", cause: null } });
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

  // On a phone the sheet holds its height, so the footer keeps no room for a
  // refusal that is not there: an empty line has no height and no gap, and a
  // refusal that appears takes 8 px above the buttons, growing the footer
  // upward. From md the dialog is anchored at its top and grows downward, so
  // the footer keeps two lines of room there and a refusal moves nothing.
  // The classes are split into whole tokens: `md:min-h-10` must not pass for
  // an unprefixed room, nor `max-md:empty:mb-0` for `empty:mb-0`. The
  // geometry is measured in a browser.
  describe("the footer's room for a refusal", () => {
    function lineClasses(): string[] {
      renderSheet({ formError: null });
      const line = screen.getByRole("dialog").querySelector("[data-sheet-footer] [data-form-error]")!;
      return line.className.split(" ");
    }

    it("on a phone, keeps none while there is no refusal", () => {
      const classes = lineClasses();
      // No unprefixed or phone-width height: below md the line is as tall as what it says.
      expect(classes.filter((c) => /^(max-md:)?(min-h|h)-/.test(c))).toEqual([]);
      // Its gap above the buttons goes too while it is empty, below md only.
      expect(classes).toEqual(expect.arrayContaining(["mb-2", "max-md:empty:mb-0"]));
      expect(classes).not.toContain("empty:mb-0");
    });

    it("from md, keeps two lines and the gap above the buttons while there is no refusal", () => {
      const classes = lineClasses();
      expect(classes).toContain("md:min-h-10");
      // Nothing takes the gap away from md: the room stays the same with or without a refusal.
      expect(classes.filter((c) => /^(md:)?empty:/.test(c))).toEqual([]);
      const css = fs.readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
      expect(css).not.toContain("footer-error-room");
    });
  });

  it("lets a last field's reserved line be the room above the footer, and keeps the body's padding under anything else", () => {
    renderSheet();
    const form = screen.getByRole("dialog").querySelector("form")!;
    expect(form.className.split(/\s+/)).toContain("form-ends-in-line");
    // jsdom lays nothing out: the rule takes 12 of the body's 16 px back. Which
    // sheets its selectors match is checked on each sheet, in its own contract
    // (`endsInLine` in describeFormSheetContract).
    const css = fs.readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
    const rule = css.slice(css.indexOf("@utility form-ends-in-line"));
    const block = rule.slice(0, rule.indexOf("\n}\n"));
    expect(block).toContain("margin-bottom: -0.75rem;");
    // The hook the rule reads comes with every reserved line.
    expect(lineRoom.split(" ")).toEqual(["min-h-5", "field-line"]);
  });

  it("gives a yielding footer row's room to the keyboard, and keeps every other row", () => {
    renderSheet({ footerStart: { label: "Remove", onPress: jest.fn(), yieldsToKeyboard: true } });
    const remove = within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" });
    const row = remove.closest("[data-footer-start]")!.parentElement!;
    expect(row.className.split(" ")).toContain("keyboard-yields");
    // jsdom computes no clamp(): the rule collapses the row to nothing, padding
    // and margins included, at any inset above 0. With no keyboard its padding
    // is the 10 px the text button's target reaches past its words, and 4 px
    // for the focus ring, taken back by its margins.
    const css = fs.readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
    const rule = css.slice(css.indexOf("@utility keyboard-yields"));
    // Compared without whitespace, so the formatter's line breaks do not matter.
    const block = rule.slice(0, rule.indexOf("\n}\n")).replace(/\s+/g, "");
    const has = (text: string) => expect(block).toContain(text.replace(/\s+/g, ""));
    expect(css).toMatch(/:root \{[^}]*--footer-start-reach: 0\.625rem;/);
    has("--footer-ring-reach: calc(var(--footer-start-reach) + 0.25rem)");
    has("max-height: clamp(0px, calc(10rem - var(--drawer-keyboard-inset, 0px) * 1000), 10rem)");
    has(
      "padding-block: clamp(0px, calc(var(--footer-ring-reach) - var(--drawer-keyboard-inset, 0px) * 1000), var(--footer-ring-reach))",
    );
    for (const side of ["margin-top", "margin-bottom"])
      has(
        `${side}: clamp(calc(var(--footer-ring-reach) * -1), calc(var(--footer-ring-reach) * -1 + var(--drawer-keyboard-inset, 0px) * 1000), 0px)`,
      );
  });

  it("keeps a second submit in sight while typing: it does not yield to the keyboard", () => {
    renderSheet({ footerStart: { label: "Save only", submit: "only", busy: "Saving…", tone: "neutral" } });
    const button = within(screen.getByRole("dialog")).getByRole("button", { name: "Save only" });
    expect(button.closest(".keyboard-yields")).toBeNull();
  });

  describe("a failure while offline", () => {
    const setOnline = (value: boolean) => Object.defineProperty(navigator, "onLine", { value, configurable: true });
    afterEach(() => setOnline(true));

    const noAnswer = new TypeError("Failed to fetch");
    const refused = new AuthRequestError(409, "email_taken");
    const failure = (line: string, cause: unknown): FormFailure => ({ line, cause });

    function Failing({ error }: { error: FormFailure | null }) {
      return (
        <FormSheet
          open
          onClose={jest.fn()}
          title="Name it"
          returnFocusTo={null}
          dirty={false}
          submitting={false}
          onSubmit={jest.fn()}
          formError={error}
          idle="Save"
          busy="Saving…"
        >
          {() => <input aria-label="Name" />}
        </FormSheet>
      );
    }

    it("says the device is offline for a write that got no answer, whatever line the sheet passed", () => {
      setOnline(false);
      const view = render(<Failing error={null} />);
      view.rerender(<Failing error={failure("Something went wrong. Try again.", noAnswer)} />);
      expect(screen.getByRole("alert")).toHaveTextContent("You are offline. Changes need a connection.");
    });

    it("says the device is offline for a write that was not sent", () => {
      setOnline(false);
      const view = render(<Failing error={null} />);
      view.rerender(<Failing error={failure("Not sent.", new OfflineError())} />);
      expect(screen.getByRole("alert")).toHaveTextContent("You are offline. Changes need a connection.");
    });

    it("shows a refusal the server answered as itself, also while the app thinks it is offline", () => {
      setOnline(false);
      const view = render(<Failing error={null} />);
      view.rerender(<Failing error={failure("That address is taken.", refused)} />);
      expect(screen.getByRole("alert")).toHaveTextContent("That address is taken.");
    });

    it("keeps that line when the connection returns, and shows the sheet's own line for a failure while online", () => {
      setOnline(false);
      const view = render(<Failing error={null} />);
      view.rerender(<Failing error={failure("Something went wrong. Try again.", noAnswer)} />);
      act(() => {
        setOnline(true);
        window.dispatchEvent(new Event("online"));
      });
      expect(screen.getByRole("alert")).toHaveTextContent("You are offline. Changes need a connection.");
      view.rerender(<Failing error={null} />);
      view.rerender(<Failing error={failure("That did not work.", noAnswer)} />);
      expect(screen.getByRole("alert")).toHaveTextContent("That did not work.");
    });
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

  it("puts a secondary action in a row of its own above Cancel and Save on a phone, at the start of their row from md", () => {
    renderSheet({ footerStart: { label: "Delete entry", onPress: jest.fn() } });
    const footer = screen.getByRole("dialog").querySelector<HTMLElement>("[data-sheet-footer]")!;
    const names = within(footer)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(["Delete entry", "Cancel", "SaveSaving…"]);
    const slot = footer.querySelector("[data-footer-start]")!;
    // A row of its own below md. From md it starts the row, and Cancel and Save
    // end it as one group, which wraps under it when the three do not fit.
    expect(slot.className.split(" ")).toEqual(expect.arrayContaining(["col-span-2", "md:mr-auto"]));
    expect(slot.className.split(" ")).not.toContain("md:basis-full");
    expect(slot.parentElement!.className.split(" ")).toContain("md:flex-wrap");
    const pair = within(footer).getByRole("button", { name: "Cancel" }).parentElement!;
    expect(pair.className.split(" ")).toEqual(expect.arrayContaining(["contents", "md:flex", "md:ml-auto"]));
    expect(pair).toContainElement(within(footer).getByRole("button", { name: /^Save/ }));
    // No group around it for a screen reader to announce without a name.
    expect(within(footer).queryByRole("group")).toBeNull();
  });

  it("sets the secondary action's words 16 px under the footer's rule and 12 px over the buttons on a phone, with its 44 px target kept", () => {
    renderSheet({ footerStart: { label: "Delete entry", onPress: jest.fn() } });
    const footer = screen.getByRole("dialog").querySelector<HTMLElement>("[data-sheet-footer]")!;
    const button = within(footer).getByRole("button", { name: "Delete entry" });
    const tokens = button.className.split(/\s+/);
    // The target stays 44 px tall at every width ...
    expect(tokens).toContain("min-h-11");
    // ... and below md reaches 10 px above the words into the footer's padding,
    // and keeps 2 px of its own under its target: words 12 px over the buttons.
    // The reach is the one value the yielding row keeps clear of its clip
    // (`keyboard-yields`), so the two cannot drift.
    expect(tokens).toEqual(expect.arrayContaining(["max-md:-mt-(--footer-start-reach)", "max-md:mb-0.5"]));
    expect(tokens.filter((c) => /^-?m[tby]-/.test(c))).toEqual([]);
    // No row gap in the phone's grid, which would stay when the row gives way
    // to the keyboard: the room under the row is the button's own. The two
    // buttons stand 8 px apart.
    const grid = button.closest("[data-footer-start]")!.parentElement!;
    const gridTokens = grid.className.split(/\s+/);
    expect(gridTokens).toContain("gap-x-2");
    expect(gridTokens.filter((c) => /^gap-(y-)?[0-9]/.test(c))).toEqual([]);
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
          formError={submitting ? null : { line: "That did not work.", cause: null }}
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
