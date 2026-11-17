import { fakeAuth } from "@/__tests__/helpers/auth";
import { controlSheetAnimations } from "@/__tests__/sheet";
import { renderDay, rowNames, seededClient } from "@/components/day/__tests__/harness";
import { STATUS_MESSAGE_MS } from "@/components/log/StatusLine";
import { useAuth } from "@/contexts/AuthContext";
import { getDay } from "@/lib/api/days";
import { addEntry, removeEntry } from "@/lib/api/entries";
import { getFavouriteFoods, getFood, getOwnFoods } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { addDays } from "@/lib/localDate";
import { PENDING_ID_LIFE_MS } from "@/lib/pendingIds";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import type { AddEntryBody } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  TODAY,
  favouritesOf,
  logWorld,
  loosely,
  openLogSheet,
  ownFoods,
  plus,
  statusLine,
  timeout,
} from "./logHarness";

// The log sheet's "+": a recent item or a favourite logged again in one press,
// from the real Day tab, against a fake that answers an add as the server
// does (components/day/__tests__/harness.tsx).

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn() }));
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
  setFavourite: jest.fn(),
}));
let searchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/",
}));

let world: ReturnType<typeof logWorld>;
beforeEach(() => {
  searchParams = new URLSearchParams();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, addEntry, removeEntry, getRecents, getFavouriteFoods, getOwnFoods, getFood]) {
    jest.mocked(fn).mockReset();
  }
  world = logWorld();
  jest.mocked(getFavouriteFoods).mockResolvedValue(favouritesOf(world));
  jest.mocked(getOwnFoods).mockResolvedValue(ownFoods());
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
});

/** A client with the app's freshness (`makeQueryClient`): a read is fresh for 30 seconds. */
function appClient(): QueryClient {
  const client = seededClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, staleTime: STALE.live } });
  return client;
}

const sent = (): AddEntryBody[] => jest.mocked(addEntry).mock.calls.map(([body]) => body);
const QUARK_AGAIN = "Log Quark again, 250 g";

describe("The log sheet's lists", () => {
  it("opens with the recent items, favourites and your foods already read, and sends no read for them", async () => {
    renderDay(appClient());
    await screen.findByText("Oats");
    await waitFor(() => expect(getRecents).toHaveBeenCalledTimes(1));
    expect(getFavouriteFoods).toHaveBeenCalledTimes(1);
    expect(getOwnFoods).toHaveBeenCalledTimes(1);
    const dialog = await openLogSheet();
    expect(within(dialog).getByRole("region", { name: "Recent" })).toHaveTextContent("Last 250 g");
    expect(within(dialog).getByRole("region", { name: "Favourites" })).toHaveTextContent("Last 80 g");
    expect(within(dialog).getByRole("region", { name: "Your foods" })).toHaveTextContent("Rye bread");
    expect(getRecents).toHaveBeenCalledTimes(1);
    expect(getFavouriteFoods).toHaveBeenCalledTimes(1);
    expect(getOwnFoods).toHaveBeenCalledTimes(1);
  });

  it("names each '+' for what it adds, a portion with its weight and a meal by its count", async () => {
    renderDay(appClient());
    await openLogSheet();
    expect(plus(QUARK_AGAIN)).toBeInTheDocument();
    expect(plus("Log Banana again, 2 × Piece · 110 g")).toBeInTheDocument();
    expect(plus("Log Shake again, 1 meal")).toBeInTheDocument();
    expect(plus("Log Oats again, 80 g")).toBeInTheDocument();
  });
});

describe("The log sheet's '+'", () => {
  it("logs a recent item in exactly two presses from the Day tab, and the row and both totals come from the answer", async () => {
    const { client } = renderDay(appClient());
    await screen.findByText("Oats");
    const before = client.getQueryData<{ eaten: { figures: { energyKcal: number } } }>(queryKeys.day(TODAY))!;
    const reads = jest.mocked(getDay).mock.calls.length;
    // Press 1: the launcher. Press 2: the "+".
    fireEvent.click(screen.getByRole("button", { name: "Log food" }));
    fireEvent.click(await screen.findByRole("button", { name: loosely(QUARK_AGAIN) }));
    await screen.findByText("Logged Quark, 250 g.");
    expect(sent()).toEqual([
      expect.objectContaining({
        kind: "food",
        foodId: world.quark.id,
        amount: { grams: 250 },
        date: TODAY,
        status: "eaten",
      }),
    ]);
    expect(rowNames()).toEqual(["Oats", "Quark"]);
    const after = client.getQueryData<typeof before>(queryKeys.day(TODAY))!;
    expect(after.eaten.figures.energyKcal).toBeGreaterThan(before.eaten.figures.energyKcal);
    expect(jest.mocked(getDay).mock.calls.length).toBe(reads);
  });

  it("sends a portion count when the last portion still exists, and its grams when it is gone", async () => {
    world.server.recents = [
      world.server.recents[1],
      {
        kind: "food",
        food: world.quark,
        last: { grams: 150, portion: { id: null, unit: null, name: "Pot", count: 1 } },
      },
    ];
    renderDay(appClient());
    await openLogSheet();
    fireEvent.click(plus("Log Banana again, 2 × Piece · 110 g"));
    await screen.findByText(/^Logged Banana/);
    expect(sent()[0]).toMatchObject({ amount: { portionId: world.pieceId, count: 2 } });
    await openLogSheet();
    fireEvent.click(plus("Log Quark again, 150 g"));
    await screen.findByText("Logged Quark, 150 g.");
    expect(sent()[1]).toMatchObject({ amount: { grams: 150 } });
  });

  it("closes the sheet as the answer lands, the '+' busy as it slides out, and a second press adds nothing", async () => {
    renderDay(appClient());
    await openLogSheet();
    const button = plus(QUARK_AGAIN);
    fireEvent.click(button);
    await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(1));
    // Closing at once: no wait after the answer. The closing sheet's backdrop
    // swallows a second tap in a browser (components/ui/closingSheet.ts).
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log food" })).toBeNull());
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    await screen.findByText("Logged Quark, 250 g.");
    expect(addEntry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Log food" })).toHaveFocus();
  });

  it("shows the toast only once the sheet has slid out", async () => {
    const animations = controlSheetAnimations();
    try {
      renderDay(appClient());
      await screen.findByText("Oats");
      fireEvent.click(screen.getByRole("button", { name: "Log food" }));
      await act(async () => animations.finish());
      fireEvent.click(await screen.findByRole("button", { name: loosely(QUARK_AGAIN) }));
      // The sheet is sliding out, its exit held.
      await waitFor(() => expect(document.querySelector("[role=dialog][data-ending-style]")).not.toBeNull());
      expect(screen.queryByText("Logged Quark, 250 g.")).toBeNull();
      // Each round of exit animations ends; no toast while any part of the sheet is on screen.
      while (document.querySelector("[role=dialog][aria-modal=true]")) {
        expect(document.querySelector("[data-toast]")).toBeNull();
        await act(async () => animations.finish());
        await act(() => new Promise((r) => setTimeout(r, 50)));
      }
      expect(await screen.findByText("Logged Quark, 250 g.")).toBeInTheDocument();
    } finally {
      animations.restore();
    }
  }, 15000);

  it("undoes an add by removing it, and an entry already gone counts as undone", async () => {
    renderDay(appClient());
    await openLogSheet();
    fireEvent.click(plus(QUARK_AGAIN));
    await screen.findByText("Logged Quark, 250 g.");
    const id = sent()[0].id;
    jest.mocked(removeEntry).mockImplementationOnce(async (removed) => {
      world.server.remove(removed);
      throw Object.assign(new Error("404"), {
        isAxiosError: true,
        response: { status: 404, data: { code: "entry_not_found" } },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(rowNames()).toEqual(["Oats"]));
    expect(removeEntry).toHaveBeenCalledWith(id);
    expect(screen.queryByText("This entry is no longer there.")).toBeNull();
    expect(screen.queryByText("Could not undo.")).toBeNull();
  });

  it("after a timeout says so on the status line, and the next press resends the same id", async () => {
    jest.mocked(addEntry).mockRejectedValueOnce(timeout());
    renderDay(appClient());
    await openLogSheet();
    fireEvent.click(plus(QUARK_AGAIN));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm. Try again."));
    expect(screen.getByRole("dialog", { name: "Log food" })).toBeInTheDocument();
    fireEvent.pointerDown(plus(QUARK_AGAIN));
    expect(statusLine()).toHaveTextContent("Logging to today");
    fireEvent.click(plus(QUARK_AGAIN));
    await screen.findByText("Logged Quark, 250 g.");
    expect(sent()).toHaveLength(2);
    expect(sent()[1].id).toBe(sent()[0].id);
  });

  it("sends nothing while offline and says so on the status line until the next keystroke", async () => {
    renderDay(appClient());
    await openLogSheet();
    const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    try {
      fireEvent.click(plus(QUARK_AGAIN));
      await waitFor(() => expect(statusLine()).toHaveTextContent("You are offline."));
      expect(addEntry).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByLabelText("Search foods and meals"), { key: "a" });
      expect(statusLine()).toHaveTextContent("Logging to today");
    } finally {
      onLine.mockRestore();
      act(() => void window.dispatchEvent(new Event("online")));
    }
  });

  it("logs the morning shake whose answer was lost once, and a second shake in the afternoon", async () => {
    // The morning: the add lands, its answer is lost.
    jest.mocked(addEntry).mockImplementationOnce(async (body) => {
      world.server.add(body);
      throw timeout();
    });
    const { client } = renderDay(appClient());
    await openLogSheet();
    fireEvent.click(plus("Log Shake again, 1 meal"));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm."));
    const morning = sent()[0].id;
    // The day is read again and holds that id: the add landed.
    await act(() => client.refetchQueries({ queryKey: queryKeys.day(TODAY) }));
    await waitFor(() =>
      expect(
        client.getQueryData<{ entries: { id: string }[] }>(queryKeys.day(TODAY))!.entries.map((e) => e.id),
      ).toContain(morning),
    );
    // The afternoon, long after the failure line ended: a new id, a second shake.
    const now = jest.spyOn(Date, "now").mockReturnValue(Date.now() + STATUS_MESSAGE_MS + 1);
    try {
      fireEvent.click(plus("Log Shake again, 1 meal"));
      await screen.findByText("Logged Shake, 1 meal.");
    } finally {
      now.mockRestore();
    }
    expect(sent()[1].id).not.toBe(morning);
    expect(rowNames()).toEqual(["Oats", "Shake", "Shake"]);
  });

  it("keeps the id while the failure line shows: a day read holds it, and Try again says Already logged", async () => {
    jest.mocked(addEntry).mockImplementationOnce(async (body) => {
      world.server.add(body);
      throw timeout();
    });
    const { client } = renderDay(appClient());
    await openLogSheet();
    fireEvent.click(plus("Log Shake again, 1 meal"));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm."));
    const morning = sent()[0].id;
    await act(() => client.refetchQueries({ queryKey: queryKeys.day(TODAY) }));
    await waitFor(() =>
      expect(
        client.getQueryData<{ entries: { id: string }[] }>(queryKeys.day(TODAY))!.entries.map((e) => e.id),
      ).toContain(morning),
    );
    // Try again, the line still on screen: the same id, answered as a replay.
    fireEvent.click(plus("Log Shake again, 1 meal"));
    await screen.findByText("Already logged Shake.");
    expect(sent()[1].id).toBe(morning);
    expect(rowNames()).toEqual(["Oats", "Shake"]);
  });

  it("lets a confirmed '+' go of its id: the same item again adds a second entry with a new id", async () => {
    renderDay(appClient());
    await openLogSheet();
    fireEvent.click(plus("Log Shake again, 1 meal"));
    await screen.findByText("Logged Shake, 1 meal.");
    await openLogSheet();
    fireEvent.click(plus("Log Shake again, 1 meal"));
    await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(rowNames()).toEqual(["Oats", "Shake", "Shake"]));
    expect(sent()[1].id).not.toBe(sent()[0].id);
  });

  it("lets go of a lost add's id once another add's answer holds it and the failure line has ended", async () => {
    jest.mocked(addEntry).mockImplementationOnce(async (body) => {
      world.server.add(body);
      throw timeout();
    });
    renderDay(appClient());
    await openLogSheet();
    fireEvent.click(plus("Log Shake again, 1 meal"));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm."));
    const lost = sent()[0].id;
    // Another add answers the day, which holds the lost shake.
    fireEvent.click(plus(QUARK_AGAIN));
    await screen.findByText("Logged Quark, 250 g.");
    expect(rowNames()).toEqual(["Oats", "Shake", "Quark"]);
    // Within the minute, but after the failure line: the shake is known to have landed.
    const now = jest.spyOn(Date, "now").mockReturnValue(Date.now() + STATUS_MESSAGE_MS + 1);
    try {
      await openLogSheet();
      fireEvent.click(plus("Log Shake again, 1 meal"));
      await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(3));
    } finally {
      now.mockRestore();
    }
    expect(sent()[2].id).not.toBe(lost);
    await waitFor(() => expect(rowNames()).toEqual(["Oats", "Shake", "Quark", "Shake"]));
    // Three adds and two sheet opens: over 5 s on a loaded machine.
  }, 20_000);

  it("sends a new id after entry_id_taken, which the same id can never get past", async () => {
    jest.mocked(addEntry).mockRejectedValueOnce(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: { status: 409, data: { code: "entry_id_taken" } },
      }),
    );
    renderDay(appClient());
    await openLogSheet();
    fireEvent.click(plus(QUARK_AGAIN));
    await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(plus(QUARK_AGAIN)).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(plus(QUARK_AGAIN));
    await screen.findByText("Logged Quark, 250 g.");
    expect(sent()[1].id).not.toBe(sent()[0].id);
  });

  it("mints a new id once the unconfirmed one is a minute old, even with no day read since", async () => {
    jest.mocked(addEntry).mockRejectedValueOnce(timeout());
    const now = jest.spyOn(Date, "now");
    try {
      renderDay(appClient());
      await openLogSheet();
      fireEvent.click(plus(QUARK_AGAIN));
      await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm."));
      const t0 = Date.now();
      now.mockReturnValue(t0 + PENDING_ID_LIFE_MS);
      fireEvent.click(plus(QUARK_AGAIN));
      await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(2));
      expect(sent()[1].id).not.toBe(sent()[0].id);
    } finally {
      now.mockRestore();
    }
  });

  it("says a replay plainly, and Log another adds again with a fresh id", async () => {
    // The first press landed and its answer was lost: the second press replays it.
    jest.mocked(addEntry).mockImplementationOnce(async (body) => {
      world.server.add(body);
      throw timeout();
    });
    renderDay(appClient());
    await openLogSheet();
    fireEvent.click(plus(QUARK_AGAIN));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm."));
    fireEvent.click(plus(QUARK_AGAIN));
    await screen.findByText("Already logged Quark.");
    expect(sent()[1].id).toBe(sent()[0].id);
    fireEvent.click(screen.getByRole("button", { name: "Log another" }));
    await screen.findByText("Logged Quark, 250 g.");
    expect(sent()[2].id).not.toBe(sent()[0].id);
    expect(rowNames()).toEqual(["Oats", "Quark", "Quark"]);
  });

  it("says when the replayed add was removed since, and offers to log another", async () => {
    jest.mocked(addEntry).mockImplementationOnce(async (body) => {
      world.server.add(body);
      world.server.remove(body.id);
      throw timeout();
    });
    renderDay(appClient());
    await openLogSheet();
    fireEvent.click(plus(QUARK_AGAIN));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm."));
    fireEvent.click(plus(QUARK_AGAIN));
    await screen.findByText("This was removed. Log another?");
    fireEvent.click(screen.getByRole("button", { name: "Log another" }));
    await screen.findByText("Logged Quark, 250 g.");
  });

  it("plans on a future day, and a replay there says the item is already in the plan", async () => {
    const tomorrow = addDays(TODAY, 1);
    searchParams = new URLSearchParams(`date=${tomorrow}`);
    jest.mocked(addEntry).mockImplementationOnce(async (body) => {
      world.server.add(body);
      throw timeout();
    });
    renderDay(appClient());
    await openLogSheet(/^Add to plan$/);
    expect(statusLine()).toHaveTextContent("Planning for tomorrow");
    fireEvent.click(plus("Plan Quark, 250 g"));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm."));
    fireEvent.click(plus("Plan Quark, 250 g"));
    await screen.findByText("Quark is already in the plan.");
    expect(sent()[0]).toMatchObject({ date: tomorrow, status: "planned" });
    fireEvent.click(screen.getByRole("button", { name: "Plan another" }));
    await screen.findByText("Added Quark to the plan.");
    expect(sent()[2]).toMatchObject({ date: tomorrow, status: "planned" });
  });

  it("left open across midnight, reads Logging to yesterday and logs to the date it opened with", async () => {
    const { client } = renderDay(appClient());
    await openLogSheet();
    expect(statusLine()).toHaveTextContent("Logging to today");
    // The server's midnight: the next answer carries the new today.
    world.server.today = addDays(TODAY, 1);
    await act(() => client.refetchQueries({ queryKey: queryKeys.day(TODAY) }));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Logging to yesterday"));
    fireEvent.click(plus(QUARK_AGAIN));
    await screen.findByText("Logged Quark, 250 g.");
    expect(sent()[0]).toMatchObject({ date: TODAY, status: "eaten" });
  });
});
