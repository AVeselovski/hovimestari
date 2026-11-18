import { describeFormSheetContract } from "@/__tests__/formSheet";
import { confirmArmed, holdSheetExits } from "@/__tests__/sheet";
import { sectionStart } from "@/components/ui/styles";
import { deleteTargets, getTargets, putTargets } from "@/lib/api/targets";
import { formatDay } from "@/lib/localDate";
import { formatTarget } from "@/lib/targetFormat";
import type { TargetChange } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TargetsSheet, type TargetsSheetProps } from "../TargetsSheet";
import { TODAY, change, overview, refusal } from "./support";

jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));

let changes: TargetChange[] = [];
beforeEach(() => {
  changes = [change("2026-11-01", [1800, 2200], [120, 160])];
  jest
    .mocked(getTargets)
    .mockReset()
    .mockImplementation((date) => Promise.resolve(overview(changes, date)));
  jest.mocked(putTargets).mockReset().mockResolvedValue(change(TODAY));
  jest.mocked(deleteTargets).mockReset().mockResolvedValue(undefined);
});

const dialog = () => screen.getByRole("dialog");
const group = (name: "Calories" | "Protein") => within(dialog()).getByRole("group", { name });
const field = (g: "Calories" | "Protein", bound: "From" | "To") =>
  within(group(g)).getByLabelText(bound) as HTMLInputElement;
const type = (g: "Calories" | "Protein", bound: "From" | "To", value: string) =>
  fireEvent.change(field(g, bound), { target: { value } });
const dateField = () => within(dialog()).getByLabelText("Starts on") as HTMLInputElement;
function fillAll(): void {
  type("Calories", "From", "1700");
  type("Calories", "To", "2100");
  type("Protein", "From", "110");
  type("Protein", "To", "150");
}

function renderSheet(props: Partial<TargetsSheetProps> = {}) {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  render(
    <TargetsSheet
      open
      returnFocusTo={null}
      onClose={onClose}
      onSaved={onSaved}
      today={TODAY}
      changes={changes}
      {...props}
    />,
  );
  return { onClose, onSaved };
}

describe("TargetsSheet", () => {
  describeFormSheetContract({
    endsInLine: false,
    name: /change targets/i,
    renderSheet: (p) => <TargetsSheet {...p} today={TODAY} changes={changes} />,
    type: () => type("Calories", "From", "1900"),
    typedField: () => field("Calories", "From"),
    fillValid: fillAll,
    holdSave: () => {
      let resolve: () => void = () => {};
      let reject: () => void = () => {};
      jest.mocked(putTargets).mockReturnValue(
        new Promise((res, rej) => {
          resolve = () => res(change(TODAY));
          reject = () => rej(refusal(500, "internal_error"));
        }),
      );
      return { resolve, reject };
    },
    firstField: () => dateField(),
    panelClass: "md:max-w-md",
  });

  /** The four fields' values, Calories From and To, then Protein From and To. */
  const values = () =>
    [field("Calories", "From"), field("Calories", "To"), field("Protein", "From"), field("Protein", "To")].map(
      (f) => f.value,
    );
  /** The date's own line, for its error. */
  const dateLine = () => document.getElementById(`${dateField().id}-line`)!;

  describe("new targets, from Change targets", () => {
    it("opens empty, with no placeholder, while the user has targets in force", () => {
      changes = [change("2026-10-01", [1500, 1700], [90, 100]), change("2026-11-01", [1800, 2200], [120, 160])];
      renderSheet();
      expect(values()).toEqual(["", "", "", ""]);
      expect(dialog().querySelectorAll("[placeholder]")).toHaveLength(0);
    });

    it("stays empty on another date, and reads no targets for it from the server", () => {
      changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-12-10" } });
      expect(values()).toEqual(["", "", "", ""]);
      fireEvent.change(dateField(), { target: { value: "2026-10-15" } });
      expect(values()).toEqual(["", "", "", ""]);
      expect(getTargets).not.toHaveBeenCalled();
    });

    it("stays empty on a date that has a change of its own", () => {
      changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-12-01" } });
      expect(values()).toEqual(["", "", "", ""]);
    });

    it("stays empty on today when today has its own change, as on the first day", () => {
      changes = [change(TODAY)];
      renderSheet();
      expect(values()).toEqual(["", "", "", ""]);
    });

    // Across states: the title is one node with one text whatever date is picked.
    it("keeps its title, one line with no room for a second, as the date moves onto a change and off it", () => {
      changes = [change("2026-11-01"), change("2026-12-01")];
      renderSheet();
      const title = within(dialog()).getByRole("heading", { name: "Change targets" });
      expect(title.className.split(/\s+/).filter((c) => /min-h/.test(c))).toEqual([]);
      for (const day of ["2026-12-01", "2026-12-10", "2026-11-01", TODAY]) {
        fireEvent.change(dateField(), { target: { value: day } });
        expect(within(dialog()).getByRole("heading", { name: "Change targets" })).toBe(title);
        expect(dialog()).toHaveAccessibleName("Change targets");
      }
      // No subtitle and no description: nothing in the header under the title.
      expect(dialog()).not.toHaveAttribute("aria-describedby");
      expect(dialog().querySelector("[data-sheet-header-note]")).toBeNull();
    });

    it("keeps what was typed when the date changes", () => {
      changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
      renderSheet();
      type("Protein", "To", "175");
      fireEvent.change(dateField(), { target: { value: "2026-12-01" } });
      expect(values()).toEqual(["", "", "", "175"]);
    });

    it("shows each field's required error on Save when left empty, and sends nothing", async () => {
      const { onClose } = renderSheet();
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
      // One line under each pair, as for every error a pair can have.
      expect(await within(group("Calories")).findByText("Enter a number.")).toBeInTheDocument();
      expect(within(group("Protein")).getByText("Enter a number.")).toBeInTheDocument();
      expect(field("Calories", "From")).toHaveFocus();
      expect(putTargets).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("a change opened from the list", () => {
    const edit = () => renderSheet({ editing: "2026-12-01" });
    beforeEach(() => {
      changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
    });

    it("opens with that change's own targets, and no placeholder", () => {
      edit();
      expect(values()).toEqual(["2000", "2400", "130", "170"]);
      expect(dialog().querySelectorAll("[placeholder]")).toHaveLength(0);
    });

    it("holds a decimal as Settings shows it, in the form the field reads back", () => {
      changes = [change("2026-11-01"), change("2026-12-01", [1800, 2200.5], [142.5, 160])];
      edit();
      expect(values()).toEqual([formatTarget(1800), formatTarget(2200.5), formatTarget(142.5), formatTarget(160)]);
    });

    it("untouched, closes on Escape with no confirmation", () => {
      const { onClose } = edit();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("untouched, saves nothing on Save, and closes", async () => {
      const { onClose, onSaved } = edit();
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(putTargets).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it("saves one changed field with the three it was opened with", async () => {
      changes = [change("2026-11-01"), change("2026-12-01", [1800, 2200.5], [142.5, 160])];
      const { onClose } = edit();
      type("Protein", "To", "170");
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(putTargets).toHaveBeenCalledWith("2026-12-01", {
          ranges: { energyKcal: { lower: 1800, upper: 2200.5 }, proteinG: { lower: 142.5, upper: 170 } },
        }),
      );
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it("refuses a typed bound against an opened one under its pair, and sends nothing", async () => {
      edit();
      type("Protein", "To", "100");
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
      expect(await within(group("Protein")).findByText("To cannot be lower than From.")).toBeInTheDocument();
      expect(field("Protein", "To")).toHaveFocus();
      expect(putTargets).not.toHaveBeenCalled();
    });

    // Across states: the list can come back while the sheet is open (a save on
    // another device, a refetch on focus). What the user opened stays put.
    it("keeps its fields, and stays clean, when a new list of changes arrives while it is open", () => {
      const props = {
        returnFocusTo: null,
        onClose: jest.fn(),
        onSaved: jest.fn(),
        today: TODAY,
        editing: "2026-12-01",
      };
      const { rerender } = render(<TargetsSheet open changes={changes} {...props} />);
      const before = values();
      expect(before).toEqual(["2000", "2400", "130", "170"]);
      const refetched = [change("2026-11-01"), change("2026-12-01", [2100, 2500], [135, 175])];
      rerender(<TargetsSheet open changes={refetched} {...props} />);
      expect(values()).toEqual(before);
      // Still untouched: Escape closes without asking.
      fireEvent.keyDown(document, { key: "Escape" });
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });
  });

  // The fields' own values are covered above. This checks the text: no line, such as the old in-force line, repeats the user's targets.
  it("repeats none of the user's targets in a line of text, and keeps one line under the date for its error", () => {
    renderSheet();
    type("Calories", "From", "1900");
    expect(dialog()).not.toHaveTextContent(/In force/);
    const text = dialog().textContent ?? "";
    for (const n of ["1800", "2200", "120", "160"]) expect(text).not.toContain(n);
    expect(dateLine().className.split(/\s+/)).toContain("min-h-5");
    expect(dateLine().className.split(/\s+/)).not.toContain("min-h-10");
  });

  it("starts on the server's today, as a native date field", () => {
    renderSheet();
    expect(dateField()).toHaveAttribute("type", "date");
    expect(dateField()).toHaveValue(TODAY);
  });

  it("saves on the picked date and closes", async () => {
    const { onSaved, onClose } = renderSheet();
    fireEvent.change(dateField(), { target: { value: "2026-12-24" } });
    fillAll();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(putTargets).toHaveBeenCalledWith("2026-12-24", {
        ranges: { energyKcal: { lower: 1700, upper: 2100 }, proteinG: { lower: 110, upper: 150 } },
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
  });

  it("refuses an empty date in its own line and sends nothing", async () => {
    renderSheet();
    fireEvent.change(dateField(), { target: { value: "" } });
    fillAll();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    expect(await within(dialog()).findByText("Enter a valid date.")).toBeInTheDocument();
    expect(dateField()).toHaveFocus();
    expect(putTargets).not.toHaveBeenCalled();
  });

  it("shows the code's copy under a pair: lower above upper, and zero", async () => {
    renderSheet();
    fillAll();
    type("Protein", "To", "100");
    type("Calories", "From", "0");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    expect(await within(group("Protein")).findByText("To cannot be lower than From.")).toBeInTheDocument();
    expect(within(group("Calories")).getByText("Enter a number above zero.")).toBeInTheDocument();
    expect(putTargets).not.toHaveBeenCalled();
  });

  describe("opened on a change", () => {
    beforeEach(() => {
      changes = [change("2026-11-01"), change("2026-12-01")];
    });

    it("is Edit targets, described by its date in the header, and its body starts with the fields", () => {
      renderSheet({ editing: "2026-12-01" });
      const sheet = screen.getByRole("dialog", { name: "Edit targets" });
      expect(sheet).toHaveAccessibleDescription("Starting on December 1, 2026");
      const subtitle = within(sheet).getByText("Starting on December 1, 2026");
      // In the fixed header under the title, not in the body that scrolls.
      expect(subtitle.closest("[data-sheet-header]")).toContainElement(within(sheet).getByRole("heading"));
      expect(subtitle.closest("[data-sheet-body]")).toBeNull();
      expect(subtitle.className.split(/\s+/)).toEqual(expect.arrayContaining(["text-base", "text-ink-muted"]));
      // No date field, no "Starts on" label, and no date in the body above the fields.
      expect(within(sheet).queryByLabelText("Starts on")).toBeNull();
      expect(sheet).not.toHaveTextContent(/Starts on/);
      const body = sheet.querySelector<HTMLElement>("[data-sheet-body]")!;
      const form = body.querySelector("form")!;
      expect(form.firstElementChild).toContainElement(group("Calories"));
      const classes = form.firstElementChild?.className.split(/\s+/) ?? [];
      for (const c of sectionStart.split(/\s+/)) expect(classes).not.toContain(c);
    });

    it("keeps no room for a second title line", () => {
      renderSheet({ editing: "2026-12-01" });
      const title = within(dialog()).getByRole("heading", { name: "Edit targets" });
      expect(title.className.split(/\s+/).filter((c) => /min-h/.test(c))).toEqual([]);
    });

    it("says nothing of replacing, though its date has a change", () => {
      renderSheet({ editing: "2026-12-01" });
      expect(dialog()).not.toHaveTextContent(/already has targets|replaces/);
    });
  });

  it("offers Remove on the only change, and its confirmation says its days will have no targets", async () => {
    const { onClose } = renderSheet({ editing: "2026-11-01" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Remove these targets" }));
    const confirm = await screen.findByRole("dialog", { name: `Remove the targets from ${formatDay("2026-11-01")}?` });
    expect(confirm).toHaveTextContent(`Days from ${formatDay("2026-11-01")} on will have no targets.`);
    expect(confirm).not.toHaveTextContent(/measured against|at least one/);
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(deleteTargets).toHaveBeenCalledWith("2026-11-01"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  describe("the title for new targets", () => {
    it("reads Set targets when the user has no change", () => {
      changes = [];
      renderSheet();
      expect(screen.getByRole("dialog", { name: "Set targets" })).toBeInTheDocument();
    });

    it("reads Change targets when the user has a change", () => {
      renderSheet();
      expect(screen.getByRole("dialog", { name: "Change targets" })).toBeInTheDocument();
    });

    describe("while it slides out after the first save", () => {
      let restore: () => void;
      beforeEach(() => {
        restore = holdSheetExits();
      });
      afterEach(() => restore());

      it("keeps Set targets while the refetch with the new change lands", async () => {
        const props = { returnFocusTo: null, onClose: jest.fn(), onSaved: jest.fn(), today: TODAY };
        const { rerender } = render(<TargetsSheet open changes={[]} {...props} />);
        expect(screen.getByRole("dialog", { name: "Set targets" })).toBeInTheDocument();
        rerender(<TargetsSheet open={false} changes={[]} {...props} />);
        rerender(<TargetsSheet open={false} changes={[change(TODAY)]} {...props} />);
        await act(async () => {});
        expect(screen.getByRole("dialog", { hidden: true })).toHaveAccessibleName("Set targets");
      });
    });
  });

  it("offers no Remove for a new change, even with several", () => {
    changes = [change("2026-11-01"), change("2026-12-01")];
    renderSheet();
    expect(within(dialog()).queryByRole("button", { name: "Remove these targets" })).toBeNull();
  });

  it("removes a change after a confirmation that names the days that move", async () => {
    changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
    const { onClose } = renderSheet({ editing: "2026-11-01" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Remove these targets" }));
    const confirm = await screen.findByRole("dialog", { name: `Remove the targets from ${formatDay("2026-11-01")}?` });
    expect(confirm).toHaveTextContent(
      `Days from ${formatDay("2026-11-01")} to ${formatDay("2026-11-30")} are then measured against your earlier targets.`,
    );
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(deleteTargets).toHaveBeenCalledWith("2026-11-01"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  describe("while it slides out after a removal", () => {
    let restore: () => void;
    beforeEach(() => {
      restore = holdSheetExits();
    });
    afterEach(() => restore());

    it("keeps its title and lines while the refetch without the removed change lands", async () => {
      changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
      const props = {
        returnFocusTo: null,
        onClose: jest.fn(),
        onSaved: jest.fn(),
        today: TODAY,
        editing: "2026-12-01",
      };
      const { rerender } = render(<TargetsSheet open changes={changes} {...props} />);
      const title = "Edit targets";
      const description = `Starting on ${formatDay("2026-12-01")}`;
      expect(screen.getByRole("dialog", { name: title, description })).toBeInTheDocument();
      const span = dialog().querySelector("[data-span]")?.textContent;
      const fields = values();

      // The removal closes the sheet, and then the list comes back without the change.
      rerender(<TargetsSheet open={false} changes={changes} {...props} />);
      changes = [change("2026-11-01")];
      rerender(<TargetsSheet open={false} changes={changes} {...props} />);
      await act(async () => {});

      const closing = screen.getByRole("dialog", { hidden: true });
      expect(closing).toHaveAccessibleName(title);
      expect(closing).toHaveAccessibleDescription(description);
      expect(closing.querySelector("[data-span]")?.textContent).toBe(span);
      // The fields keep the numbers they showed, though the change they came from is gone.
      expect(
        within(closing)
          .getAllByRole("textbox", { hidden: true })
          .map((f) => (f as HTMLInputElement).value),
      ).toEqual(fields);
      expect(within(closing).getByRole("button", { name: "Remove these targets", hidden: true })).toBeInTheDocument();
    });
  });

  it("removing a change that covers one day names that day", async () => {
    changes = [change("2026-11-01"), change("2026-11-15"), change("2026-11-16")];
    renderSheet({ editing: "2026-11-15" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Remove these targets" }));
    const confirm = await screen.findByRole("dialog", { name: `Remove the targets from ${formatDay("2026-11-15")}?` });
    expect(confirm).toHaveTextContent(`${formatDay("2026-11-15")} is then measured against your earlier targets.`);
    expect(confirm).not.toHaveTextContent(/Days from/);
  });

  it("removing the first change says its days will have no targets, never that the next change takes them", async () => {
    changes = [change("2026-11-01"), change("2026-12-01")];
    renderSheet({ editing: "2026-11-01" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Remove these targets" }));
    const confirm = await screen.findByRole("dialog", { name: `Remove the targets from ${formatDay("2026-11-01")}?` });
    expect(confirm).toHaveTextContent(
      `Days from ${formatDay("2026-11-01")} to ${formatDay("2026-11-30")} will have no targets.`,
    );
    expect(confirm).not.toHaveTextContent(/measured against|against the targets/);
  });

  it("removing a first change that covers one day says that day will have no targets", async () => {
    changes = [change("2026-11-15"), change("2026-11-16")];
    renderSheet({ editing: "2026-11-15" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Remove these targets" }));
    const confirm = await screen.findByRole("dialog", { name: `Remove the targets from ${formatDay("2026-11-15")}?` });
    expect(confirm).toHaveTextContent(`${formatDay("2026-11-15")} will have no targets.`);
  });

  it("keeps the confirmation open with the reason when the removal fails", async () => {
    jest.mocked(deleteTargets).mockRejectedValue(refusal(503, "server_unreachable"));
    const { onClose } = renderSheet({ editing: "2026-11-01" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Remove these targets" }));
    const confirm = await screen.findByRole("dialog", { name: /Remove the targets/ });
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "Hovimestari cannot be reached right now. Try again in a moment.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
