import { describeFormSheetContract } from "@/__tests__/formSheet";
import { confirmArmed, holdSheetExits } from "@/__tests__/sheet";
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
  const inForceSlot = () => document.getElementById(`${dateField().id}-line`)!;

  describe("what the fields open with", () => {
    it("opens with the targets in force on today, the ones a save changes, and no placeholder", () => {
      changes = [change("2026-10-01", [1500, 1700], [90, 100]), change("2026-11-01", [1800, 2200], [120, 160])];
      renderSheet();
      expect(values()).toEqual(["1800", "2200", "120", "160"]);
      expect(dialog().querySelectorAll("[placeholder]")).toHaveLength(0);
    });

    it("holds a decimal as Settings shows it, in the form the field reads back", () => {
      changes = [change("2026-11-01", [1800, 2200.5], [142.5, 160])];
      renderSheet();
      expect(values()).toEqual([formatTarget(1800), formatTarget(2200.5), formatTarget(142.5), formatTarget(160)]);
    });

    it("opened on a change from the list, holds that change's own targets", () => {
      changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
      renderSheet({ editing: "2026-12-01" });
      expect(values()).toEqual(["2000", "2400", "130", "170"]);
    });

    it("opens empty when no targets are in force on its date", () => {
      changes = [];
      renderSheet();
      expect(values()).toEqual(["", "", "", ""]);
    });

    it("refills the fields not typed in from the targets in force on a picked date, and keeps what was typed", () => {
      changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
      renderSheet();
      type("Protein", "To", "175");
      fireEvent.change(dateField(), { target: { value: "2026-12-10" } });
      expect(values()).toEqual(["2000", "2400", "130", "175"]);
      // Back again: the untouched fields follow, the typed one stays.
      fireEvent.change(dateField(), { target: { value: "2026-10-15" } });
      expect(values()).toEqual(["1800", "2200", "120", "175"]);
    });

    it("leaves the fields as they are while the date is being retyped", () => {
      changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "" } });
      expect(values()).toEqual(["1800", "2200", "120", "160"]);
      fireEvent.change(dateField(), { target: { value: "2026-12-02" } });
      expect(values()).toEqual(["2000", "2400", "130", "170"]);
    });

    it("keeps a field the user emptied empty when the date changes", () => {
      changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
      renderSheet();
      type("Calories", "From", "");
      fireEvent.change(dateField(), { target: { value: "2026-12-10" } });
      expect(values()).toEqual(["", "2400", "130", "170"]);
    });
  });

  it("repeats the targets in force nowhere but in the fields, and keeps one line under the date for its error", () => {
    renderSheet();
    type("Calories", "From", "1900");
    expect(dialog()).not.toHaveTextContent(/In force/);
    const text = dialog().textContent ?? "";
    for (const n of ["1800", "2200", "120", "160"]) expect(text).not.toContain(n);
    expect(inForceSlot().className.split(/\s+/)).toContain("min-h-5");
    expect(inForceSlot().className.split(/\s+/)).not.toContain("min-h-10");
  });

  it("reads no targets for its date from the server: the list it was given decides what the fields hold", () => {
    changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
    renderSheet();
    fireEvent.change(dateField(), { target: { value: "2026-12-10" } });
    expect(values()).toEqual(["2000", "2400", "130", "170"]);
    expect(getTargets).not.toHaveBeenCalled();
  });

  describe("an untouched sheet", () => {
    it("closes on Escape with no confirmation, its prefilled numbers being no change", () => {
      const { onClose } = renderSheet();
      expect(values()).toEqual(["1800", "2200", "120", "160"]);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("saves nothing on Save, and closes", async () => {
      const { onClose, onSaved } = renderSheet();
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(putTargets).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it("on another date, saves the targets the fields followed to, on that date", async () => {
      changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-12-24" } });
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(putTargets).toHaveBeenCalledWith("2026-12-24", {
          ranges: { energyKcal: { lower: 2000, upper: 2400 }, proteinG: { lower: 130, upper: 170 } },
        }),
      );
    });
  });

  it("saves one typed field with the three it was opened with", async () => {
    changes = [change("2026-11-01", [1800, 2200.5], [142.5, 160])];
    const { onClose } = renderSheet();
    type("Protein", "To", "170");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(putTargets).toHaveBeenCalledWith(TODAY, {
        ranges: { energyKcal: { lower: 1800, upper: 2200.5 }, proteinG: { lower: 142.5, upper: 170 } },
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("refuses a typed bound against a prefilled one under its pair, and sends nothing", async () => {
    renderSheet();
    type("Protein", "To", "100");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    expect(await within(group("Protein")).findByText("To cannot be lower than From.")).toBeInTheDocument();
    expect(field("Protein", "To")).toHaveFocus();
    expect(putTargets).not.toHaveBeenCalled();
  });

  it("starts on the server's today, as a native date field", () => {
    renderSheet();
    expect(dateField()).toHaveAttribute("type", "date");
    expect(dateField()).toHaveValue(TODAY);
  });

  it("switches the title to that change when the picked date has one, and fills its targets", () => {
    changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Change targets" })).toBeInTheDocument();
    fireEvent.change(dateField(), { target: { value: "2026-12-01" } });
    expect(screen.getByRole("dialog", { name: `Targets from ${formatDay("2026-12-01")}` })).toBeInTheDocument();
    // The change's own numbers, in the fields it fills.
    expect(values()).toEqual(["2000", "2400", "130", "170"]);
  });

  describe("the line naming the days the numbers apply to", () => {
    const span = () => dialog().querySelector<HTMLElement>("[data-span]")!;

    // Below every field, it is as tall as what it says: a date picked above it moves only what is below it.
    it("is one announced element through every date, and keeps no room", () => {
      changes = [change("2026-11-01")];
      renderSheet();
      const line = span();
      expect(line).toHaveAttribute("aria-live", "polite");
      expect(line.className.split(/\s+/).filter((c) => /min-h/.test(c))).toEqual([]);
      // A section of its own, 16 px under the fields, that takes no gap while empty.
      expect(line.className.split(/\s+/)).toEqual(expect.arrayContaining(["mt-2", "empty:-mt-2"]));
      fireEvent.change(dateField(), { target: { value: "2026-11-20" } });
      expect(span()).toBe(line);
      expect(line).toHaveTextContent(`These apply from ${formatDay("2026-11-20")} on.`);
      // Empty only while the date is not a date.
      fireEvent.change(dateField(), { target: { value: "" } });
      expect(span()).toBe(line);
      expect(line).toBeEmptyDOMElement();
      fireEvent.change(dateField(), { target: { value: "2026-10-01" } });
      expect(span()).toBe(line);
      expect(line).not.toBeEmptyDOMElement();
    });

    it("from a date with no later change: from that date on, and earlier days keep theirs", () => {
      renderSheet();
      expect(span()).toHaveTextContent(`These apply from ${formatDay(TODAY)} on. Earlier days keep their targets.`);
    });

    it("for a later date with no change on it, too", () => {
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-12-24" } });
      expect(span()).toHaveTextContent(
        `These apply from ${formatDay("2026-12-24")} on. Earlier days keep their targets.`,
      );
    });

    it("between two changes: to the day before the next, and other days keep theirs", () => {
      changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-10-20" } });
      expect(span()).toHaveTextContent(
        `These apply from ${formatDay("2026-10-20")} to ${formatDay("2026-10-31")}. Other days keep their targets.`,
      );
    });

    it("names the one day, not a stretch from a day to itself, when the next change starts the day after", () => {
      changes = [change("2026-11-01"), change("2026-11-16")];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-11-15" } });
      expect(span()).toHaveTextContent(
        `These apply to ${formatDay("2026-11-15")} only. Other days keep their targets.`,
      );
    });

    it("for an edit of a change, ends the day before the next change", () => {
      changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
      renderSheet({ editing: "2026-11-01" });
      expect(span()).toHaveTextContent(
        `These apply from ${formatDay("2026-11-01")} to ${formatDay("2026-11-30")}. Other days keep their targets.`,
      );
    });

    it("before the earliest change: every day before the next, later days keep theirs, and nothing said of earlier days", () => {
      changes = [change("2026-11-01"), change("2026-12-01")];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-10-15" } });
      expect(span()).toHaveTextContent(
        `These apply to every day before ${formatDay("2026-11-01")}. Later days keep their targets.`,
      );
      expect(span()).not.toHaveTextContent(/Earlier days|Other days/);
    });

    it("for an edit of the first change, every day before the next", () => {
      changes = [change("2026-11-01"), change("2026-12-01")];
      renderSheet({ editing: "2026-11-01" });
      expect(span()).toHaveTextContent(
        `These apply to every day before ${formatDay("2026-12-01")}. Later days keep their targets.`,
      );
    });

    it("with no other change: these are the only targets, and no other days are said to keep any", () => {
      renderSheet({ editing: "2026-11-01" });
      expect(span()).toHaveTextContent("These are your only targets, so they apply to every day.");
      expect(span()).not.toHaveTextContent(/keep their targets/);
    });
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

  it("opened on a change, shows its date as text, not a field", () => {
    changes = [change("2026-11-01"), change("2026-12-01")];
    renderSheet({ editing: "2026-12-01" });
    expect(within(dialog()).queryByLabelText("Starts on")).toBeNull();
    expect(within(dialog()).getByText(formatDay("2026-12-01"))).toBeInTheDocument();
  });

  it("offers no Remove with one change, nor for a new change", () => {
    renderSheet({ editing: "2026-11-01" });
    expect(within(dialog()).queryByRole("button", { name: "Remove these targets" })).toBeNull();
    screen.getByRole("dialog");
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
      const title = `Targets from ${formatDay("2026-12-01")}`;
      expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
      const span = dialog().querySelector("[data-span]")?.textContent;
      const fields = values();

      // The removal closes the sheet, and then the list comes back without the change.
      rerender(<TargetsSheet open={false} changes={changes} {...props} />);
      changes = [change("2026-11-01")];
      rerender(<TargetsSheet open={false} changes={changes} {...props} />);
      await act(async () => {});

      const closing = screen.getByRole("dialog", { hidden: true });
      expect(closing).toHaveAccessibleName(title);
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

  it("removing the first change says its days go to the next change", async () => {
    changes = [change("2026-11-01"), change("2026-12-01")];
    renderSheet({ editing: "2026-11-01" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Remove these targets" }));
    const confirm = await screen.findByRole("dialog", { name: `Remove the targets from ${formatDay("2026-11-01")}?` });
    expect(confirm).toHaveTextContent(
      `Days before ${formatDay("2026-12-01")} are then measured against the targets from ${formatDay("2026-12-01")}.`,
    );
  });

  it("keeps the confirmation open with the reason when the server refuses the removal", async () => {
    changes = [change("2026-11-01"), change("2026-12-01")];
    jest.mocked(deleteTargets).mockRejectedValue(refusal(409, "targets_last_change"));
    const { onClose } = renderSheet({ editing: "2026-12-01" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Remove these targets" }));
    const confirm = await screen.findByRole("dialog", { name: /Remove the targets/ });
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent("You need at least one set of targets.");
    expect(onClose).not.toHaveBeenCalled();
  });
});
