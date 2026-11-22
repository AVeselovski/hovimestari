import { fakeAuth } from "@/__tests__/helpers/auth";
import { deferred } from "@/__tests__/helpers/queryClient";
import { confirmArmed, openSheet } from "@/__tests__/sheet";
import { renderDay } from "@/components/day/__tests__/harness";
import { mealEntry } from "@/components/day/__tests__/support";
import { uuid } from "@/components/foods/__tests__/support";
import { useAuth } from "@/contexts/AuthContext";
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
import type { SavedMeal } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { favouritesOf, logWorld, openLogSheet, ownFoods, statusLine } from "./logHarness";

// The log sheet's meal view and its actions (edit, archive or restore,
// delete), and the archived meals. The real Day tab against the fake server of
// components/day/__tests__/harness.tsx, which answers the saved meal routes
// as apps/backend/src/services/writes/savedMeals.ts does.

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn() }));
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
const searchField = () => within(sheet()).getByLabelText("Search foods, meals and recipes") as HTMLInputElement;
const mealCalls = (archived: boolean) => jest.mocked(getSavedMeals).mock.calls.filter(([a]) => a === archived).length;

/** From here on, every read of the saved meals and the recent items stays out, unanswered. */
function holdListReads(): void {
  jest.mocked(getSavedMeals).mockReturnValue(new Promise(() => {}));
  jest.mocked(getRecents).mockReturnValue(new Promise(() => {}));
}

async function openMeal(list: string, name: string): Promise<void> {
  fireEvent.click(within(region(list)).getByRole("button", { name: new RegExp(`^${name}`) }));
  await within(sheet()).findByRole("button", { name: "Back" });
}

describe("The meal view", () => {
  it("edits a meal: its row changes in place before any list is read again, and its planned entries' day is read again", async () => {
    const planned = mealEntry("Salmon soup", 1, soup.figures, {
      status: "planned",
      savedMeal: { id: soup.id, source: "Foodora", archived: false, deleted: false },
    });
    world.server.entries.push(planned);
    renderDay();
    await openLogSheet();
    const before = rowsOf("Saved meals");
    await openMeal("Saved meals", "Salmon soup");
    const reads = jest.mocked(getDay).mock.calls.length;
    holdListReads();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Edit meal" }));
    await screen.findByRole("dialog", { name: "Edit saved meal" });
    fireEvent.change(field("Calories"), { target: { value: "750" } });
    fireEvent.click(within(dialog("Edit saved meal")).getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit saved meal" })).toBeNull());
    expect(updateSavedMeal).toHaveBeenCalledWith(
      soup.id,
      expect.objectContaining({ figures: expect.objectContaining({ energyKcal: 750 }) }),
    );
    expect(statusLine()).toHaveTextContent("Saved Salmon soup.");
    await waitFor(() => expect(jest.mocked(getDay).mock.calls.length).toBeGreaterThan(reads));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Back" }));
    await within(sheet()).findByRole("region", { name: "Saved meals" });
    // The lists' reads are still out: what shows is the edit's own answer, put in place.
    const after = rowsOf("Saved meals");
    expect(after.map((t) => t.slice(0, 12))).toEqual(before.map((t) => t.slice(0, 12)));
    expect(after[1]).toContain("750 kcal");
  });

  it("renames a meal in the recent items in place, before they are read again", async () => {
    renderDay();
    await openLogSheet();
    const before = rowsOf("Recent");
    await openMeal("Recent", "Shake");
    holdListReads();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Edit meal" }));
    await screen.findByRole("dialog", { name: "Edit saved meal" });
    fireEvent.change(field("Name"), { target: { value: "Night shake" } });
    fireEvent.click(within(dialog("Edit saved meal")).getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit saved meal" })).toBeNull());
    fireEvent.click(within(sheet()).getByRole("button", { name: "Back" }));
    await within(sheet()).findByRole("region", { name: "Recent" });
    const after = rowsOf("Recent");
    expect(after).toHaveLength(before.length);
    expect(after[2]).toMatch(/^Night shake/);
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
  });

  it("archives a meal in place: the button turns into Restore meal, and it leaves the saved meals before they are read again", async () => {
    renderDay();
    await openLogSheet();
    await openMeal("Saved meals", "Chicken bowl");
    holdListReads();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Archive meal" }));
    await within(sheet()).findByRole("button", { name: "Restore meal" });
    expect(setSavedMealArchived).toHaveBeenCalledWith(bowl.id, true);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Back" }));
    await within(sheet()).findByRole("region", { name: "Saved meals" });
    expect(rowsOf("Saved meals").map((t) => t.slice(0, 11))).toEqual(["Salmon soup", "ShakeHome60"]);
  });

  it("keeps focus on the archive button, now Restore meal, and the body where it was scrolled, through Archive and Restore", async () => {
    renderDay();
    await openLogSheet();
    await openMeal("Saved meals", "Chicken bowl");
    const body = sheet().querySelector<HTMLElement>("[data-sheet-body]")!;
    const archive = within(sheet()).getByRole("button", { name: "Archive meal" });
    archive.focus();
    body.scrollTop = 120;
    fireEvent.click(archive);
    const restore = await within(sheet()).findByRole("button", { name: "Restore meal" });
    expect(restore).toHaveFocus();
    expect(body.scrollTop).toBe(120);
    fireEvent.click(restore);
    await within(sheet()).findByRole("button", { name: "Archive meal" });
    expect(within(sheet()).getByRole("button", { name: "Archive meal" })).toHaveFocus();
    expect(body.scrollTop).toBe(120);
  });

  it("sends one archive or restore at a time, also for two presses before the screen has caught up", async () => {
    const answer = deferred<void>();
    renderDay();
    await openLogSheet();
    await openMeal("Saved meals", "Chicken bowl");
    jest.mocked(setSavedMealArchived).mockReturnValue(answer.promise);
    const archive = within(sheet()).getByRole("button", { name: "Archive meal" });
    act(() => {
      archive.click();
      archive.click();
    });
    expect(setSavedMealArchived).toHaveBeenCalledTimes(1);
    await act(async () => answer.resolve());
    await within(sheet()).findByRole("button", { name: "Restore meal" });
  });

  it("deletes a meal after asking, and lands on browsing with focus in the search field", async () => {
    renderDay();
    await openLogSheet();
    await openMeal("Saved meals", "Chicken bowl");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Delete meal" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Chicken bowl?" });
    expect(confirm).toHaveTextContent("Days it was logged on keep their figures.");
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteSavedMeal).toHaveBeenCalledWith(bowl.id));
    await waitFor(() => expect(searchField()).toHaveFocus());
    expect(rowsOf("Saved meals").join()).not.toContain("Chicken bowl");
  });

  it("deletes from the edit sheet on the meal view: one DELETE, the edit sheet closed, browsing with focus in the search field", async () => {
    renderDay();
    await openLogSheet();
    await openMeal("Saved meals", "Chicken bowl");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Edit meal" }));
    const edit = await screen.findByRole("dialog", { name: "Edit saved meal" });
    fireEvent.click(within(edit).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Chicken bowl?" });
    // Stacked on the edit sheet, not on the log sheet: a confirmation over a stacked sheet is raised again.
    expect(document.querySelectorAll("[data-sheet-backdrop][data-sheet-stacked]")).toHaveLength(2);
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    // Read from the DOM: a role query misses the edit sheet while the confirmation hides it.
    await waitFor(() => expect(openSheet("Edit saved meal")).toBeNull());
    await waitFor(() => expect(searchField()).toHaveFocus());
    expect(deleteSavedMeal).toHaveBeenCalledTimes(1);
    expect(deleteSavedMeal).toHaveBeenCalledWith(bowl.id);
    expect(rowsOf("Saved meals").join()).not.toContain("Chicken bowl");
  });

  it("takes a meal already deleted on another device as deleted, from the meal view and from the edit sheet", async () => {
    renderDay();
    await openLogSheet();
    for (const [meal, fromSheet] of [
      [bowl, false],
      [soup, true],
    ] as const) {
      await openMeal("Saved meals", meal.name);
      if (fromSheet) {
        fireEvent.click(within(sheet()).getByRole("button", { name: "Edit meal" }));
        const edit = await screen.findByRole("dialog", { name: "Edit saved meal" });
        fireEvent.click(within(edit).getByRole("button", { name: "Delete" }));
      } else {
        fireEvent.click(within(sheet()).getByRole("button", { name: "Delete meal" }));
      }
      const confirm = await screen.findByRole("dialog", { name: `Delete ${meal.name}?` });
      world.server.meals.delete(meal.id);
      await confirmArmed();
      fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(openSheet(`Delete ${meal.name}?`)).toBeNull());
      await waitFor(() => expect(openSheet("Edit saved meal")).toBeNull());
      await waitFor(() => expect(searchField()).toHaveFocus());
      expect(rowsOf("Saved meals").join()).not.toContain(meal.name);
    }
  });

  it("goes back to browsing with its notice when an edit finds the meal gone", async () => {
    renderDay();
    await openLogSheet();
    await openMeal("Saved meals", "Chicken bowl");
    world.server.meals.delete(bowl.id);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Edit meal" }));
    await screen.findByRole("dialog", { name: "Edit saved meal" });
    fireEvent.change(field("Calories"), { target: { value: "750" } });
    fireEvent.click(within(dialog("Edit saved meal")).getByRole("button", { name: "Save meal" }));
    expect(await within(sheet()).findByText("This saved meal is no longer available.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Edit saved meal" })).toBeNull();
    await waitFor(() => expect(searchField()).toHaveFocus());
  });
});

describe("The archived meals", () => {
  it("reads the archived list when it opens, and says so when there is none", async () => {
    renderDay();
    await openLogSheet();
    expect(mealCalls(true)).toBe(0);
    fireEvent.click(within(region("Saved meals")).getByRole("button", { name: "Archived meals" }));
    expect(await within(sheet()).findByText("Meals you archive appear here.")).toBeInTheDocument();
    expect(mealCalls(true)).toBe(1);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(within(region("Saved meals")).getByRole("button", { name: "Archived meals" })).toHaveFocus(),
    );
  });

  it("restores an archived meal: its row leaves the list in place, and it is back in the saved meals", async () => {
    const old = savedMeal("Old curry", "Wolt", { archived: true });
    const older = savedMeal("Older pasta", null, { archived: true });
    for (const meal of [old, older]) world.server.meals.set(meal.id, meal);
    renderDay();
    await openLogSheet();
    fireEvent.click(within(region("Saved meals")).getByRole("button", { name: "Archived meals" }));
    const list = () => sheet().querySelector<HTMLElement>("[data-list=archived]")!;
    await waitFor(() => expect(within(list()).getAllByRole("listitem")).toHaveLength(2));
    fireEvent.click(within(list()).getByRole("button", { name: "Restore Old curry" }));
    await waitFor(() => expect(within(list()).getAllByRole("listitem")).toHaveLength(1));
    expect(within(list()).getByRole("listitem")).toHaveTextContent("Older pasta");
    expect(setSavedMealArchived).toHaveBeenCalledWith(old.id, false);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(rowsOf("Saved meals").join()).toContain("Old curry"));
  });

  it("opens an archived meal, which can still be logged", async () => {
    const old = savedMeal("Old curry", "Wolt", { archived: true });
    world.server.meals.set(old.id, old);
    renderDay();
    await openLogSheet();
    fireEvent.click(within(region("Saved meals")).getByRole("button", { name: "Archived meals" }));
    const list = () => sheet().querySelector<HTMLElement>("[data-list=archived]")!;
    await waitFor(() => expect(within(list()).getAllByRole("listitem")).toHaveLength(1));
    fireEvent.click(within(list()).getByRole("button", { name: /^Old curry/ }));
    await within(sheet()).findByRole("button", { name: "Restore meal" });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Log" }));
    await screen.findByText("Logged Old curry, 1 meal.");
  });
});
