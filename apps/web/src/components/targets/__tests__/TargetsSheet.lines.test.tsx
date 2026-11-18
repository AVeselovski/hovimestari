import { deleteTargets, getTargets, putTargets } from "@/lib/api/targets";
import { formatDay } from "@/lib/localDate";
import type { TargetChange } from "@hovimestari/types";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TargetsSheet, type TargetsSheetProps } from "../TargetsSheet";
import { TODAY, change, overview } from "./support";

// The targets sheet's line under the fields: which days the numbers apply
// to, then whether the days before them keep their targets or have none.

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
const dateField = () => within(dialog()).getByLabelText("Starts on") as HTMLInputElement;

function renderSheet(props: Partial<TargetsSheetProps> = {}): void {
  render(
    <TargetsSheet
      open
      returnFocusTo={null}
      onClose={jest.fn()}
      onSaved={jest.fn()}
      today={TODAY}
      changes={changes}
      {...props}
    />,
  );
}

describe("TargetsSheet, the line naming the days", () => {
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

    it("between two changes: to the day before the next, and earlier days keep theirs", () => {
      changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-10-20" } });
      expect(span()).toHaveTextContent(
        `These apply from ${formatDay("2026-10-20")} to ${formatDay("2026-10-31")}. Earlier days keep their targets.`,
      );
    });

    it("names the one day, not a stretch from a day to itself, when the next change starts the day after", () => {
      changes = [change("2026-11-01"), change("2026-11-16")];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-11-15" } });
      expect(span()).toHaveTextContent(
        `These apply to ${formatDay("2026-11-15")} only. Earlier days keep their targets.`,
      );
    });

    it("for an edit of a change, ends the day before the next change", () => {
      changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
      renderSheet({ editing: "2026-11-01" });
      expect(span()).toHaveTextContent(
        `These apply from ${formatDay("2026-11-01")} to ${formatDay("2026-11-30")}. Earlier days keep their targets.`,
      );
    });

    it("before the earliest change: to the day before it, and earlier days have no targets", () => {
      changes = [change("2026-11-01"), change("2026-12-01")];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-10-15" } });
      expect(span().textContent).toBe(
        `These apply from ${formatDay("2026-10-15")} to ${formatDay("2026-10-31")}. Earlier days have no targets.`,
      );
    });

    it("on the day before the earliest change: that day only, and earlier days have no targets", () => {
      changes = [change("2026-11-01")];
      renderSheet();
      fireEvent.change(dateField(), { target: { value: "2026-10-31" } });
      expect(span().textContent).toBe(`These apply to ${formatDay("2026-10-31")} only. Earlier days have no targets.`);
    });

    it("for an edit of the first change: to the day before the next, and earlier days have no targets", () => {
      changes = [change("2026-11-01"), change("2026-12-01")];
      renderSheet({ editing: "2026-11-01" });
      expect(span().textContent).toBe(
        `These apply from ${formatDay("2026-11-01")} to ${formatDay("2026-11-30")}. Earlier days have no targets.`,
      );
      expect(span()).not.toHaveTextContent(/every day|only targets|Later days/);
    });

    it("for an edit of the only change: from its date on, and earlier days have no targets", () => {
      renderSheet({ editing: "2026-11-01" });
      expect(span().textContent).toBe(`These apply from ${formatDay("2026-11-01")} on. Earlier days have no targets.`);
    });

    describe("on a picked date that already has targets", () => {
      // The whole line, so a notice in the wrong place or said twice fails.
      const line = () => span().textContent;

      it("between two changes: says it replaces this date's targets, then the days, naming the date once", () => {
        changes = [change("2026-10-01"), change("2026-11-01"), change("2026-12-01")];
        renderSheet();
        fireEvent.change(dateField(), { target: { value: "2026-11-01" } });
        expect(line()).toBe(
          "This date already has targets. Saving replaces them. These apply from November 1, 2026 to November 30, 2026. Earlier days keep their targets.",
        );
      });

      it("for one day: says it replaces this date's targets, then the day", () => {
        changes = [change("2026-11-01"), change("2026-11-15"), change("2026-11-16")];
        renderSheet();
        fireEvent.change(dateField(), { target: { value: "2026-11-15" } });
        expect(line()).toBe(
          "This date already has targets. Saving replaces them. These apply to November 15, 2026 only. Earlier days keep their targets.",
        );
      });

      it("on the last change: says it replaces this date's targets, then from it on", () => {
        changes = [change("2026-11-01"), change("2026-12-01")];
        renderSheet();
        fireEvent.change(dateField(), { target: { value: "2026-12-01" } });
        expect(line()).toBe(
          "This date already has targets. Saving replaces them. These apply from December 1, 2026 on. Earlier days keep their targets.",
        );
      });

      it("on the first change: says it replaces this date's targets, then its days, and that earlier days have none", () => {
        changes = [change("2026-11-01"), change("2026-12-01")];
        renderSheet();
        fireEvent.change(dateField(), { target: { value: "2026-11-01" } });
        expect(line()).toBe(
          "This date already has targets. Saving replaces them. These apply from November 1, 2026 to November 30, 2026. Earlier days have no targets.",
        );
      });

      it("on the only change: says it replaces this date's targets, then from it on, and earlier days have none", () => {
        changes = [change(TODAY)];
        renderSheet();
        expect(line()).toBe(
          "This date already has targets. Saving replaces them. These apply from November 16, 2026 on. Earlier days have no targets.",
        );
      });

      // Across states: one announced line, the notice comes and goes with the date.
      it("comes and goes in the same announced line as the date moves onto a change and off it", () => {
        changes = [change("2026-11-01"), change("2026-12-01")];
        renderSheet();
        const el = span();
        expect(el).not.toHaveTextContent(/already has targets/);
        fireEvent.change(dateField(), { target: { value: "2026-12-01" } });
        expect(span()).toBe(el);
        expect(el).toHaveAttribute("aria-live", "polite");
        expect(el).toHaveTextContent(/^This date already has targets\. Saving replaces them\. /);
        fireEvent.change(dateField(), { target: { value: "2026-12-02" } });
        expect(span()).toBe(el);
        expect(el).not.toHaveTextContent(/already has targets|replaces/);
        expect(el).toHaveTextContent(`These apply from ${formatDay("2026-12-02")} on.`);
      });
    });
  });
});
