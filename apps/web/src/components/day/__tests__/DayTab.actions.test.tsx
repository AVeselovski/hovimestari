import { TEST_USER, fakeAuth } from "@/__tests__/helpers/auth";
import { clockFrom } from "@/__tests__/helpers/clock";
import { deferred } from "@/__tests__/helpers/queryClient";
import { TodayProvider } from "@/components/targets/TodayProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useEntryActions, type EntryActions } from "@/hooks/useEntryActions";
import { useToday } from "@/hooks/useToday";
import { getDay } from "@/lib/api/days";
import { patchEntry, removeEntry, restoreEntry, setEntriesStatus } from "@/lib/api/entries";
import { getFood } from "@/lib/api/foods";
import { getTargets } from "@/lib/api/targets";
import { afterTimeZoneChange, beginEntryWrite } from "@/lib/invalidation";
import { queryKeys } from "@/lib/queryKeys";
import { targetsQuery } from "@/lib/queryOptions";
import type { Entry } from "@hovimestari/types";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { EntryList } from "../EntryList";
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
} from "./harness";
import { TODAY, estimateEntry, fakeEntryActions, foodEntry } from "./support";

// The Day tab's writes and undos where they fail, overlap or are held.

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
}));
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/foods", () => ({
  getFood: jest.fn(),
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
}));
// The date in the address follows router.replace, as in the app. A test rerenders to show it.
let mockSearch = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (url: string) => (mockSearch = new URLSearchParams(url.split("?")[1] ?? "")),
    push: jest.fn(),
  }),
  useSearchParams: () => mockSearch,
  usePathname: () => "/",
}));
jest.mock("@/lib/invalidation", () => {
  const actual = jest.requireActual<typeof import("@/lib/invalidation")>("@/lib/invalidation");
  return { ...actual, beginEntryWrite: jest.fn(actual.beginEntryWrite) };
});

const timeout = () =>
  Object.assign(new Error("timeout of 10000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" });

beforeEach(() => {
  mockSearch = new URLSearchParams();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, setEntriesStatus, patchEntry, removeEntry, restoreEntry, getTargets, getFood]) {
    jest.mocked(fn).mockReset();
  }
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
});

async function openSheet(name: string): Promise<HTMLElement> {
  fireEvent.click(within(rowOf(name)).getByRole("button", { name: new RegExp(`^${name}`) }));
  return screen.findByRole("dialog", { name });
}

const mainButton = (name: string) => within(rowOf(name)).getByRole("button", { name: new RegExp(`^${name}`) });

/** A press on a toast's action from the keyboard: a click with no pointer, detail 0. */
const pressFromKeyboard = (button: HTMLElement) => fireEvent.click(button, { detail: 0 });
const pressWithPointer = (button: HTMLElement) => fireEvent.click(button, { detail: 1 });

describe("DayTab, undo that fails", () => {
  it("says why a restore past its window was refused, offers no Try again, and reads the day again", async () => {
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250)]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const quark = server.entries[1];
    const sheet = await openSheet("Quark");
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove entry" }));
    await waitFor(() => expect(rowNames()).toEqual(["Oats"]));
    server.expired.add(quark.id);
    const reads = jest.mocked(getDay).mock.calls.length;
    pressWithPointer(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("This entry is no longer there."));
    expect(within(liveToast()).queryByRole("button")).toBeNull();
    await waitFor(() => expect(jest.mocked(getDay).mock.calls.length).toBeGreaterThan(reads));
  });

  it("says why an undo of a save met an entry another device removed, with no Try again", async () => {
    const server = new FakeDays([foodEntry("Quark", 250, { status: "planned" })]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openSheet("Quark");
    fireEvent.change(within(sheet).getByLabelText("Amount", { selector: "input" }), { target: { value: "300" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("Saved Quark."));
    server.remove(server.entries[0].id);
    pressWithPointer(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("This entry is no longer there."));
    expect(within(liveToast()).queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("answers a restore created and a second one replayed, as the server does", () => {
    const server = new FakeDays([foodEntry("Quark", 250)]);
    const quark = server.entries[0];
    server.remove(quark.id);
    expect(server.restore(quark.id)).toMatchObject({ outcome: "created" });
    expect(server.restore(quark.id)).toMatchObject({ outcome: "replayed" });
  });
});

describe("DayTab, focus after Undo", () => {
  it("after a keyboard Undo of a removal, focuses the row once it is back", async () => {
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250), foodEntry("Banana", 120)]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openSheet("Quark");
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove entry" }));
    await waitFor(() => expect(rowNames()).toEqual(["Oats", "Banana"]));
    pressFromKeyboard(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(rowNames()).toEqual(["Oats", "Quark", "Banana"]));
    await waitFor(() => expect(document.activeElement).toBe(mainButton("Quark")));
  });

  it("after a keyboard Undo of a save, focuses the saved row, not its neighbour", async () => {
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250), foodEntry("Banana", 120)]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openSheet("Quark");
    fireEvent.change(within(sheet).getByLabelText("Amount", { selector: "input" }), { target: { value: "300" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("Saved Quark."));
    mainButton("Banana").focus();
    pressFromKeyboard(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(patchEntry).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.activeElement).toBe(mainButton("Quark")));
  });

  it("moves focus to the row as a keyboard Undo is pressed, before the toast hides, when the row is on screen", async () => {
    serve(new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250, { status: "planned" })]));
    renderDay();
    await screen.findByText("Quark");
    pressWithPointer(screen.getByRole("button", { name: "Mark Quark eaten" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("Marked Quark eaten."));
    // The keyboard reaches the toast from another row.
    mainButton("Oats").focus();
    const undo = within(liveToast()).getByRole("button", { name: "Undo" });
    undo.focus();
    pressFromKeyboard(undo);
    // At once, while the undo is still out: focus never waits in the closing toast.
    expect(document.activeElement).toBe(mainButton("Quark"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark Quark eaten" })).toBeInTheDocument());
    expect(document.activeElement).toBe(mainButton("Quark"));
  });

  it("uses a focus request once: the row it named, shown again later, does not take focus back", async () => {
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250)]);
    serve(server);
    const view = renderDay();
    await screen.findByText("Quark");
    const sheet = await openSheet("Quark");
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove entry" }));
    await waitFor(() => expect(rowNames()).toEqual(["Oats"]));
    pressFromKeyboard(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(document.activeElement).toBe(mainButton("Quark")));
    // Next day, then back: the day's rows mount again.
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    view.rerender(<DayHarness />);
    await screen.findByText("Nothing planned yet.");
    const previous = screen.getByRole("button", { name: "Previous day" });
    previous.focus();
    fireEvent.click(previous);
    view.rerender(<DayHarness />);
    await screen.findByText("Quark");
    expect(document.activeElement).toBe(previous);
  });

  it("leaves focus where it is after an Undo pressed with a pointer", async () => {
    serve(new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250, { status: "planned" })]));
    renderDay();
    await screen.findByText("Quark");
    fireEvent.click(screen.getByRole("button", { name: "Mark Quark eaten" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("Marked Quark eaten."));
    mainButton("Oats").focus();
    pressWithPointer(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark Quark eaten" })).toBeInTheDocument());
    expect(document.activeElement).toBe(mainButton("Oats"));
  });
});

describe("DayTab, overlapping and stale answers", () => {
  it("counts a mark's undo against the entries' date, not the date shown when Undo is pressed", async () => {
    serve(new FakeDays([foodEntry("Quark", 250, { status: "planned" })]));
    const view = renderDay();
    await screen.findByText("Quark");
    fireEvent.click(screen.getByRole("button", { name: "Mark Quark eaten" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("Marked Quark eaten."));
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    view.rerender(<DayHarness />);
    await screen.findByText("Nothing planned yet.");
    jest.mocked(beginEntryWrite).mockClear();
    pressWithPointer(within(liveToast()).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(setEntriesStatus).toHaveBeenLastCalledWith([expect.any(String)], "planned"));
    expect(jest.mocked(beginEntryWrite).mock.calls.map(([, dates]) => dates)).toEqual([[TODAY]]);
  });

  it("reads the day again when two marks overlap and the first answer lands last", async () => {
    const server = new FakeDays([
      foodEntry("Oats", 80, { status: "planned" }),
      foodEntry("Quark", 250, { status: "planned" }),
    ]);
    serve(server);
    renderDay();
    await screen.findByText("Quark");
    const first = deferred<Awaited<ReturnType<typeof setEntriesStatus>>>();
    jest.mocked(setEntriesStatus).mockImplementationOnce(async (ids, status) => {
      // The server stores the first mark at once, but its answer is slow.
      const answer = server.status(ids, status);
      await first.promise;
      return answer;
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark Oats eaten" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark Quark eaten" }));
    await waitFor(() => expect(within(rowOf("Quark")).getByRole("img", { name: "Eaten" })).toBeInTheDocument());
    // The first answer, from before Quark was marked, lands last.
    await act(async () => first.resolve(undefined as never));
    await waitFor(() => expect(within(rowOf("Oats")).getByRole("img", { name: "Eaten" })).toBeInTheDocument());
    await waitFor(() => expect(within(rowOf("Quark")).getByRole("img", { name: "Eaten" })).toBeInTheDocument());
  });
});

describe("DayTab, the toast's name and a failed keyboard mark", () => {
  it("names a renamed estimate by its new name", async () => {
    serve(new FakeDays([estimateEntry("Lunch out", { energyKcal: 700, proteinG: 30, carbsG: 80, fatG: 25 })]));
    renderDay();
    await screen.findByText("Lunch out");
    const sheet = await openSheet("Lunch out");
    fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "Pizza" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("Saved Pizza."));
  });

  it("does not take focus to a row whose keyboard mark failed, when it is marked later", async () => {
    const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250, { status: "planned" })]);
    serve(server);
    const { client } = renderDay();
    await screen.findByText("Quark");
    jest.mocked(setEntriesStatus).mockRejectedValueOnce(timeout());
    const mark = screen.getByRole("button", { name: "Mark Quark eaten" });
    mark.focus();
    fireEvent.click(mark, { detail: 0 });
    await waitFor(() => expect(liveToast()).toHaveTextContent("Could not confirm."));
    mainButton("Oats").focus();
    // Marked eaten later on another device, and read again.
    server.entries[1].status = "eaten";
    act(() => client.setQueryData(queryKeys.day(TODAY), server.day(TODAY)));
    await waitFor(() => expect(within(rowOf("Quark")).getByRole("img", { name: "Eaten" })).toBeInTheDocument());
    expect(document.activeElement).toBe(mainButton("Oats"));
  });
});

describe("DayTab, Mark all eaten that fails partway", () => {
  it("sends exactly the failed chunk and the unsent ones on Try again, counts every changed id, and its Undo takes back all of them", async () => {
    const planned = Array.from({ length: 250 }, (_, i) => foodEntry(`Food ${i}`, 10, { status: "planned" }));
    const server = new FakeDays(planned);
    serve(server);
    let call = 0;
    jest.mocked(setEntriesStatus).mockImplementation(async (ids, status) => {
      call += 1;
      if (call === 2) throw timeout();
      return server.status(ids, status);
    });
    renderDay();
    await screen.findByText("Food 249");
    fireEvent.click(screen.getByRole("button", { name: "Mark all eaten" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("Could not confirm."));
    const ids = planned.map((e) => e.id);
    // Recorded as it appears: under load, rendering 250 rows can take longer than a toast stays on screen.
    const toasts = recordToasts();
    try {
      pressWithPointer(within(liveToast()).getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(toasts.shown.at(-1)).toContain("Marked 250 entries eaten."), { timeout: 30_000 });
    } finally {
      toasts.stop();
    }
    const success = toasts.elements.at(-1)!;
    const sent = jest.mocked(setEntriesStatus).mock.calls.map(([chunk]) => chunk);
    expect(sent).toEqual([ids.slice(0, 100), ids.slice(100, 200), ids.slice(100, 200), ids.slice(200)]);
    // The success's Undo covers every changed id, the first chunk's included.
    pressWithPointer(within(success).getByRole("button", { name: "Undo", hidden: true }));
    await waitFor(() => expect(document.querySelectorAll('[data-mark="button"]')).toHaveLength(250), {
      timeout: 10_000,
    });
    const back = jest.mocked(setEntriesStatus).mock.calls.filter(([, status]) => status === "planned");
    expect(back.flatMap(([chunk]) => chunk)).toEqual(ids);
    // 250 rows render four times over: about 6.5 s alone, several times that on a loaded machine.
  }, 90_000);
});

describe("DayTab while the app asks for today", () => {
  // The device's clock reads the fixture's day, so the check at mount finds
  // nothing ahead and no ask runs before the test starts its own. Without
  // this the suite was bound to the real date being the fixture's.
  beforeEach(() => clockFrom(`${TODAY}T12:00:00Z`));
  /** The device's date runs a day ahead, and the ask it starts gets no answer: writes hold. */
  function holdToday(): void {
    clockFrom("2026-11-17T12:00:00Z");
    jest.mocked(getTargets).mockReturnValue(new Promise(() => {}));
    act(() => void window.dispatchEvent(new Event("pageshow")));
  }
  afterEach(() => jest.restoreAllMocks());

  it("keeps the entry sheet open and sends nothing on Save or Remove entry", async () => {
    serve(new FakeDays([foodEntry("Quark", 250)]));
    renderDay();
    await screen.findByText("Quark");
    const sheet = await openSheet("Quark");
    fireEvent.change(within(sheet).getByLabelText("Amount", { selector: "input" }), { target: { value: "300" } });
    holdToday();
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove entry" }));
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Quark" })).toBe(sheet);
    expect(within(sheet).getByLabelText("Amount", { selector: "input" })).toHaveValue("300");
    expect(patchEntry).not.toHaveBeenCalled();
    expect(removeEntry).not.toHaveBeenCalled();
  });

  it("answers held from save and remove themselves, and sends nothing", async () => {
    const server = new FakeDays([foodEntry("Quark", 250)]);
    serve(server);
    const client = seededClient();
    const { result } = renderHook(() => useEntryActions(TODAY), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          <TodayProvider>
            <ToastProvider>{children}</ToastProvider>
          </TodayProvider>
        </QueryClientProvider>
      ),
    });
    // The first targets read answers before the ask starts: an ask that joined it would end with its answer.
    await waitFor(() => expect(client.isFetching()).toBe(0));
    holdToday();
    await waitFor(() => expect(result.current.holding).toBe(true));
    const quark = server.entries[0];
    await expect(result.current.save(quark, { amount: { grams: 300 } })).resolves.toBe("held");
    await expect(result.current.remove(quark)).resolves.toBe("held");
    expect(patchEntry).not.toHaveBeenCalled();
    expect(removeEntry).not.toHaveBeenCalled();
  });
});

describe("DayTab across a time zone change", () => {
  afterEach(() => jest.restoreAllMocks());

  it("does not let a write sent before a westward zone change move today forward again when it lands after it", async () => {
    // 05:00 on 17 Nov in Helsinki is 22:00 on 16 Nov in New York.
    clockFrom("2026-11-17T03:00:00Z");
    const server = new FakeDays([foodEntry("Quark", 250, { status: "planned", date: "2026-11-17" })]);
    server.today = "2026-11-17";
    serve(server);
    const client = seededClient("2026-11-17");
    client.setQueryData(queryKeys.me(), TEST_USER);
    // The targets read on screen, as the app always has one, so the zone change reads it again.
    const { result } = renderHook(
      () => ({ actions: useEntryActions("2026-11-17"), today: useToday().today, targets: useQuery(targetsQuery()) }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>
            <TodayProvider>
              <ToastProvider>{children}</ToastProvider>
            </TodayProvider>
          </QueryClientProvider>
        ),
      },
    );
    expect(result.current.today).toBe("2026-11-17");
    // The mark is out, and answers late, with the old zone's today.
    const late = deferred<Awaited<ReturnType<typeof setEntriesStatus>>>();
    jest.mocked(setEntriesStatus).mockImplementationOnce(async (ids, status) => {
      const answer = server.status(ids, status);
      await late.promise;
      return answer;
    });
    let marked: Promise<boolean> = Promise.resolve(false);
    act(() => void (marked = result.current.actions.markOne(server.entries[0])));
    // The zone changes to New York while it is out: the server's today is now 16 Nov.
    server.today = "2026-11-16";
    await act(async () => afterTimeZoneChange(client, { ...TEST_USER, timeZone: "America/New_York" }));
    await waitFor(() => expect(result.current.today).toBe("2026-11-16"));
    await act(async () => {
      late.resolve(undefined as never);
      await marked;
    });
    await act(async () => {});
    expect(result.current.today).toBe("2026-11-16");
  });
});

describe("EntryList while the app asks for today", () => {
  const heldActions = (): EntryActions =>
    fakeEntryActions({
      holding: true,
      markOne: jest.fn().mockResolvedValue(false),
      markAll: jest.fn().mockResolvedValue(false),
    });

  it("draws every mark and Mark all eaten unavailable, and a press sends nothing", () => {
    const entries: Entry[] = [
      foodEntry("Oats", 80, { status: "planned" }),
      foodEntry("Quark", 250, { status: "planned" }),
    ];
    const actions = heldActions();
    render(<EntryList entries={entries} future={false} actions={actions} onOpen={jest.fn()} onCopy={jest.fn()} />);
    const markAll = screen.getByRole("button", { name: "Mark all eaten" });
    expect(markAll).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(markAll);
    for (const name of ["Oats", "Quark"]) {
      const mark = screen.getByRole("button", { name: `Mark ${name} eaten` });
      expect(mark).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(mark);
    }
    expect(actions.markAll).not.toHaveBeenCalled();
    expect(actions.markOne).not.toHaveBeenCalled();
  });
});
