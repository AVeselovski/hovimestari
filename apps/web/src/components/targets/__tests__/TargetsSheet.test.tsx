import { describeFormSheetContract } from "@/__tests__/formSheet";
import { confirmArmed, holdSheetExits } from "@/__tests__/sheet";
import { deleteTargets, getTargets, putTargets } from "@/lib/api/targets";
import { formatDay } from "@/lib/localDate";
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

/** The line that states the targets in force, once it has loaded. */
const inForceLine = () => within(dialog()).findByText(/^In force on /);

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

  it("opens with every target field empty and no placeholder while a change is in force; the numbers in force sit only in the in-force line", async () => {
    renderSheet();
    const line = await inForceLine();
    expect(line).toHaveTextContent(`In force on ${formatDay(TODAY)}: 1800 to 2200 kcal, 120 to 160 g protein.`);
    for (const g of ["Calories", "Protein"] as const) {
      for (const b of ["From", "To"] as const) {
        expect(field(g, b)).toHaveValue("");
        expect(field(g, b)).not.toHaveAttribute("placeholder");
      }
    }
    expect(dialog().querySelectorAll("[placeholder]")).toHaveLength(0);
    // Negative: no in-force number anywhere else in the sheet, as text or as a value.
    const elsewhere = (dialog().textContent ?? "").replace(line.textContent ?? "", "");
    for (const n of ["1800", "2200", "120", "160"]) expect(elsewhere).not.toContain(n);
    for (const input of within(dialog()).getAllByRole("textbox")) {
      for (const n of ["1800", "2200", "120", "160"]) expect((input as HTMLInputElement).value).not.toContain(n);
    }
  });

  it("starts on the server's today, as a native date field", () => {
    renderSheet();
    expect(dateField()).toHaveAttribute("type", "date");
    expect(dateField()).toHaveValue(TODAY);
  });

  it("switches the title to that change when the picked date has one, and reads the targets in force on it", async () => {
    changes = [change("2026-11-01"), change("2026-12-01", [2000, 2400], [130, 170])];
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Change targets" })).toBeInTheDocument();
    fireEvent.change(dateField(), { target: { value: "2026-12-01" } });
    expect(screen.getByRole("dialog", { name: `Targets from ${formatDay("2026-12-01")}` })).toBeInTheDocument();
    await waitFor(() => expect(getTargets).toHaveBeenCalledWith("2026-12-01", expect.anything()));
    await waitFor(async () =>
      expect(await inForceLine()).toHaveTextContent("2000 to 2400 kcal, 130 to 170 g protein."),
    );
    // Still empty: the change's own numbers are never put in a field.
    expect(field("Calories", "From")).toHaveValue("");
  });

  it("states the targets in force directly under the date, as the date's own line", async () => {
    renderSheet();
    const line = await inForceLine();
    expect(line.id).toBe(`${dateField().id}-line`);
    expect(dateField()).toHaveAccessibleDescription(line.textContent ?? "");
    expect(line).toHaveAttribute("aria-live", "polite");
  });

  it("empties the in-force line while the date is not a date, and keeps its room", async () => {
    renderSheet();
    const line = await inForceLine();
    fireEvent.change(dateField(), { target: { value: "" } });
    expect(document.getElementById(`${dateField().id}-line`)).toBe(line);
    expect(line).toBeEmptyDOMElement();
    expect(line.className.split(/\s+/)).toContain("min-h-10");
    fireEvent.change(dateField(), { target: { value: TODAY } });
    expect(await inForceLine()).toBe(line);
  });

  describe("the rewrite line", () => {
    // Below every field, it is as tall as what it says: a date picked above it moves only what is below it.
    it("is one announced element, whether or not a date rewrites any day, and keeps no room", () => {
      changes = [change("2026-11-01")];
      renderSheet();
      const line = dialog().querySelector<HTMLElement>("[data-rewrite]")!;
      expect(line).toHaveAttribute("aria-live", "polite");
      expect(line.className.split(/\s+/).filter((c) => /min-h/.test(c))).toEqual([]);
      // A section of its own, 16 px under the fields, that takes no gap while empty.
      expect(line.className.split(/\s+/)).toEqual(expect.arrayContaining(["mt-2", "empty:-mt-2"]));
      expect(line).toHaveTextContent(/every day from/);
      // A later date after the first change rewrites nothing: the line empties and stays.
      fireEvent.change(dateField(), { target: { value: "2026-11-20" } });
      expect(dialog().querySelector("[data-rewrite]")).toBe(line);
      expect(line).toBeEmptyDOMElement();
      fireEvent.change(dateField(), { target: { value: "" } });
      expect(dialog().querySelector("[data-rewrite]")).toBe(line);
      fireEvent.change(dateField(), { target: { value: "2026-10-01" } });
      expect(dialog().querySelector("[data-rewrite]")).toBe(line);
      expect(line).toHaveTextContent(/every day/);
    });

    it("names the days from today on, for today with no later change", () => {
      renderSheet();
      expect(
        within(dialog()).getByText(`This changes the targets for every day from ${formatDay(TODAY)} on.`),
      ).toBeInTheDocument();
    });

    it("ends the day before the next change, for an earlier date", () => {
      changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-10-20" } });
      expect(
        within(dialog()).getByText(
          `This changes the targets for every day from ${formatDay("2026-10-20")} to ${formatDay("2026-10-31")}.`,
        ),
      ).toBeInTheDocument();
    });

    it("names the one day, not a stretch from a day to itself, when the next change starts the day after", () => {
      changes = [change("2026-11-01"), change("2026-11-16")];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-11-15" } });
      expect(
        within(dialog()).getByText(`This changes the targets for ${formatDay("2026-11-15")}.`),
      ).toBeInTheDocument();
      expect(dialog()).not.toHaveTextContent(/every day from/);
    });

    it("appears for an edit of a change, with the end from the next change", () => {
      changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
      renderSheet({ editing: "2026-11-01" });
      expect(
        within(dialog()).getByText(
          `This changes the targets for every day from ${formatDay("2026-11-01")} to ${formatDay("2026-11-30")}.`,
        ),
      ).toBeInTheDocument();
    });

    it("covers every earlier day for an edit of the first change", () => {
      changes = [change("2026-11-01"), change("2026-12-01")];
      renderSheet({ editing: "2026-11-01" });
      expect(
        within(dialog()).getByText(`This changes the targets for every day before ${formatDay("2026-12-01")}.`),
      ).toBeInTheDocument();
    });

    it("is absent for a future date with no change on it", () => {
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-12-24" } });
      expect(within(dialog()).queryByText(/^This changes the targets/)).toBeNull();
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
      const line = await inForceLine();
      const lineText = line.textContent;
      const rewrite = dialog().querySelector("[data-rewrite]")?.textContent;

      // The removal closes the sheet, and then the list comes back without the change.
      rerender(<TargetsSheet open={false} changes={changes} {...props} />);
      changes = [change("2026-11-01")];
      rerender(<TargetsSheet open={false} changes={changes} {...props} />);
      await act(async () => {});

      const closing = screen.getByRole("dialog", { hidden: true });
      expect(closing).toHaveAccessibleName(title);
      expect(within(closing).getByText(/^In force on /).textContent).toBe(lineText);
      expect(closing.querySelector("[data-rewrite]")?.textContent).toBe(rewrite);
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
