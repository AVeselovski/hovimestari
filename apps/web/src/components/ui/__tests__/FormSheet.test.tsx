import { stubPhone } from "@/__tests__/formSheet";
import { FormSheet, type FormSheetProps } from "@/components/ui/FormSheet";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

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

  it("shows the description above the form and the refusal under it", () => {
    renderSheet({ description: "What this does.", formError: "That did not work." });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleDescription("What this does.");
    expect(screen.getByRole("alert")).toHaveTextContent("That did not work.");
    const form = dialog.querySelector("form")!;
    expect(form).toContainElement(screen.getByRole("alert"));
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
    renderSheet({ footerStart: <button type="button">Delete entry</button> });
    const footer = screen.getByRole("dialog").querySelector<HTMLElement>("[data-sheet-footer]")!;
    const names = within(footer)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(["Delete entry", "Cancel", "SaveSaving…"]);
    const slot = footer.querySelector("[data-footer-start]")!;
    // A row of its own: the full width below md, and the whole flex line from md.
    expect(slot.className.split(" ")).toEqual(expect.arrayContaining(["col-span-2", "md:basis-full"]));
    expect(slot.parentElement!.className.split(" ")).toContain("md:flex-wrap");
  });
});
