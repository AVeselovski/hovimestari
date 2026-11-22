import { fakeAuth } from "@/__tests__/helpers/auth";
import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import { deferred } from "@/__tests__/helpers/queryClient";
import { holdSheetExits } from "@/__tests__/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { getDay, getDaySummaries } from "@/lib/api/days";
import { copyEntries, removeEntries } from "@/lib/api/entries";
import { getFood } from "@/lib/api/foods";
import { getTargets } from "@/lib/api/targets";
import { queryKeys } from "@/lib/queryKeys";
import { dayQuery, dayRangeQuery } from "@/lib/queryOptions";
import type { Day, DaySummary, EntryRemoveManyResult } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { FakeDays, liveToast, recordToasts, renderDay, serve, toasts } from "./harness";
import { TODAY, foodEntry } from "./support";

// ---------------------------------------------------------------------------
// Copy on the Day tab and the copy sheet it opens, against the fake entry
// routes, which copy and remove as the server does (harness.tsx). The app's
// today is Monday 16 November 2026, the clock runs from noon that day, and
// dates format as a British phone.
//
// The sheet is found as open (`[role=dialog][data-open]`), never by its role
// alone: a role query also finds a sheet that is closing or hidden behind a
// stacked one.
// ---------------------------------------------------------------------------

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn().mockResolvedValue({ items: [] }) }));
jest.mock("@/lib/api/recipes", () => ({ getRecipes: jest.fn().mockResolvedValue({ recipes: [] }) }));
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
  copyEntries: jest.fn(),
  removeEntries: jest.fn(),
}));
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/foods", () => ({
  getFood: jest.fn(),
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
}));

let searchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/",
}));

const TOMORROW = "2026-11-17";
const WEDNESDAY = "2026-11-18";

/** A request with no answer: it may have landed. */
const timeout = () =>
  Object.assign(new Error("timeout of 10000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" });

beforeEach(() => {
  clockFrom(`${TODAY}T10:00:00Z`);
  setTestLocale("en-GB");
  searchParams = new URLSearchParams();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, getDaySummaries, getTargets, getFood, copyEntries, removeEntries]) {
    jest.mocked(fn).mockReset();
  }
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
});

afterEach(() => jest.restoreAllMocks());

const copyButton = () =>
  within(document.querySelector<HTMLElement>("[data-entries-head]")!).getByRole("button", { name: "Copy" });

/** The sheet that is open now. */
function openSheet(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"][data-open]');
}

async function openCopy(): Promise<HTMLElement> {
  await waitFor(() => expect(copyButton()).not.toHaveAttribute("aria-disabled"));
  fireEvent.click(copyButton());
  return waitFor(() => {
    const sheet = openSheet();
    expect(sheet).not.toBeNull();
    expect(sheet).toHaveAccessibleName("Copy entries");
    return sheet!;
  });
}

const submit = (sheet: HTMLElement) =>
  fireEvent.click(within(sheet).getByRole("button", { name: /^(copy|copying…)$/i }));
const toField = (sheet: HTMLElement) => within(sheet).getByLabelText("To") as HTMLInputElement;
const box = (sheet: HTMLElement, name: string) => within(sheet).getByRole("checkbox", { name });
const footerLine = (sheet: HTMLElement) => sheet.querySelector<HTMLElement>("[data-form-error]")!;

/**
 * Every element in the sheet's body before the first row, with its classes
 * and words: what could push the list down. jsdom lays nothing out, so a
 * list that keeps its place is one with nothing above it that changed. A
 * box's drawing (tick, dash, border) is left out: the box is a fixed 20px.
 */
function aboveTheList(sheet: HTMLElement): string[] {
  const body = sheet.querySelector<HTMLElement>("[data-sheet-body]")!;
  const firstRow = body.querySelector("li")!;
  const boxes = [...body.querySelectorAll('input[type="checkbox"]')].map((input) => input.parentElement!);
  return [...body.querySelectorAll("*")]
    .filter((el) => !el.contains(firstRow) && el.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING)
    .filter((el) => !boxes.some((b) => b.contains(el)))
    .map((el) => `${el.tagName} ${el.getAttribute("class") ?? ""} ${el.textContent ?? ""}`);
}

/** The body of each `POST /entries/copy`, in order. */
const copyCalls = () => jest.mocked(copyEntries).mock.calls.map(([body]) => body);
const idsOf = (n: number) => copyCalls()[n].entries.map((e) => e.id);
const onDate = (server: FakeDays, date: string) => server.entries.filter((e) => e.date === date);

async function waitForToast(text: string): Promise<void> {
  await waitFor(() => expect(liveToast()).toHaveTextContent(text));
}

/** A first press whose copies land but whose answer is lost, then the sheet's line says so. */
async function lostFirstSend(server: FakeDays, sheet: HTMLElement): Promise<void> {
  jest.mocked(copyEntries).mockImplementationOnce(async (body) => {
    server.copy(body);
    throw timeout();
  });
  submit(sheet);
  await waitFor(() => expect(footerLine(sheet)).toHaveTextContent("Could not confirm."));
}

describe("DayTab, Copy in the Entries row", () => {
  it("shows on a day with entries, future days included, and not on an empty day", async () => {
    searchParams = new URLSearchParams({ date: "2026-11-20" });
    serve(new FakeDays([foodEntry("Oats", 80, { date: "2026-11-20", status: "planned" })]));
    const view = renderDay();
    await screen.findByText("Oats");
    expect(copyButton()).toHaveAttribute("aria-haspopup", "dialog");
    view.unmount();

    searchParams = new URLSearchParams({ date: "2026-11-21" });
    serve(new FakeDays());
    renderDay();
    await screen.findByText("Nothing planned yet.");
    expect(within(document.querySelector<HTMLElement>("[data-entries-head]")!).queryByRole("button")).toBeNull();
  });

  it("opens the copy sheet with the day's entries in day order, all ticked, and puts focus back on Copy on Cancel", async () => {
    serve(new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250, { status: "planned" })]));
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openCopy();
    const boxes = within(sheet).getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    ["All entries", "Oats", "Quark"].forEach((name, i) => expect(boxes[i]).toHaveAccessibleName(name));
    for (const b of boxes) expect(b).toBeChecked();
    expect(within(sheet).getByText("Each copy is a planned entry.")).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(openSheet()).toBeNull());
    expect(copyButton()).toHaveFocus();
  });
});

describe("DayTab, the copy sheet's To", () => {
  it.each([
    { name: "today", shown: null, expected: TOMORROW },
    { name: "a future day", shown: "2026-11-20", expected: "2026-11-21" },
    { name: "a past day", shown: "2026-11-10", expected: TODAY },
    { name: "yesterday", shown: "2026-11-15", expected: TODAY },
  ])("from $name, opens on $expected", async ({ shown, expected }) => {
    const date = shown ?? TODAY;
    if (shown) searchParams = new URLSearchParams({ date: shown });
    serve(new FakeDays([foodEntry("Oats", 80, { date, status: "planned" })]));
    renderDay();
    await screen.findByText("Oats");
    const sheet = await openCopy();
    expect(toField(sheet)).toHaveValue(expected);
  });
});

describe("DayTab, copying", () => {
  it("sends one id per ticked entry in day order, and the copies arrive planned", async () => {
    const oats = foodEntry("Oats", 80);
    const quark = foodEntry("Quark", 250, { status: "planned" });
    const server = new FakeDays([oats, quark]);
    serve(server);
    const { client } = renderDay();
    await screen.findByText("Quark");
    const sheet = await openCopy();
    const toasts = recordToasts();
    submit(sheet);
    await waitForToast("Copied 2 entries to tomorrow.");
    toasts.stop();
    expect(openSheet()).toBeNull();
    expect(toasts.shown).toHaveLength(1);

    expect(copyCalls()).toHaveLength(1);
    expect(copyCalls()[0].toDate).toBe(TOMORROW);
    expect(copyCalls()[0].entries.map((e) => e.sourceId)).toEqual([oats.id, quark.id]);
    expect(new Set(idsOf(0)).size).toBe(2);
    // In the answer, on the server and in the cache: planned, with their sources' figures.
    const answered = await jest.mocked(copyEntries).mock.results[0].value;
    expect(answered.entries.map((e: { status: string }) => e.status)).toEqual(["planned", "planned"]);
    const cached = client.getQueryData<Day>(queryKeys.day(TOMORROW))!;
    expect(cached.entries.map((e) => [e.id, e.status, e.figures])).toEqual([
      [idsOf(0)[0], "planned", oats.figures],
      [idsOf(0)[1], "planned", quark.figures],
    ]);
    expect(cached.eaten.figures.energyKcal).toBe(0);
  });

  it("shows no toast while the sheet slides out", async () => {
    serve(new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250)]));
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openCopy();
    const restore = holdSheetExits();
    try {
      submit(sheet);
      // Closed, and held mid-slide: still in the page, no longer open.
      await waitFor(() => expect(openSheet()).toBeNull());
      expect(sheet).toBeInTheDocument();
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
      expect(copyEntries).toHaveBeenCalledTimes(1);
      expect(sheet).toBeInTheDocument();
      expect(toasts()).toEqual([]);
    } finally {
      restore();
    }
  });

  it("resends the same ids after a timeout, so the copies land once", async () => {
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250)]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openCopy();
    await lostFirstSend(server, sheet);
    submit(sheet);
    await waitForToast("Copied 2 entries to tomorrow.");
    expect(copyCalls()).toHaveLength(2);
    expect(copyCalls()[1]).toEqual(copyCalls()[0]);
    expect(onDate(server, TOMORROW)).toHaveLength(2);
    expect(removeEntries).not.toHaveBeenCalled();
  });

  it("still sends the same ids after the target day was read with the landed copies in it", async () => {
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250)]);
    serve(server);
    const { client } = renderDay();
    await screen.findByText("Quark");
    const sheet = await openCopy();
    await lostFirstSend(server, sheet);
    // The day the tab reads ahead answers with the copies that landed.
    const read = await act(() => client.fetchQuery({ ...dayQuery(TOMORROW), staleTime: 0 }));
    expect(read.entries.map((e) => e.id)).toEqual(idsOf(0));
    submit(sheet);
    await waitForToast("Copied 2 entries to tomorrow.");
    expect(idsOf(1)).toEqual(idsOf(0));
    expect(onDate(server, TOMORROW)).toHaveLength(2);
  });

  it("after a changed To, sends new ids and removes the earlier ones on success, before the toast", async () => {
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250)]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openCopy();
    await lostFirstSend(server, sheet);
    expect(onDate(server, TOMORROW)).toHaveLength(2);

    const cleanup = deferred<EntryRemoveManyResult>();
    jest.mocked(removeEntries).mockImplementationOnce(async (ids) => {
      const answer = server.removeMany(ids);
      return cleanup.promise.then(() => answer);
    });
    fireEvent.change(toField(sheet), { target: { value: WEDNESDAY } });
    submit(sheet);
    await waitFor(() => expect(removeEntries).toHaveBeenCalledTimes(1));
    expect(idsOf(1)).toHaveLength(2);
    expect(idsOf(1).some((id) => idsOf(0).includes(id))).toBe(false);
    expect(jest.mocked(removeEntries).mock.calls[0][0]).toEqual(idsOf(0));
    // The cleanup has not answered: no toast yet, and the sheet is still busy.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(document.querySelector("[data-toast]")).toBeNull();
    expect(openSheet()).toBe(sheet);

    await act(async () => cleanup.resolve({ removedIds: [], days: [] }));
    await waitForToast("Copied 2 entries to Wed 18 Nov.");
    expect(onDate(server, TOMORROW)).toEqual([]);
    expect(onDate(server, WEDNESDAY).map((e) => e.id)).toEqual(idsOf(1));
  });

  it("after a changed selection, removes the unticked entry's earlier copy on success and keeps the other's id", async () => {
    const oats = foodEntry("Oats", 80);
    const server = new FakeDays([oats, foodEntry("Quark", 250)]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openCopy();
    await lostFirstSend(server, sheet);
    const [oatsCopy, quarkCopy] = idsOf(0);

    fireEvent.click(box(sheet, "Quark"));
    expect(box(sheet, "All entries")).toHaveProperty("indeterminate", true);
    submit(sheet);
    await waitForToast("Copied 1 entry to tomorrow.");
    expect(copyCalls()[1].entries).toEqual([{ sourceId: oats.id, id: oatsCopy }]);
    expect(jest.mocked(removeEntries).mock.calls).toEqual([[[quarkCopy]]]);
    expect(onDate(server, TOMORROW).map((e) => e.id)).toEqual([oatsCopy]);
  });

  it("when the cleanup fails, still shows the copy's toast, reads the stale ids' day again, and Undo removes every id sent", async () => {
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250)]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openCopy();
    await lostFirstSend(server, sheet);

    jest.mocked(removeEntries).mockRejectedValueOnce(timeout());
    fireEvent.change(toField(sheet), { target: { value: WEDNESDAY } });
    jest.mocked(getDay).mockClear();
    submit(sheet);
    await waitForToast("Copied 2 entries to Wed 18 Nov.");
    await waitFor(() => expect(getDay).toHaveBeenCalledWith(TOMORROW, expect.anything()));
    // The copies that landed on the first date are still there: the cleanup never reached the server.
    expect(onDate(server, TOMORROW)).toHaveLength(2);

    fireEvent.click(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(removeEntries).toHaveBeenCalledTimes(2));
    expect([...jest.mocked(removeEntries).mock.calls[1][0]].sort()).toEqual([...idsOf(0), ...idsOf(1)].sort());
    await waitFor(() => expect(onDate(server, TOMORROW)).toEqual([]));
    expect(onDate(server, WEDNESDAY)).toEqual([]);
  });

  it("Undo sends exactly the ids this open sent, and the target day loses exactly them", async () => {
    const kept = foodEntry("Banana", 120, { date: TOMORROW, status: "planned" });
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250), kept]);
    serve(server);
    const { client } = renderDay();
    await screen.findByText("Quark");
    const sheet = await openCopy();
    submit(sheet);
    await waitForToast("Copied 2 entries to tomorrow.");
    fireEvent.click(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(removeEntries).toHaveBeenCalledTimes(1));
    expect(jest.mocked(removeEntries).mock.calls[0][0]).toEqual(idsOf(0));
    await waitFor(() =>
      expect(client.getQueryData<Day>(queryKeys.day(TOMORROW))!.entries.map((e) => e.id)).toEqual([kept.id]),
    );
  });

  it("copies 101 entries in two requests of 100 and 1, and Undo removes all 101 in two", async () => {
    const many = Array.from({ length: 101 }, (_, i) => foodEntry(`Food ${i + 1}`, 10 + i));
    const server = new FakeDays(many);
    serve(server);
    renderDay();
    await screen.findByText("Food 101");
    const sheet = await openCopy();
    submit(sheet);
    await waitForToast("Copied 101 entries to tomorrow.");
    expect(copyCalls().map((c) => [c.toDate, c.entries.length])).toEqual([
      [TOMORROW, 100],
      [TOMORROW, 1],
    ]);
    expect(copyCalls().flatMap((c) => c.entries.map((e) => e.sourceId))).toEqual(many.map((e) => e.id));
    expect(onDate(server, TOMORROW)).toHaveLength(101);

    fireEvent.click(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(removeEntries).toHaveBeenCalledTimes(2));
    const removed = jest.mocked(removeEntries).mock.calls.map(([ids]) => ids);
    expect(removed.map((ids) => ids.length)).toEqual([100, 1]);
    expect(removed.flat()).toEqual([...idsOf(0), ...idsOf(1)]);
    await waitFor(() => expect(onDate(server, TOMORROW)).toEqual([]));
  }, 20000);

  it("when a later request of a large copy is refused, Cancel reads again the day the first one landed on", async () => {
    const many = Array.from({ length: 101 }, (_, i) => foodEntry(`Food ${i + 1}`, 10 + i));
    const server = new FakeDays(many);
    serve(server);
    renderDay();
    await screen.findByText("Food 101");
    const sheet = await openCopy();
    // Another device removes the last entry: the first 100 land, the second request answers 404.
    server.remove(many[100].id);
    submit(sheet);
    await waitFor(() => expect(footerLine(sheet)).toHaveTextContent("This entry is no longer there."));
    expect(copyCalls().map((c) => c.entries.length)).toEqual([100, 1]);
    expect(onDate(server, TOMORROW)).toHaveLength(100);

    jest.mocked(getDay).mockClear();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(getDay).toHaveBeenCalledWith(TOMORROW, expect.anything()));
  }, 20000);

  it("after a later request of a large copy is refused, Copy again sends the landed ids again and Undo removes them", async () => {
    const many = Array.from({ length: 101 }, (_, i) => foodEntry(`Food ${i + 1}`, 10 + i));
    const server = new FakeDays(many);
    serve(server);
    renderDay();
    await screen.findByText("Food 101");
    const sheet = await openCopy();
    server.remove(many[100].id);
    submit(sheet);
    await waitFor(() => expect(footerLine(sheet)).toHaveTextContent("This entry is no longer there."));
    await waitFor(() => expect(within(sheet).queryByRole("checkbox", { name: "Food 101" })).toBeNull());

    submit(sheet);
    await waitForToast("Copied 100 entries to tomorrow.");
    expect(idsOf(2)).toEqual(idsOf(0));
    expect(onDate(server, TOMORROW)).toHaveLength(100);
    fireEvent.click(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(onDate(server, TOMORROW)).toEqual([]));
  }, 20000);

  it("refuses with nothing ticked in the line above the buttons, sends nothing, and moves nothing in the list", async () => {
    serve(new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250)]));
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openCopy();
    fireEvent.click(box(sheet, "All entries"));
    expect(box(sheet, "Oats")).not.toBeChecked();
    expect(box(sheet, "Quark")).not.toBeChecked();
    const before = aboveTheList(sheet);
    const copy = within(sheet).getByRole("button", { name: "Copy" });

    submit(sheet);
    const all = box(sheet, "All entries");
    await waitFor(() => expect(footerLine(sheet)).toHaveTextContent("Choose at least one entry."));
    expect(footerLine(sheet)).toHaveAttribute("role", "alert");
    expect(all).toHaveAttribute("aria-invalid", "true");
    expect(all).toHaveFocus();
    expect(all).not.toHaveAttribute("aria-describedby");
    // Nothing above the list changed, so the list stays where it was, and Copy is the same button.
    expect(aboveTheList(sheet)).toEqual(before);
    expect(within(sheet).getByRole("button", { name: "Copy" })).toBe(copy);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(copyEntries).not.toHaveBeenCalled();
    expect(openSheet()).toBe(sheet);

    // Ticking one clears the line, and again nothing above the list changes.
    fireEvent.click(box(sheet, "Oats"));
    expect(footerLine(sheet)).toBeEmptyDOMElement();
    expect(all).not.toHaveAttribute("aria-invalid");
    expect(aboveTheList(sheet)).toEqual(before);
    expect(within(sheet).getByRole("button", { name: "Copy" })).toBe(copy);
  });

  it("sends nothing while known offline and says so in the sheet's line", async () => {
    serve(new FakeDays([foodEntry("Oats", 80)]));
    renderDay();
    await screen.findByText("Oats");
    const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    try {
      const sheet = await openCopy();
      submit(sheet);
      await waitFor(() => expect(footerLine(sheet)).toHaveTextContent("You are offline. Changes need a connection."));
      expect(copyEntries).not.toHaveBeenCalled();
    } finally {
      onLine.mockRestore();
      act(() => void window.dispatchEvent(new Event("online")));
    }
  });

  it("counts a press sent while offline as no send: back online, a copy to another date removes nothing", async () => {
    const server = new FakeDays([foodEntry("Oats", 80)]);
    serve(server);
    renderDay();
    await screen.findByText("Oats");
    const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    const sheet = await openCopy();
    submit(sheet);
    await waitFor(() => expect(footerLine(sheet)).toHaveTextContent("You are offline. Changes need a connection."));
    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));

    fireEvent.change(toField(sheet), { target: { value: WEDNESDAY } });
    submit(sheet);
    await waitForToast("Copied 1 entry to Wed 18 Nov.");
    expect(copyCalls().map((c) => c.toDate)).toEqual([WEDNESDAY]);
    expect(removeEntries).not.toHaveBeenCalled();

    // Undo removes the one copy that was sent.
    fireEvent.click(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(removeEntries).toHaveBeenCalledTimes(1));
    expect(jest.mocked(removeEntries).mock.calls[0][0]).toEqual(idsOf(0));
  });

  it("says an entry is gone when another device removed it, and the list shows what is left", async () => {
    const quark = foodEntry("Quark", 250);
    const server = new FakeDays([foodEntry("Oats", 80), quark]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openCopy();
    server.remove(quark.id);
    submit(sheet);
    await waitFor(() => expect(footerLine(sheet)).toHaveTextContent("This entry is no longer there."));
    await waitFor(() => expect(within(sheet).queryByRole("checkbox", { name: "Quark" })).toBeNull());
    expect(onDate(server, TOMORROW)).toEqual([]);
    submit(sheet);
    await waitForToast("Copied 1 entry to tomorrow.");
  });

  it("Cancel after a send that could not confirm reads that send's day again", async () => {
    const server = new FakeDays([foodEntry("Oats", 80)]);
    serve(server);
    const { client } = renderDay();
    await screen.findByText("Oats");
    const sheet = await openCopy();
    await lostFirstSend(server, sheet);
    jest.mocked(getDay).mockClear();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(getDay).toHaveBeenCalledWith(TOMORROW, expect.anything()));
    await waitFor(() => expect(client.getQueryData<Day>(queryKeys.day(TOMORROW))!.entries).toHaveLength(1));
  });

  it("Cancel reads again the week read ahead that holds the copy's day, and no week that does not", async () => {
    const NEXT_MONDAY = "2026-11-23";
    const server = new FakeDays([foodEntry("Oats", 80)]);
    serve(server);
    const { client } = renderDay();
    await screen.findByText("Oats");
    // This week is read with the day. The next is read ahead, as the week sheet does.
    await waitFor(() => expect(client.getQueryData(queryKeys.dayRange(TODAY, "2026-11-22"))).toBeDefined());
    await act(() => client.prefetchQuery(dayRangeQuery(NEXT_MONDAY, "2026-11-29")));
    const nextWeek = () => client.getQueryData<{ days: DaySummary[] }>(queryKeys.dayRange(NEXT_MONDAY, "2026-11-29"))!;
    expect(nextWeek().days[0].entryCount).toBe(0);

    const sheet = await openCopy();
    fireEvent.change(toField(sheet), { target: { value: NEXT_MONDAY } });
    await lostFirstSend(server, sheet);
    jest.mocked(getDaySummaries).mockClear();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(nextWeek().days[0].entryCount).toBe(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const weeksRead = jest.mocked(getDaySummaries).mock.calls.map(([from, to]) => `${from} ${to}`);
    expect(weeksRead).toEqual([`${NEXT_MONDAY} 2026-11-29`]);
  });

  it("copies to the shown day itself after its entries", async () => {
    const server = new FakeDays([foodEntry("Oats", 80)]);
    serve(server);
    renderDay();
    await screen.findByText("Oats");
    const sheet = await openCopy();
    fireEvent.change(toField(sheet), { target: { value: TODAY } });
    submit(sheet);
    await waitForToast("Copied 1 entry to today.");
    await waitFor(() => expect(screen.getAllByText("Oats")).toHaveLength(2));
  });
});
