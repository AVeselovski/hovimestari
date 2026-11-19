import { describeFormSheetContract } from "@/__tests__/formSheet";
import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import { createTestQueryClient, deferred, registerTestQueryClient } from "@/__tests__/helpers/queryClient";
import { openSheet } from "@/__tests__/sheet";
import { TODAY, dayOf, fakeEntryActions, foodEntry } from "@/components/day/__tests__/support";
import type { CopyDone } from "@/hooks/useEntryActions";
import { TodayContext, type TodayState } from "@/hooks/useToday";
import { getDay } from "@/lib/api/days";
import { queryKeys } from "@/lib/queryKeys";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { CopyEntriesSheet, defaultCopyDate } from "../CopyEntriesSheet";

// ---------------------------------------------------------------------------
// The copy sheet on its own, with the entry actions faked: the frame every
// form sheet keeps, its To, and its checklist. Its sends, ids, cleanup and
// Undo run against the fake server in DayTab.copy.test.tsx. The app's today
// is Monday 16 November 2026, and figures format as a British phone.
// ---------------------------------------------------------------------------

jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));

const oats = foodEntry("Oats", 80);
const quark = foodEntry("Quark", 250, { status: "planned" });

const TODAY_STATE: TodayState = { today: TODAY, holding: false, confirm: "fresh", unconfirmed: false, retry: () => {} };

let actions = fakeEntryActions();
let client: QueryClient;
beforeEach(() => {
  clockFrom(`${TODAY}T10:00:00Z`);
  setTestLocale("en-GB");
  actions = fakeEntryActions();
  // The day on screen is cached, as the Day tab leaves it when Copy opens the sheet.
  client = registerTestQueryClient(createTestQueryClient());
  client.setQueryData(queryKeys.day(TODAY), dayOf([oats, quark]));
  jest
    .mocked(getDay)
    .mockReset()
    .mockResolvedValue(dayOf([oats, quark]));
});

afterEach(() => jest.restoreAllMocks());

function withDay(ui: ReactElement): ReactElement {
  return (
    <QueryClientProvider client={client}>
      <TodayContext.Provider value={TODAY_STATE}>{ui}</TodayContext.Provider>
    </QueryClientProvider>
  );
}

/** The copy sheet, found as open. */
function sheet(): HTMLElement {
  const open = openSheet("Copy entries");
  if (!open) throw new Error("The copy sheet is not open");
  return open;
}
const toField = () => within(sheet()).getByLabelText("To") as HTMLInputElement;
/** To in the copy sheet, open or sliding out: the contract reads it while the sheet closes. */
function toFieldOpenOrClosing(): HTMLInputElement {
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(
    (d) => d.querySelector("h2")?.textContent === "Copy entries",
  );
  if (!dialog) throw new Error("No copy sheet in the document");
  return within(dialog).getByLabelText("To", { selector: "input" }) as HTMLInputElement;
}
const box = (name: string) => within(sheet()).getByRole("checkbox", { name });
const tokens = (el: Element) => el.className.split(/\s+/);

function renderSheet(): void {
  render(
    withDay(<CopyEntriesSheet open returnFocusTo={null} onClose={jest.fn()} fromDate={TODAY} actions={actions} />),
  );
}

describe("CopyEntriesSheet", () => {
  describeFormSheetContract({
    endsInLine: false,
    name: /^copy entries$/i,
    panelClass: "md:max-w-md",
    saveName: /^copy$/i,
    busyName: /copying/i,
    renderSheet: (p) => withDay(<CopyEntriesSheet {...p} fromDate={TODAY} actions={actions} />),
    type: () => fireEvent.change(toField(), { target: { value: "2026-11-20" } }),
    typedField: () => toFieldOpenOrClosing(),
    // A date and boxes: nothing in it raises the software keyboard.
    keyboardField: null,
    fillValid: () => {},
    holdSave: () => {
      const held = deferred<CopyDone>();
      jest.mocked(actions.copy).mockReturnValue(held.promise);
      return { resolve: () => held.resolve({ announce: jest.fn() }), reject: () => held.reject(new Error("refused")) };
    },
    firstField: () => toField(),
  });

  it("opens with To on the next day and its line, and every entry ticked under All entries", () => {
    renderSheet();
    expect(toField()).toHaveValue("2026-11-17");
    expect(toField()).toHaveAccessibleDescription("Each copy is a planned entry.");
    expect(box("All entries")).toBeChecked();
    expect(box("Oats")).toBeChecked();
    expect(box("Quark")).toBeChecked();
    // Each entry's box is named by its name and described by its amount and calories.
    expect(box("Oats")).toHaveAccessibleDescription(/^80\sg\s*47\skcal$/);
  });

  // jsdom lays nothing out, so this pins the two classes that keep a long
  // name inside the sheet. A fieldset is as wide as its widest unbreakable
  // content unless it may shrink, and a name on one line is as wide as the
  // whole name. The browser run at 320, 390 and 1280 is the real check.
  it("lets a long name wrap in its row: the list may shrink, and a name takes two lines at most", () => {
    renderSheet();
    expect(tokens(sheet().querySelector("[data-copy-list]")!)).toContain("min-w-0");
    const name = document.getElementById(box("Oats").getAttribute("aria-labelledby")!)!;
    expect(name).toHaveTextContent("Oats");
    expect(tokens(name)).toEqual(expect.arrayContaining(["line-clamp-2", "break-words"]));
    expect(tokens(name)).not.toContain("truncate");
  });

  it("All entries shows a dash for some, clears all, and ticks all again", () => {
    renderSheet();
    const all = box("All entries") as HTMLInputElement;
    fireEvent.click(box("Quark"));
    expect(all.indeterminate).toBe(true);
    expect(all).not.toBeChecked();
    fireEvent.click(all);
    expect(all.indeterminate).toBe(false);
    expect(all).toBeChecked();
    expect(box("Quark")).toBeChecked();
    fireEvent.click(all);
    expect(box("Oats")).not.toBeChecked();
    expect(box("Quark")).not.toBeChecked();
  });

  it("is dirty once the selection changes, so a stray Escape keeps it open", () => {
    const onClose = jest.fn();
    render(
      withDay(<CopyEntriesSheet open returnFocusTo={null} onClose={onClose} fromDate={TODAY} actions={actions} />),
    );
    fireEvent.click(box("Quark"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(box("Quark"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty To in its own line and sends nothing", async () => {
    renderSheet();
    fireEvent.change(toField(), { target: { value: "" } });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Copy" }));
    expect(toField()).toHaveAccessibleDescription("Enter a valid date.");
    expect(toField()).toHaveFocus();
    await act(async () => {});
    expect(actions.copy).not.toHaveBeenCalled();
  });

  it("sends nothing while the app asks for today", async () => {
    actions = fakeEntryActions({ holding: true });
    renderSheet();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Copy" }));
    await act(async () => {});
    expect(actions.copy).not.toHaveBeenCalled();
  });

  it("ticks the entries once the day arrives, when it opens before the day is cached", async () => {
    client.removeQueries({ queryKey: queryKeys.day(TODAY) });
    renderSheet();
    expect(within(sheet()).queryByRole("checkbox", { name: "Oats" })).toBeNull();
    expect(await within(sheet()).findByRole("checkbox", { name: "Oats" })).toBeChecked();
    expect(box("Quark")).toBeChecked();
    expect(box("All entries")).toBeChecked();
  });

  describe("unmounted while a copy is out, as when Back leaves the page", () => {
    /** A request with no answer: it may have landed. */
    const timeout = () =>
      Object.assign(new Error("timeout of 10000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" });

    function pressCopyHeld() {
      const held = deferred<CopyDone>();
      jest.mocked(actions.copy).mockReturnValue(held.promise);
      const view = render(
        withDay(<CopyEntriesSheet open returnFocusTo={null} onClose={jest.fn()} fromDate={TODAY} actions={actions} />),
      );
      fireEvent.click(within(sheet()).getByRole("button", { name: "Copy" }));
      return { held, view };
    }

    it("still shows the copy's toast, with its Undo, once the copy answers", async () => {
      const { held, view } = pressCopyHeld();
      await act(async () => {});
      expect(actions.copy).toHaveBeenCalledTimes(1);
      view.unmount();
      const announce = jest.fn();
      await act(async () => held.resolve({ announce }));
      expect(announce).toHaveBeenCalledTimes(1);
    });

    it("reads the day it copied to again when the answer was lost", async () => {
      const { held, view } = pressCopyHeld();
      await act(async () => {});
      view.unmount();
      await act(async () => held.reject(timeout()));
      expect(actions.readDaysAgain).toHaveBeenCalledWith(["2026-11-17"]);
    });

    it("reads again the day of an earlier copy that could not confirm", async () => {
      jest.mocked(actions.copy).mockRejectedValueOnce(timeout());
      const view = render(
        withDay(<CopyEntriesSheet open returnFocusTo={null} onClose={jest.fn()} fromDate={TODAY} actions={actions} />),
      );
      fireEvent.click(within(sheet()).getByRole("button", { name: "Copy" }));
      await act(async () => {});
      expect(sheet().querySelector("[data-form-error]")).toHaveTextContent("Could not confirm.");
      expect(actions.readDaysAgain).not.toHaveBeenCalled();
      view.unmount();
      expect(actions.readDaysAgain).toHaveBeenCalledWith(["2026-11-17"]);
    });
  });

  it("marks an estimate's calories as estimated", () => {
    const guess = { ...foodEntry("Pizza", 1), kind: "estimate" as const, food: null, isEstimate: true };
    client.setQueryData(queryKeys.day(TODAY), dayOf([guess]));
    renderSheet();
    expect(box("Pizza")).toHaveAccessibleDescription(/^Estimate\s*estimated/);
  });
});

describe("defaultCopyDate", () => {
  it.each([
    { from: TODAY, today: TODAY, expected: "2026-11-17" },
    { from: "2026-11-20", today: TODAY, expected: "2026-11-21" },
    { from: "2026-11-10", today: TODAY, expected: TODAY },
    { from: "2026-12-31", today: TODAY, expected: "2027-01-01" },
    { from: "2026-11-10", today: null, expected: "2026-11-11" },
  ])("from $from with today $today is $expected", ({ from, today, expected }) => {
    expect(defaultCopyDate(from, today)).toBe(expected);
  });
});
