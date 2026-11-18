import { fakeAuth } from "@/__tests__/helpers/auth";
import { deferred } from "@/__tests__/helpers/queryClient";
import { change, overview } from "@/components/targets/__tests__/support";
import { useAuth } from "@/contexts/AuthContext";
import { getDay } from "@/lib/api/days";
import { patchEntry, removeEntry, restoreEntry, setEntriesStatus } from "@/lib/api/entries";
import { getFood } from "@/lib/api/foods";
import { getTargets } from "@/lib/api/targets";
import { afterEntryWrite } from "@/lib/invalidation";
import { formatDay } from "@/lib/localDate";
import type { Day } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { FakeDays, renderDay, rowOf, seededClient, serve } from "./harness";
import { TODAY, foodEntry } from "./support";

// The Day tab on a day without targets: a day before the user's first
// change. A normal day, never a failed load. The summary's frame predicts
// the layout from the changes the gate holds, so nothing shrinks as the day
// answers.

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
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/",
}));

/** The user's only change starts after today. */
const LATER = [change("2026-11-20", [1900, 2200], [140, 180])];

beforeEach(() => {
  searchParams = new URLSearchParams();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, setEntriesStatus, patchEntry, removeEntry, restoreEntry, getTargets, getFood]) {
    jest.mocked(fn).mockReset();
  }
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
});

/** Which of the rows that set the summary's height are there, and how many of each. */
const rows = () =>
  ["[data-gauge]", "[data-distance]", "[data-reserved]", "[data-targets-row]"].map(
    (selector) => [selector, document.querySelectorAll(`[data-day-summary] ${selector}`).length] as const,
  );

function serverWith(changes = LATER): FakeDays {
  const server = new FakeDays([foodEntry("Oats", 80), foodEntry("Quark", 250, { status: "planned" })]);
  server.changes = changes;
  serve(server);
  return server;
}

describe("DayTab, a day without targets", () => {
  it("shows the day, its figures and the start line, never a failed load", async () => {
    serverWith();
    renderDay(seededClient(TODAY, LATER));
    await screen.findByText("Quark");
    expect(screen.queryByText("This day did not load.")).toBeNull();
    const line = document.querySelector("[data-targets-row]");
    expect(line).toHaveAttribute("data-targets-row", "from");
    expect(line).toHaveTextContent(`Targets apply from ${formatDay("2026-11-20")}.`);
    expect(document.querySelector("[data-day-summary] [data-gauge]")).toBeNull();
    const calories = document.querySelector('[data-summary-macro="energy"]')!;
    expect([...calories.querySelectorAll("[data-reading]")].map((r) => r.textContent)).toEqual([
      "Eaten47 kcal",
      "With plan195 kcal",
    ]);
  });

  it("opens with the frame of a day without targets, the same rows as the loaded day, also after a mark and an add", async () => {
    const server = serverWith();
    const answer = deferred<Day>();
    jest.mocked(getDay).mockImplementationOnce(() => answer.promise);
    const { client } = renderDay(seededClient(TODAY, LATER));
    await waitFor(() => expect(getDay).toHaveBeenCalled());
    // Loading: no gauge track to shrink away, and the line already there.
    expect(document.querySelector("[data-day-summary]")).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector('[data-gauge="frame"]')).toBeNull();
    expect(document.querySelector("[data-targets-row]")).toHaveTextContent(
      `Targets apply from ${formatDay("2026-11-20")}.`,
    );
    const frame = rows();

    answer.resolve(server.day(TODAY));
    await screen.findByText("Quark");
    expect(rows()).toEqual(frame);

    fireEvent.click(screen.getByRole("button", { name: "Mark Quark eaten" }));
    await waitFor(() => expect(within(rowOf("Quark")).getByRole("img", { name: "Eaten" })).toBeInTheDocument());
    expect(rows()).toEqual(frame);

    // An add lands as the log sheet's does: its answered day goes into the cache.
    server.entries.push(foodEntry("Rye bread", 60));
    await act(async () => {
      await afterEntryWrite(client, [server.day(TODAY)], TODAY);
    });
    await screen.findByText("Rye bread");
    expect(rows()).toEqual(frame);
  });

  it("opens with the gauges' frame on a day the targets cover, and keeps their rows when it answers", async () => {
    const server = serverWith([change("2026-11-01", [1900, 2200], [140, 180])]);
    const answer = deferred<Day>();
    jest.mocked(getDay).mockImplementationOnce(() => answer.promise);
    renderDay(seededClient(TODAY, server.changes));
    await waitFor(() => expect(getDay).toHaveBeenCalled());
    expect(document.querySelectorAll('[data-gauge="frame"]')).toHaveLength(2);
    expect(document.querySelector("[data-targets-row]")).toBeNull();
    const frame = rows();
    answer.resolve(server.day(TODAY));
    await screen.findByText("Quark");
    expect(document.querySelector('[data-gauge="energy"]')).not.toBeNull();
    expect(rows()).toEqual(frame);
  });

  it("holds the row empty and reads the targets again once when the day and the cached changes disagree", async () => {
    // The cache says a change covers today. The server, which another device
    // has told otherwise, says the day has none and the only change is later.
    serverWith();
    const stale = [change("2026-11-01")];
    const client = seededClient(TODAY, stale);
    // The provider's own ask as it mounts answers with the stale changes, so
    // only the Day tab's read for the date can bring the fresh ones.
    const targets = deferred<ReturnType<typeof overview>>();
    jest
      .mocked(getTargets)
      .mockResolvedValueOnce(overview(stale))
      .mockImplementationOnce(() => targets.promise);
    renderDay(client);
    await screen.findByText("Quark");
    const row = document.querySelector<HTMLElement>("[data-targets-row]")!;
    expect(row).toHaveAttribute("data-targets-row", "pending");
    expect(row.textContent).toBe("");
    expect(document.querySelector("[data-day-summary] [data-gauge]")).toBeNull();
    // The Day tab reads as soon as the day answers. A shorter wait than the
    // test's own timeout, so a missing read fails here, by its count.
    await waitFor(() => expect(getTargets).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(row).toHaveAttribute("data-targets-row", "pending");
    expect(row.textContent).toBe("");

    targets.resolve(overview(LATER));
    await waitFor(() => expect(row).toHaveAttribute("data-targets-row", "from"));
    expect(row).toHaveTextContent(`Targets apply from ${formatDay("2026-11-20")}.`);
    expect(document.querySelector("[data-targets-row]")).toBe(row);
    expect(getTargets).toHaveBeenCalledTimes(2);
  });

  it("never shows a wrong line: a refetch that still disagrees keeps the row empty, and reads only once", async () => {
    serverWith();
    const stale = [change("2026-11-01")];
    jest.mocked(getTargets).mockResolvedValue(overview(stale));
    renderDay(seededClient(TODAY, stale));
    await screen.findByText("Quark");
    // The provider's own ask as it mounts, and the Day tab's one read for the date.
    await waitFor(() => expect(getTargets).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 100));
    const row = document.querySelector("[data-targets-row]")!;
    expect(row).toHaveAttribute("data-targets-row", "pending");
    expect(row.textContent).toBe("");
    expect(getTargets).toHaveBeenCalledTimes(2);
  });

  it("shows a past day before the first change the same way, with the line naming the first change", async () => {
    const server = new FakeDays([foodEntry("Oats", 80, { date: "2026-11-10" })]);
    server.changes = [change("2026-11-12"), change("2026-11-30")];
    serve(server);
    searchParams = new URLSearchParams("date=2026-11-10");
    renderDay(seededClient(TODAY, server.changes));
    await screen.findByText("Oats");
    expect(document.querySelector("[data-targets-row]")).toHaveTextContent(
      `Targets apply from ${formatDay("2026-11-12")}.`,
    );
    expect(screen.queryByText("This day did not load.")).toBeNull();
  });

  describe("a user with no targets at all", () => {
    it("shows Set targets where the gauges would be, in the frame and on the loaded day, and never the start line", async () => {
      const server = serverWith([]);
      const answer = deferred<Day>();
      jest.mocked(getDay).mockImplementationOnce(() => answer.promise);
      renderDay(seededClient(TODAY, []));
      await waitFor(() => expect(getDay).toHaveBeenCalled());
      expect(document.querySelector('[data-gauge="frame"]')).toBeNull();
      const row = document.querySelector("[data-targets-row]")!;
      expect(row).toHaveAttribute("data-targets-row", "none");
      const button = within(row as HTMLElement).getByRole("button", { name: "Set targets" });
      const frame = rows();

      answer.resolve(server.day(TODAY));
      await screen.findByText("Quark");
      expect(rows()).toEqual(frame);
      expect(within(document.querySelector("[data-targets-row]") as HTMLElement).getByRole("button")).toBe(button);
      expect(screen.queryByText(/Targets apply from/)).toBeNull();
      expect(screen.queryByText("This day did not load.")).toBeNull();
      // No second read of the targets: the cache and the day agree.
      expect(getTargets).toHaveBeenCalledTimes(1);
    });

    it("never shows Set targets to a user with a change, on a day before it or on a day it covers", async () => {
      serverWith();
      renderDay(seededClient(TODAY, LATER));
      await screen.findByText("Quark");
      expect(screen.queryByRole("button", { name: "Set targets" })).toBeNull();
    });
  });
});
