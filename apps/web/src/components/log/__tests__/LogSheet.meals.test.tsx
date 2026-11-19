import { stubPhone } from "@/__tests__/formSheet";
import { fakeAuth } from "@/__tests__/helpers/auth";
import { controlSheetAnimations, holdSheetExits } from "@/__tests__/sheet";
import { renderDay, rowNames, seededClient } from "@/components/day/__tests__/harness";
import { uuid } from "@/components/foods/__tests__/support";
import { useAuth } from "@/contexts/AuthContext";
import { ARM_DELAY_MS } from "@/hooks/useArmedAtRest";
import { getDay } from "@/lib/api/days";
import { addEntry, removeEntry } from "@/lib/api/entries";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import {
  createSavedMeal,
  deleteSavedMeal,
  getSavedMeals,
  saveAndLog,
  setSavedMealArchived,
  updateSavedMeal,
} from "@/lib/api/savedMeals";
import { STALE } from "@/lib/queryClient";
import type { SavedMeal } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { TODAY, favouritesOf, logWorld, openLogSheet, ownFoods, statusLine } from "./logHarness";

// Saved meals and estimates in the log sheet: browsing, the source chips,
// the results, the meal view's actions, the archived meals, and the two
// sheets stacked on it. The real Day tab against the fake server of
// components/day/__tests__/harness.tsx, which answers the saved meal routes
// as apps/backend/src/services/writes/savedMeals.ts does.

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));
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

const MOCKS = [
  getDay,
  addEntry,
  removeEntry,
  getRecents,
  getFavouriteFoods,
  getOwnFoods,
  getFood,
  searchFoods,
  getSavedMeals,
  createSavedMeal,
  saveAndLog,
  updateSavedMeal,
  setSavedMealArchived,
  deleteSavedMeal,
];

function savedMeal(name: string, source: string | null, overrides: Partial<SavedMeal> = {}): SavedMeal {
  return {
    id: uuid(),
    name,
    source,
    figures: { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 },
    archived: false,
    lastCount: null,
    ...overrides,
  };
}

let world: ReturnType<typeof logWorld>;
let bowl: SavedMeal;
let soup: SavedMeal;
beforeEach(() => {
  searchParams = new URLSearchParams();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of MOCKS) jest.mocked(fn).mockReset();
  world = logWorld();
  // Three active meals from two sources (and the shake from Home): Chicken bowl, Salmon soup, Shake.
  bowl = savedMeal("Chicken bowl", "Wolt", { lastCount: 2 });
  soup = savedMeal("Salmon soup", "Foodora");
  for (const meal of [bowl, soup]) world.server.meals.set(meal.id, meal);
  jest.mocked(getFavouriteFoods).mockResolvedValue(favouritesOf(world));
  jest.mocked(getOwnFoods).mockResolvedValue(ownFoods());
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
  jest.mocked(searchFoods).mockResolvedValue({ foods: [] });
});

const dialog = (name: string | RegExp = "Log food") => screen.getByRole("dialog", { name });
const sheet = () =>
  screen
    .getAllByRole("dialog")
    .find((d) => d.getAttribute("aria-label") === "Log food" || d.querySelector("[data-status-line]"))!;
const region = (name: string) => within(sheet()).getByRole("region", { name });
const rowsOf = (name: string) =>
  within(region(name))
    .queryAllByRole("listitem")
    .map((li) => li.querySelector("button")!.textContent ?? "");
const field = (label: string) =>
  within(screen.getAllByRole("dialog").at(-1)!).getByLabelText(label, { selector: "input" }) as HTMLInputElement;
const searchField = () => within(sheet()).getByLabelText("Search foods and meals") as HTMLInputElement;
const mealCalls = (archived: boolean) => jest.mocked(getSavedMeals).mock.calls.filter(([a]) => a === archived).length;

async function search(text: string): Promise<void> {
  fireEvent.change(searchField(), { target: { value: text } });
  await waitFor(() =>
    expect(sheet().querySelector("[data-list=meal-results], [data-create-from-query]")).not.toBeNull(),
  );
}

describe("Browsing the log sheet", () => {
  it("puts New saved meal and Add an estimate first under the search field, then Recent, Favourites, Saved meals, Your foods", async () => {
    renderDay();
    await openLogSheet();
    const body = sheet().querySelector<HTMLElement>("[data-sheet-body]")!;
    const first = [...body.querySelectorAll("button")].slice(0, 2).map((b) => b.textContent);
    expect(first).toEqual(["New saved meal", "Add an estimate"]);
    const lists = [...body.querySelectorAll("section[data-list]")].map((s) => s.getAttribute("data-list"));
    expect(lists).toEqual(["recent", "favourites", "meals", "own"]);
  });

  it("says what the search field finds: Search foods and meals, also as its placeholder", async () => {
    renderDay();
    await openLogSheet();
    expect(searchField()).toHaveAttribute("placeholder", "Search foods and meals");
  });

  it("opens with the saved meals already read, and no archived list read, with Archived meals under them", async () => {
    // The app's freshness: a read is fresh for 30 seconds.
    const client = seededClient();
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, staleTime: STALE.live } });
    renderDay(client);
    await screen.findByText("Oats");
    await waitFor(() => expect(mealCalls(false)).toBe(1));
    await openLogSheet();
    expect(rowsOf("Saved meals").map((t) => t.split(/Wolt|Foodora|Home/)[0])).toEqual([
      "Chicken bowl",
      "Salmon soup",
      "Shake",
    ]);
    expect(region("Saved meals")).toHaveTextContent("600 kcal · 40.0 g protein per meal");
    expect(within(region("Saved meals")).getByRole("button", { name: "Archived meals" })).toBeInTheDocument();
    expect(mealCalls(false)).toBe(1);
    expect(mealCalls(true)).toBe(0);
  });

  it("says Meals you save appear here with none, and still offers Archived meals", async () => {
    world.server.meals.clear();
    renderDay();
    await openLogSheet();
    expect(region("Saved meals")).toHaveTextContent("Meals you save appear here.");
    expect(within(region("Saved meals")).getByRole("button", { name: "Archived meals" })).toBeInTheDocument();
  });

  it("logs a saved meal with '+' at its last count, else one meal", async () => {
    renderDay();
    await openLogSheet();
    expect(
      within(region("Saved meals")).getByRole("button", { name: "Log Chicken bowl again, 2 meals" }),
    ).toBeInTheDocument();
    fireEvent.click(within(region("Saved meals")).getByRole("button", { name: "Log Salmon soup again, 1 meal" }));
    await screen.findByText("Logged Salmon soup, 1 meal.");
    expect(jest.mocked(addEntry).mock.calls[0][0]).toMatchObject({
      kind: "saved_meal",
      savedMealId: soup.id,
      count: 1,
    });
  });

  it("filters the meals by the source chip, and the results by it too", async () => {
    renderDay();
    await openLogSheet();
    const chips = within(region("Saved meals")).getByRole("radiogroup", { name: "Where meals come from" });
    expect(
      within(chips)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["All", "Foodora", "Home", "Wolt"]);
    expect(within(chips).getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(chips).getByRole("radio", { name: "Wolt" }));
    expect(rowsOf("Saved meals").map((t) => t.split("Wolt")[0])).toEqual(["Chicken bowl"]);
    // "o" is in every meal's name; Wolt keeps one.
    await search("o o");
    expect(
      within(sheet().querySelector<HTMLElement>("[data-list=meal-results]")!).getAllByRole("listitem"),
    ).toHaveLength(1);
  });

  it("lets go of a chosen source once its chips hide, so a meal with no source shows again, in browsing and in the results", async () => {
    world.server.meals.delete(world.shake.id);
    const porridge = savedMeal("Porridge", null);
    world.server.meals.set(porridge.id, porridge);
    const { client } = renderDay();
    await openLogSheet();
    const chips = within(region("Saved meals")).getByRole("radiogroup", { name: "Where meals come from" });
    fireEvent.click(within(chips).getByRole("radio", { name: "Wolt" }));
    expect(rowsOf("Saved meals").map((t) => t.split(/Wolt|\d/)[0])).toEqual(["Chicken bowl"]);
    // Archived on another device: Wolt is the one source left. The open list holds its chips and rows.
    soup.archived = true;
    await act(() => client.refetchQueries({ queryKey: ["savedMeals"] }));
    // TanStack tells the list on a timer: let it.
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(within(region("Saved meals")).getByRole("radiogroup")).toBeInTheDocument();
    expect(rowsOf("Saved meals").map((t) => t.split(/Wolt|\d/)[0])).toEqual(["Chicken bowl"]);
    // The results filter what was read, and let go of Wolt.
    await search("porridge");
    expect(
      within(sheet().querySelector<HTMLElement>("[data-list=meal-results]")!).getAllByRole("listitem"),
    ).toHaveLength(1);
    // Browsing shown again starts from what was read: the chips go, and the meal with no source shows.
    fireEvent.change(searchField(), { target: { value: "" } });
    await waitFor(() => expect(within(region("Saved meals")).queryByRole("radiogroup")).toBeNull());
    expect(rowsOf("Saved meals").map((t) => t.split(/Wolt|\d/)[0])).toEqual(["Chicken bowl", "Porridge"]);
  });

  it("shows no chips with fewer than two sources", async () => {
    world.server.meals.clear();
    world.server.meals.set(bowl.id, bowl);
    renderDay();
    await openLogSheet();
    expect(within(region("Saved meals")).queryByRole("radiogroup")).toBeNull();
  });
});

describe("The log sheet's results", () => {
  it("puts the saved meals that match first, before the foods", async () => {
    jest.mocked(searchFoods).mockResolvedValue({ foods: [world.quark] });
    renderDay();
    await openLogSheet();
    await search("salmon");
    const meals = sheet().querySelector<HTMLElement>("[data-list=meal-results]")!;
    expect(
      within(meals)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining("Salmon soup")]);
    await waitFor(() => expect(sheet().querySelector("[data-list=results]")).not.toBeNull());
    expect(
      meals.compareDocumentPosition(sheet().querySelector("[data-list=results]")!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(sheet()).getByText("1 saved meal found.")).toBeInTheDocument();
    // Two sections, each with its heading: the foods sit under "Foods".
    const foods = within(sheet()).getByRole("region", { name: "Foods" });
    expect(within(foods).getByRole("heading", { name: "Foods" })).toBeInTheDocument();
    expect(foods).toContainElement(sheet().querySelector<HTMLElement>("[data-list=results]"));
  });

  it("gives the foods no heading of their own when no saved meal matches", async () => {
    jest.mocked(searchFoods).mockResolvedValue({ foods: [world.quark] });
    renderDay();
    await openLogSheet();
    await search("quark");
    await waitFor(() => expect(sheet().querySelector("[data-list=results]")).not.toBeNull());
    expect(within(sheet()).queryByRole("region", { name: "Foods" })).toBeNull();
  });

  it("offers to save an unmatched query as a meal or add it as an estimate, each with the name filled in", async () => {
    renderDay();
    await openLogSheet();
    await search("Pizza night");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Save “Pizza night” as a meal" }));
    await screen.findByRole("dialog", { name: "New saved meal" });
    expect(field("Name").value).toBe("Pizza night");
    fireEvent.click(within(dialog("New saved meal")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New saved meal" })).toBeNull());
    fireEvent.click(within(sheet()).getByRole("button", { name: "Add “Pizza night” as an estimate" }));
    await screen.findByRole("dialog", { name: "Add an estimate" });
    expect(field("Name").value).toBe("Pizza night");
  });
});

describe("A new saved meal from the log sheet", () => {
  it("is made and logged in one request in seven taps and five typed values; both sheets close and focus lands on the launcher", async () => {
    renderDay();
    await screen.findByText("Oats");
    const launcher = screen.getByRole("button", { name: "Log food" });
    let taps = 0;
    const tap = (el: HTMLElement) => {
      taps += 1;
      fireEvent.click(el);
    };
    tap(launcher);
    await within(await screen.findByRole("dialog", { name: "Log food" })).findByRole("region", { name: "Recent" });
    tap(within(sheet()).getByRole("button", { name: "New saved meal" }));
    await screen.findByRole("dialog", { name: "New saved meal" });
    tap(field("Name"));
    fireEvent.change(field("Name"), { target: { value: "Wolt bowl" } });
    fireEvent.keyDown(field("Name"), { key: "Enter" });
    expect(field("Calories")).toHaveFocus();
    fireEvent.change(field("Calories"), { target: { value: "700" } });
    for (const [label, value] of [
      ["Protein", "45"],
      ["Carbohydrates", "70"],
      ["Fat", "25"],
    ]) {
      tap(field(label));
      fireEvent.change(field(label), { target: { value } });
    }
    tap(within(dialog("New saved meal")).getByRole("button", { name: "Save and log" }));
    await screen.findByText("Saved Wolt bowl and logged 1 meal.");
    expect(taps).toBe(7);
    expect(saveAndLog).toHaveBeenCalledTimes(1);
    expect(addEntry).not.toHaveBeenCalled();
    expect(createSavedMeal).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /log food|new saved meal|add an estimate/i })).toBeNull();
    expect(launcher).toHaveFocus();
    expect(rowNames()).toEqual(["Oats", "Wolt bowl"]);
  });

  it("closes the stacked sheet and the log sheet in the same update, never the log sheet first", async () => {
    const restore = holdSheetExits();
    try {
      renderDay();
      await openLogSheet();
      fireEvent.click(within(sheet()).getByRole("button", { name: "New saved meal" }));
      await screen.findByRole("dialog", { name: "New saved meal" });
      fireEvent.change(field("Name"), { target: { value: "Bowl" } });
      for (const label of ["Calories", "Protein", "Carbohydrates", "Fat"]) {
        fireEvent.change(field(label), { target: { value: "10" } });
      }
      const parent = dialog("Log food");
      const child = dialog("New saved meal");
      const state = (el: HTMLElement) =>
        !el.isConnected ? "gone" : el.hasAttribute("data-closed") ? "closed" : "open";
      const seen: string[] = [];
      const observer = new MutationObserver(() => seen.push(`${state(parent)}/${state(child)}`));
      observer.observe(document.body, { attributes: true, childList: true, subtree: true });
      fireEvent.click(within(child).getByRole("button", { name: "Save and log" }));
      await waitFor(() => expect(state(parent)).toBe("closed"));
      observer.disconnect();
      // The stacked sheet slides out with its parent: it is never gone without its exit,
      // and the parent never closes while the stacked sheet is still open.
      expect(state(child)).toBe("closed");
      expect(seen.filter((x) => x.startsWith("closed/") && x !== "closed/closed")).toEqual([]);
    } finally {
      restore();
    }
  });

  it("says so in the toast, which removes the entry from the day and leaves the meal saved", async () => {
    renderDay();
    await openLogSheet();
    fireEvent.click(within(sheet()).getByRole("button", { name: "New saved meal" }));
    await screen.findByRole("dialog", { name: "New saved meal" });
    fireEvent.change(field("Name"), { target: { value: "Bowl" } });
    for (const label of ["Calories", "Protein", "Carbohydrates", "Fat"]) {
      fireEvent.change(field(label), { target: { value: "10" } });
    }
    fireEvent.click(within(dialog("New saved meal")).getByRole("button", { name: "Save and log" }));
    await screen.findByText("Saved Bowl and logged 1 meal.");
    fireEvent.click(screen.getByRole("button", { name: "Remove from day" }));
    await waitFor(() => expect(removeEntry).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(rowNames()).toEqual(["Oats"]));
    expect([...world.server.meals.values()].map((m) => m.name)).toContain("Bowl");
  });

  it("Save meal saves without logging, keeps the log sheet open, says so on its status line, and lists the meal", async () => {
    renderDay();
    await openLogSheet();
    fireEvent.click(within(sheet()).getByRole("button", { name: "New saved meal" }));
    await screen.findByRole("dialog", { name: "New saved meal" });
    fireEvent.change(field("Name"), { target: { value: "Acai bowl" } });
    for (const label of ["Calories", "Protein", "Carbohydrates", "Fat"]) {
      fireEvent.change(field(label), { target: { value: "10" } });
    }
    fireEvent.click(within(dialog("New saved meal")).getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New saved meal" })).toBeNull());
    expect(createSavedMeal).toHaveBeenCalledTimes(1);
    expect(saveAndLog).not.toHaveBeenCalled();
    expect(addEntry).not.toHaveBeenCalled();
    expect(statusLine()).toHaveTextContent("Saved Acai bowl.");
    await waitFor(() => expect(rowsOf("Saved meals")[0]).toContain("Acai bowl"));
    expect(world.server.entries.map((e) => e.name)).toEqual(["Oats"]);
  });

  it("on a future day plans it: Save and add to plan, and the toast says it is in the plan", async () => {
    searchParams = new URLSearchParams({ date: "2026-11-18" });
    renderDay();
    await openLogSheet(/^Add to plan$/);
    fireEvent.click(within(sheet()).getByRole("button", { name: "New saved meal" }));
    await screen.findByRole("dialog", { name: "New saved meal" });
    fireEvent.change(field("Name"), { target: { value: "Bowl" } });
    for (const label of ["Calories", "Protein", "Carbohydrates", "Fat"]) {
      fireEvent.change(field(label), { target: { value: "10" } });
    }
    expect(within(dialog("New saved meal")).getByRole("radio", { name: "Eaten" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.click(within(dialog("New saved meal")).getByRole("button", { name: "Save and add to plan" }));
    await screen.findByText("Saved Bowl and added it to the plan.");
    expect(jest.mocked(saveAndLog).mock.calls[0][0].entry).toMatchObject({ date: "2026-11-18", status: "planned" });
    expect(screen.getByRole("button", { name: "Remove from plan" })).toBeInTheDocument();
  });
});

describe("Add an estimate", () => {
  it("logs an estimate to the day, closes both sheets and says so", async () => {
    renderDay();
    await openLogSheet();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Add an estimate" }));
    await screen.findByRole("dialog", { name: "Add an estimate" });
    fireEvent.change(field("Name"), { target: { value: "Restaurant dinner" } });
    for (const [label, value] of [
      ["Calories", "900"],
      ["Protein", "45"],
      ["Carbohydrates", "80"],
      ["Fat", "40"],
    ]) {
      fireEvent.change(field(label), { target: { value } });
    }
    fireEvent.click(within(dialog("Add an estimate")).getByRole("button", { name: "Save estimate" }));
    await screen.findByText("Logged Restaurant dinner.");
    expect(screen.queryByRole("dialog", { name: /log food|new saved meal|add an estimate/i })).toBeNull();
    expect(jest.mocked(addEntry).mock.calls[0][0]).toMatchObject({ kind: "estimate", date: TODAY, status: "eaten" });
    expect(rowNames()).toEqual(["Oats", "Restaurant dinner"]);
    expect(screen.getByText("Estimate")).toBeInTheDocument();
  });
});

describe("The log sheet on a phone, its create actions", () => {
  it("ignore a press until the sheet is at rest", async () => {
    // The arm delay on a fake clock that also moves with real time, so the reads still answer.
    jest.useFakeTimers({ advanceTimers: true });
    const restorePhone = stubPhone();
    const animations = controlSheetAnimations();
    try {
      renderDay();
      const launcher = await screen.findByRole("button", { name: "Log food" });
      await waitFor(() => expect(launcher).not.toHaveAttribute("aria-disabled"));
      fireEvent.click(launcher);
      await within(await screen.findByRole("dialog")).findByRole("region", { name: "Recent" });
      const create = () => within(sheet()).getByRole("button", { name: "New saved meal" });
      const guard = () => sheet().querySelector("[data-press-guard]");
      fireEvent.pointerDown(create());
      fireEvent.click(create());
      await act(async () => {});
      expect(screen.queryByRole("dialog", { name: "New saved meal" })).toBeNull();
      // The delay passes, the entry ends (Base UI may ask for the animations more than once): armed.
      act(() => jest.advanceTimersByTime(ARM_DELAY_MS));
      await waitFor(() => {
        animations.finish();
        expect(guard()).toHaveAttribute("data-press-guard", "armed");
      });
      fireEvent.pointerDown(create());
      fireEvent.click(create());
      expect(await screen.findByRole("dialog", { name: "New saved meal" })).toBeInTheDocument();
    } finally {
      animations.restore();
      restorePhone();
      jest.useRealTimers();
    }
  });
});
