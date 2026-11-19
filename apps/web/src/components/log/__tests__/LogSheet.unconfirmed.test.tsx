import { fakeAuth } from "@/__tests__/helpers/auth";
import { renderDay, rowNames } from "@/components/day/__tests__/harness";
import { useAuth } from "@/contexts/AuthContext";
import { getDay } from "@/lib/api/days";
import { addEntry, removeEntry } from "@/lib/api/entries";
import { getFavouriteFoods, getFood, getOwnFoods } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { getSavedMeals, saveAndLog } from "@/lib/api/savedMeals";
import type { AddEntryBody } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { TODAY, favouritesOf, logWorld, openLogSheet, ownFoods, plus, statusLine, timeout } from "./logHarness";

// An add that could not confirm reads its day again (useAddActions), so an
// entry that did land shows on the Day tab with its totals at once. The real
// Day tab against the fake server of components/day/__tests__/harness.tsx.

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn() }));
jest.mock("@/lib/api/savedMeals", () => ({
  getSavedMeals: jest.fn(),
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
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

let world: ReturnType<typeof logWorld>;
beforeEach(() => {
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, addEntry, removeEntry, getRecents, getFavouriteFoods, getOwnFoods, getFood, saveAndLog]) {
    jest.mocked(fn).mockReset();
  }
  jest.mocked(getSavedMeals).mockReset().mockResolvedValue({ meals: [] });
  world = logWorld();
  jest.mocked(getFavouriteFoods).mockResolvedValue(favouritesOf(world));
  jest.mocked(getOwnFoods).mockResolvedValue(ownFoods());
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
});

const QUARK_AGAIN = "Log Quark again, 250 g";
const sent = (): AddEntryBody[] => jest.mocked(addEntry).mock.calls.map(([body]) => body);
const dayReads = (): number => jest.mocked(getDay).mock.calls.filter(([date]) => date === TODAY).length;
/** The Day tab's rows under the open sheet, by name: the modal hides them from role queries. */
const dayRows = (): string[] =>
  [...document.querySelectorAll("li[data-entry-id] .line-clamp-2")].map((el) => el.textContent ?? "");
/** The Day tab's energy figure in one reading, as it reads on screen. */
const energy = (which: "eaten" | "withPlan"): string =>
  document.querySelector(`[data-summary-macro="energy"] [data-reading="${which}"] dd`)?.textContent ?? "";
const kcalOnServer = (which: "eaten" | "withPlan"): string =>
  String(Math.round(world.server.day(TODAY)[which].figures.energyKcal));

/** The add lands on the server and its answer is lost. */
function addLandsUnanswered(): void {
  jest.mocked(addEntry).mockImplementationOnce(async (body) => {
    world.server.add(body);
    throw timeout();
  });
}

describe("An add that could not confirm", () => {
  // Longer than the 5 s wait of setup.ts, so a wait that fails says what it waited for.
  jest.setTimeout(15_000);

  it("reads its day once, and the Day tab shows the entry that landed with both totals", async () => {
    addLandsUnanswered();
    renderDay();
    await openLogSheet();
    await waitFor(() => expect(energy("eaten")).not.toBe(""));
    const shownBefore = energy("eaten");
    const reads = dayReads();
    const recentReads = jest.mocked(getRecents).mock.calls.length;
    fireEvent.click(plus(QUARK_AGAIN));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm. Try again."));
    await waitFor(() => expect(dayRows()).toEqual(["Oats", "Quark"]));
    expect(energy("eaten")).not.toBe(shownBefore);
    expect(energy("eaten")).toContain(kcalOnServer("eaten"));
    expect(energy("withPlan")).toContain(kcalOnServer("withPlan"));
    // Settled: one read, no loop.
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(dayReads()).toBe(reads + 1);
    // The recent items are marked stale, not read while the open sheet shows them (heldList.tsx).
    expect(getRecents).toHaveBeenCalledTimes(recentReads);
  });

  it("keeps its id through that read: '+' again sends the same id and says Already logged", async () => {
    addLandsUnanswered();
    renderDay();
    await openLogSheet();
    fireEvent.click(plus(QUARK_AGAIN));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm. Try again."));
    await waitFor(() => expect(dayRows()).toEqual(["Oats", "Quark"]));
    fireEvent.click(plus(QUARK_AGAIN));
    await screen.findByText("Already logged Quark.");
    expect(sent()).toHaveLength(2);
    expect(sent()[1].id).toBe(sent()[0].id);
    expect(rowNames()).toEqual(["Oats", "Quark"]);
  });

  it("reads once when the read fails too, and never again from there", async () => {
    addLandsUnanswered();
    renderDay();
    await openLogSheet();
    const reads = dayReads();
    jest.mocked(getDay).mockRejectedValue(timeout());
    fireEvent.click(plus(QUARK_AGAIN));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm. Try again."));
    await waitFor(() => expect(dayReads()).toBe(reads + 1));
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(dayReads()).toBe(reads + 1);
  });

  it("reads nothing for a press made while known offline, which sent nothing", async () => {
    renderDay();
    await openLogSheet();
    const reads = dayReads();
    const recentReads = jest.mocked(getRecents).mock.calls.length;
    const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    try {
      fireEvent.click(plus(QUARK_AGAIN));
      await waitFor(() => expect(statusLine()).toHaveTextContent("You are offline."));
      await act(() => new Promise((r) => setTimeout(r, 100)));
      expect(addEntry).not.toHaveBeenCalled();
      expect(dayReads()).toBe(reads);
      expect(getRecents).toHaveBeenCalledTimes(recentReads);
    } finally {
      onLine.mockRestore();
      act(() => void window.dispatchEvent(new Event("online")));
    }
  });

  it("reads nothing again after a refusal, which the server answered", async () => {
    jest.mocked(addEntry).mockRejectedValueOnce(
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: { status: 400, data: { code: "validation_failed" } },
      }),
    );
    renderDay();
    await openLogSheet();
    const reads = dayReads();
    fireEvent.click(plus(QUARK_AGAIN));
    await waitFor(() => expect(statusLine()).not.toHaveTextContent("Logging to today"));
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(dayReads()).toBe(reads);
  });

  it("after a Save and log that could not confirm, the Day tab shows the meal's entry, and the next open's meals list holds it", async () => {
    jest.mocked(saveAndLog).mockImplementationOnce(async (body) => {
      world.server.saveAndLog(body);
      throw timeout();
    });
    jest.mocked(getSavedMeals).mockImplementation(async () => ({
      meals: [...world.server.meals.values()].filter((m) => !m.archived),
    }));
    renderDay();
    const sheet = await openLogSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "New saved meal" }));
    const stacked = await screen.findByRole("dialog", { name: "New saved meal" });
    for (const [label, value] of [
      ["Name", "Bowl"],
      ["Calories", "700"],
      ["Protein", "45"],
      ["Carbohydrates", "70"],
      ["Fat", "25"],
    ]) {
      fireEvent.change(within(stacked).getByLabelText(label, { selector: "input" }), { target: { value } });
    }
    const mealReads = jest.mocked(getSavedMeals).mock.calls.length;
    fireEvent.click(within(stacked).getByRole("button", { name: "Save and log" }));
    await within(stacked).findByText("Could not confirm. Check your connection and try again.");
    await waitFor(() => expect(dayRows()).toEqual(["Oats", "Bowl"]));
    expect(energy("eaten")).toContain(kcalOnServer("eaten"));
    // Marked stale, not read under the open sheets: read as the log sheet closes.
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(jest.mocked(getSavedMeals).mock.calls.length).toBe(mealReads);
    fireEvent.click(within(stacked).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New saved meal" })).toBeNull());
    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log food" })).toBeNull());
    await waitFor(() => expect(jest.mocked(getSavedMeals).mock.calls.length).toBeGreaterThan(mealReads));
    const reopened = await openLogSheet();
    expect(within(within(reopened).getByRole("region", { name: "Saved meals" })).getByText("Bowl")).toBeInTheDocument();
  });
});
