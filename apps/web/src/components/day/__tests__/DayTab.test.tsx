import { fakeAuth } from "@/__tests__/helpers/auth";
import { useAuth } from "@/contexts/AuthContext";
import { getDay } from "@/lib/api/days";
import { patchEntry, removeEntry, restoreEntry, setEntriesStatus } from "@/lib/api/entries";
import { getFood } from "@/lib/api/foods";
import { getTargets } from "@/lib/api/targets";
import { afterFoodNameLanguageChange, afterTargetsChange } from "@/lib/invalidation";
import { formatDayShort } from "@/lib/localDate";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  DayHarness,
  FakeDays,
  liveToast,
  recordToasts,
  renderDay,
  rowNames,
  rowOf,
  seededClient,
  serve,
  toasts,
} from "./harness";
import { TODAY, estimateEntry, foodEntry, mealEntry } from "./support";

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn().mockResolvedValue({ items: [] }) }));
jest.mock("@/lib/api/savedMeals", () => ({
  getSavedMeals: jest.fn().mockResolvedValue({ meals: [] }),
  createSavedMeal: jest.fn(),
  saveAndLog: jest.fn(),
  updateSavedMeal: jest.fn(),
  setSavedMealArchived: jest.fn(),
  deleteSavedMeal: jest.fn(),
}));
jest.mock("@/lib/api/entries", () => ({
  addEntry: jest.fn(),
  setEntriesStatus: jest.fn(),
  patchEntry: jest.fn(),
  removeEntry: jest.fn(),
  restoreEntry: jest.fn(),
}));
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/foods", () => ({
  getFood: jest.fn(),
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
}));

let searchParams = new URLSearchParams();
const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/",
}));

const timeout = () =>
  Object.assign(new Error("timeout of 10000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" });

beforeEach(() => {
  searchParams = new URLSearchParams();
  replace.mockReset();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, setEntriesStatus, patchEntry, removeEntry, restoreEntry, getTargets, getFood]) {
    jest.mocked(fn).mockReset();
  }
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
});

/** Opens a row's entry sheet. */
async function openSheet(name: string): Promise<HTMLElement> {
  fireEvent.click(within(rowOf(name)).getByRole("button", { name: new RegExp(`^${name}`) }));
  return screen.findByRole("dialog", { name });
}

describe("DayTab, marking", () => {
  it("keeps every row at its index and the summary's lines at their room when one is marked eaten, then undoes exactly that", async () => {
    const server = new FakeDays([
      foodEntry("Oats", 80),
      foodEntry("Quark", 250, { status: "planned" }),
      foodEntry("Banana", 120, { status: "planned" }),
    ]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const order = rowNames();
    const reserved = () =>
      [...document.querySelectorAll("[data-reserved]")].map(
        (r) => r.querySelectorAll(':scope > [aria-hidden="true"]').length,
      );
    const room = reserved();

    fireEvent.click(screen.getByRole("button", { name: "Mark Quark eaten" }));
    await waitFor(() => expect(within(rowOf("Quark")).getByRole("img", { name: "Eaten" })).toBeInTheDocument());
    expect(rowNames()).toEqual(order);
    expect(reserved()).toEqual(room);
    expect(setEntriesStatus).toHaveBeenCalledWith([server.entries[1].id], "eaten");
    expect(within(liveToast()).getByText("Marked Quark eaten.")).toBeInTheDocument();

    fireEvent.click(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark Quark eaten" })).toBeInTheDocument());
    expect(setEntriesStatus).toHaveBeenLastCalledWith([server.entries[1].id], "planned");
    expect(rowNames()).toEqual(order);
  });

  it("marks exactly the planned entries on screen, 130 of them as 100 then 30, with one toast", async () => {
    const planned = Array.from({ length: 130 }, (_, i) => foodEntry(`Food ${i}`, 10, { status: "planned" }));
    const server = new FakeDays([foodEntry("Eaten already", 100), ...planned]);
    serve(server);
    renderDay();
    await screen.findByText("Food 129");
    // Every toast that appears, recorded as it appears: under load, rendering
    // 130 rows can take longer than a toast stays on screen.
    const { shown, stop } = recordToasts();
    try {
      fireEvent.click(screen.getByRole("button", { name: "Mark all eaten" }));
      await waitFor(() => expect(jest.mocked(setEntriesStatus)).toHaveBeenCalledTimes(2), { timeout: 10_000 });
      await waitFor(() => expect(shown).toHaveLength(1), { timeout: 10_000 });
      await waitFor(() => expect(screen.queryByRole("button", { name: "Mark all eaten" })).toBeNull(), {
        timeout: 10_000,
      });
    } finally {
      stop();
    }
    const calls = jest.mocked(setEntriesStatus).mock.calls;
    expect(calls.map(([ids]) => ids.length)).toEqual([100, 30]);
    expect(calls.flatMap(([ids]) => ids)).toEqual(planned.map((e) => e.id));
    expect(calls.every(([, status]) => status === "eaten")).toBe(true);
    expect(shown).toEqual([expect.stringContaining("Marked 130 entries eaten.")]);
  }, 30_000);

  it("reads the day again when a mark changed nothing and answered no days, with no toast", async () => {
    const quark = foodEntry("Quark", 250, { status: "planned" });
    const server = new FakeDays([quark]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    // Another device marked it meanwhile.
    server.entries[0].status = "eaten";
    jest.mocked(setEntriesStatus).mockResolvedValueOnce({ changedIds: [], days: [] });
    const reads = jest.mocked(getDay).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Mark Quark eaten" }));
    await waitFor(() => expect(within(rowOf("Quark")).getByRole("img", { name: "Eaten" })).toBeInTheDocument());
    expect(jest.mocked(getDay).mock.calls.length).toBeGreaterThan(reads);
    expect(toasts()).toHaveLength(0);
  });

  it("draws a future day's marks as indicators, with no Mark all eaten, in an Entries row as tall as a past day's", async () => {
    const tomorrow = "2026-11-17";
    const server = new FakeDays([foodEntry("Quark", 250, { status: "planned", date: tomorrow })]);
    serve(server);
    searchParams = new URLSearchParams({ date: tomorrow });
    const { unmount } = renderDay();
    await screen.findByText("Quark");
    expect(screen.queryByRole("button", { name: /^Mark/ })).toBeNull();
    expect(within(rowOf("Quark")).getByRole("img", { name: "Planned" })).toBeInTheDocument();
    const futureHead = document.querySelector("[data-entries-head]")!.className;
    unmount();

    const yesterday = "2026-11-15";
    serve(new FakeDays([foodEntry("Quark", 250, { status: "planned", date: yesterday })]));
    searchParams = new URLSearchParams({ date: yesterday });
    renderDay();
    await screen.findByRole("button", { name: "Mark all eaten" });
    expect(document.querySelector("[data-entries-head]")!.className).toBe(futureHead);
    expect(futureHead.split(" ")).toContain("min-h-11");
  });

  it("says it could not confirm a mark that timed out, and Try again resends the same request", async () => {
    const server = new FakeDays([foodEntry("Quark", 250, { status: "planned" })]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    jest.mocked(setEntriesStatus).mockRejectedValueOnce(timeout());
    fireEvent.click(screen.getByRole("button", { name: "Mark Quark eaten" }));
    const toast = await waitFor(() => liveToast());
    expect(toast).toHaveTextContent("Could not confirm. Check your connection and try again.");
    fireEvent.click(within(toast).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(within(rowOf("Quark")).getByRole("img", { name: "Eaten" })).toBeInTheDocument());
    const calls = jest.mocked(setEntriesStatus).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

  it("sends nothing while known offline, and says so", async () => {
    serve(new FakeDays([foodEntry("Quark", 250, { status: "planned" })]));
    renderDay();
    await screen.findByText("Quark");
    const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    try {
      fireEvent.click(screen.getByRole("button", { name: "Mark Quark eaten" }));
      await waitFor(() => expect(liveToast()).toHaveTextContent("You are offline. Changes need a connection."));
      expect(setEntriesStatus).not.toHaveBeenCalled();
    } finally {
      onLine.mockRestore();
      act(() => void window.dispatchEvent(new Event("online")));
    }
  });
});

describe("DayTab, undo", () => {
  it("brings a removed row back at its old index", async () => {
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250), foodEntry("Banana", 120)]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const order = rowNames();
    const sheet = await openSheet("Quark");
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove entry" }));
    await waitFor(() => expect(rowNames()).toEqual(["Oats", "Banana"]));
    // Focus goes to the next row, not to <body>.
    expect(document.activeElement).toBe(within(rowOf("Banana")).getByRole("button", { name: /^Banana/ }));
    expect(liveToast()).toHaveTextContent("Removed Quark.");
    fireEvent.click(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(rowNames()).toEqual(order));
    expect(restoreEntry).toHaveBeenCalledWith(server.entries.find((e) => e.name === "Quark")!.id);
  });

  it("moves a row back to its old index in the source day, eaten again when the move planned it", async () => {
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250), foodEntry("Banana", 120)]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const order = rowNames();
    const quark = server.entries[1];
    const sheet = await openSheet("Quark");
    fireEvent.change(within(sheet).getByLabelText("Date"), { target: { value: "2026-11-18" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rowNames()).toEqual(["Oats", "Banana"]));
    // Moved to a future day, the eaten entry is planned there.
    expect(patchEntry).toHaveBeenCalledWith(quark.id, { date: "2026-11-18", status: "planned" });
    expect(liveToast()).toHaveTextContent(`Moved Quark to ${formatDayShort("2026-11-18", undefined, TODAY)}.`);
    fireEvent.click(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(rowNames()).toEqual(order));
    expect(patchEntry).toHaveBeenLastCalledWith(quark.id, { date: TODAY, status: "eaten" });
    expect(within(rowOf("Quark")).getByRole("img", { name: "Eaten" })).toBeInTheDocument();
  });

  it("undoes a move the server planned unasked, putting back status eaten it was not sent", async () => {
    const server = new FakeDays([foodEntry("Quark", 250)]);
    serve(server);
    // A move to a past day sends the date alone. This server also plans the entry, unasked.
    jest
      .mocked(patchEntry)
      .mockImplementationOnce(async (id, patch) => server.patch(id, { date: patch.date, status: "planned" }));
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openSheet("Quark");
    fireEvent.change(within(sheet).getByLabelText("Date"), { target: { value: "2026-11-14" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent(/^Moved Quark/));
    expect(patchEntry).toHaveBeenCalledWith(server.entries[0].id, { date: "2026-11-14" });
    fireEvent.click(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(patchEntry).toHaveBeenLastCalledWith(server.entries[0].id, { date: TODAY, status: "eaten" }),
    );
  });

  it("closes the toast on its press, so a second press sends nothing; a failed undo offers Try again with the same inverse", async () => {
    const server = new FakeDays([foodEntry("Quark", 250, { status: "planned" })]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    fireEvent.click(screen.getByRole("button", { name: "Mark Quark eaten" }));
    const toast = await waitFor(() => liveToast());
    jest.mocked(setEntriesStatus).mockRejectedValueOnce(timeout());
    const undo = within(toast).getByRole("button", { name: "Undo" });
    fireEvent.click(undo);
    fireEvent.click(undo);
    await waitFor(() => expect(liveToast()).toHaveTextContent("Could not undo."));
    const undoCalls = () => jest.mocked(setEntriesStatus).mock.calls.filter(([, s]) => s === "planned");
    expect(undoCalls()).toHaveLength(1);
    fireEvent.click(within(liveToast()).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark Quark eaten" })).toBeInTheDocument());
    expect(undoCalls()).toHaveLength(2);
    expect(undoCalls()[1]).toEqual(undoCalls()[0]);
  });

  it("leaves exactly one toast in the DOM after three actions in a row", async () => {
    serve(
      new FakeDays([
        foodEntry("Oats", 80, { status: "planned" }),
        foodEntry("Quark", 250, { status: "planned" }),
        foodEntry("Banana", 120, { status: "planned" }),
      ]),
    );
    renderDay();
    await screen.findByText("Quark");
    for (const name of ["Oats", "Quark", "Banana"]) {
      fireEvent.click(screen.getByRole("button", { name: `Mark ${name} eaten` }));
      await waitFor(() => expect(liveToast()).toHaveTextContent(`Marked ${name} eaten.`));
    }
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(1);
  });
});

describe("DayTab, the entry sheet", () => {
  it("saves a planned entry's new amount and Eaten in one request", async () => {
    const server = new FakeDays([foodEntry("Quark", 250, { status: "planned" })]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openSheet("Quark");
    fireEvent.change(within(sheet).getByLabelText("Amount", { selector: "input" }), { target: { value: "300" } });
    fireEvent.click(within(sheet).getByRole("radio", { name: "Eaten" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("Saved Quark."));
    expect(patchEntry).toHaveBeenCalledTimes(1);
    expect(patchEntry).toHaveBeenCalledWith(server.entries[0].id, { status: "eaten", amount: { grams: 300 } });
  });

  it("shows the entry's own figures until the amount changes, then the figures its basis gives", async () => {
    const meal = mealEntry("Delivered bowl", 1, { energyKcal: 60, proteinG: 8, carbsG: 5, fatG: 1 });
    serve(new FakeDays([meal]));
    renderDay();
    await screen.findByText("Delivered bowl");
    const sheet = await openSheet("Delivered bowl");
    const figures = () => [...sheet.querySelectorAll("[data-entry-preview] [data-macro] dd")].map((d) => d.textContent);
    expect(figures()).toEqual(["60\u00a0kcal", "8.0\u00a0g", "5.0\u00a0g", "1.0\u00a0g"]);
    fireEvent.change(within(sheet).getByLabelText("Meals"), { target: { value: "2,5" } });
    expect(figures()).toEqual(["150\u00a0kcal", "20.0\u00a0g", "12.5\u00a0g", "2.5\u00a0g"]);
    fireEvent.change(within(sheet).getByLabelText("Meals"), { target: { value: "" } });
    expect(figures()).toEqual(["", "", "", ""]);
    expect(sheet).toHaveTextContent("Enter an amount to see its figures.");
  });

  it("refuses an estimate's empty figure in its own line, keeping what is typed", async () => {
    serve(new FakeDays([estimateEntry("Dinner out", { energyKcal: 900, proteinG: 40, carbsG: 80, fatG: 35 })]));
    renderDay();
    await screen.findByText("Dinner out");
    const sheet = await openSheet("Dinner out");
    fireEvent.change(within(sheet).getByLabelText("Protein"), { target: { value: "" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await within(sheet).findByText("Enter a value.")).toBeInTheDocument();
    expect(patchEntry).not.toHaveBeenCalled();
    expect(within(sheet).getByLabelText("Calories")).toHaveValue("900");
  });
});

describe("DayTab, today", () => {
  it("with no today known (the targets read failed), says the day did not load, and Try again reads the targets, then the day", async () => {
    serve(new FakeDays([foodEntry("Quark", 250)]));
    const client = seededClient();
    client.removeQueries();
    renderDay(client);
    expect(await screen.findByText("This day did not load.")).toBeInTheDocument();
    expect(getDay).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Previous day" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Quark")).toBeInTheDocument();
    expect(getTargets).toHaveBeenCalledTimes(1);
    expect(getDay).toHaveBeenCalledWith(TODAY, expect.anything());
  });

  it("shows the loading frame for a new date, never the previous date's figures", async () => {
    serve(new FakeDays([foodEntry("Quark", 250)]));
    const view = renderDay();
    await screen.findByText("Quark");
    jest.mocked(getDay).mockReturnValue(new Promise(() => {}));
    searchParams = new URLSearchParams({ date: "2026-11-25" });
    view.rerender(<DayHarness />);
    expect(screen.queryByText("Quark")).toBeNull();
    expect(document.querySelectorAll('[data-gauge="frame"]')).toHaveLength(2);
    expect(document.querySelector("[data-date-label]")).toHaveTextContent(
      formatDayShort("2026-11-25", undefined, TODAY),
    );
  });

  it("follows a targets edit in Settings: the range and the distances change", async () => {
    const server = new FakeDays([foodEntry("Quark", 250)]);
    serve(server);
    const view = renderDay();
    await screen.findByText("1900 to 2200 kcal");
    jest.mocked(getDay).mockImplementation(async (date) => {
      const day = server.day(date);
      const ranges = { energyKcal: { lower: 1500, upper: 1700 }, proteinG: day.targets!.proteinG };
      return { ...day, targets: ranges, eaten: { ...day.eaten, energy: { position: "below", distance: 1352 } } };
    });
    await act(() => afterTargetsChange(view.client));
    expect(await screen.findByText("1500 to 1700 kcal")).toBeInTheDocument();
    expect(screen.getAllByText("1352 kcal below the range")[0]).toBeInTheDocument();
  });

  it("renames the day's entries after a food-name language change", async () => {
    const server = new FakeDays([foodEntry("Quark", 250)]);
    serve(server);
    const view = renderDay();
    await screen.findByText("Quark");
    server.entries[0].name = "Rahka";
    await act(() =>
      afterFoodNameLanguageChange(view.client, { ...fakeAuth("authenticated").user!, foodNameLanguage: "fi" }),
    );
    expect(await screen.findByText("Rahka")).toBeInTheDocument();
  });
});
