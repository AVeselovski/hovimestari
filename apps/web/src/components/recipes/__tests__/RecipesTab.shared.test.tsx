import { fakeAuth } from "@/__tests__/helpers/auth";
import { openSheet, viewHoldPassed } from "@/__tests__/sheet";
import { renderDay, seededClient } from "@/components/day/__tests__/harness";
import { openLogSheet } from "@/components/log/__tests__/logHarness";
import { useAuth } from "@/contexts/AuthContext";
import { getDay } from "@/lib/api/days";
import { addEntry } from "@/lib/api/entries";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods, updateFood } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { getSavedMeals, setSavedMealArchived, updateSavedMeal } from "@/lib/api/savedMeals";
import { queryKeys } from "@/lib/queryKeys";
import type { FoodList, SavedMealList } from "@hovimestari/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { pinClock, renderRecipes, rowNames, savedMeal, serveFoods, serveMeals, topSheet } from "./recipesHarness";

// One copy of the data: the Library and the log sheet read the same
// cached lists, so a write in one shows in the other without a read. Each
// test holds every list read after the write, so only the cache can show it.

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
  createFood: jest.fn(),
  updateFood: jest.fn(),
  deleteFood: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
jest.mock("@/lib/api/recipes", () => ({ getRecipes: jest.fn().mockResolvedValue({ recipes: [] }) }));

jest.setTimeout(20_000);

const MOCKS = [
  getDay,
  addEntry,
  getRecents,
  getOwnFoods,
  getFood,
  updateFood,
  getFavouriteFoods,
  searchFoods,
  getSavedMeals,
  updateSavedMeal,
  setSavedMealArchived,
];

let clock: jest.SpyInstance;
beforeEach(() => {
  clock = pinClock();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of MOCKS) jest.mocked(fn).mockReset();
  jest.mocked(getFavouriteFoods).mockResolvedValue({ foods: [] });
  jest.mocked(searchFoods).mockResolvedValue({ foods: [], near: [] });
});
afterEach(() => clock.mockRestore());

const field = (label: string) => within(topSheet()).getByLabelText(label, { selector: "input" }) as HTMLInputElement;

/** From here on, every read of the saved meals and own foods stays out, unanswered. */
function holdListReads(): void {
  jest.mocked(getSavedMeals).mockReturnValue(new Promise(() => {}));
  jest.mocked(getOwnFoods).mockReturnValue(new Promise(() => {}));
}

it("a meal renamed in the Library shows renamed in the log sheet, from the one cached list", async () => {
  const bowl = savedMeal("Chicken bowl", "Wolt");
  serveFoods([]);
  serveMeals([bowl]);
  const client = seededClient();
  const page = renderRecipes(client);
  // Both lists are read, as a person who looked at either segment has them, before the reads are held.
  fireEvent.click(screen.getByRole("tab", { name: "Foods" }));
  await screen.findByText("Foods you add appear here.");
  fireEvent.click(screen.getByRole("tab", { name: "Meals" }));
  const row = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[data-meal-row="${bowl.id}"]`);
    if (!found) throw new Error("The meal row is not there yet");
    return found;
  });
  fireEvent.click(row);
  const sheet = await screen.findByRole("dialog", { name: "Edit meal" });
  fireEvent.change(field("Name"), { target: { value: "Chicken bowl, large" } });
  holdListReads();
  fireEvent.click(within(sheet).getByRole("button", { name: "Save meal" }));
  await waitFor(() => expect(openSheet("Edit meal")).toBeNull());
  await waitFor(() => expect(rowNames("My meals", "recipes-meals")).toEqual(["Chicken bowl, large"]));
  page.unmount();

  renderDay(client);
  const log = await openLogSheet();
  const meals = within(log).getByRole("region", { name: "My meals" });
  await waitFor(() => expect(meals).toHaveTextContent("Chicken bowl, large"));
  // The log sheet's rows log, so they carry no "Opens it to edit.".
  expect(log.querySelector("[aria-description]")).toBeNull();
  expect(client.getQueryData<SavedMealList>(queryKeys.savedMealList(false))?.meals.map((m) => m.name)).toEqual([
    "Chicken bowl, large",
  ]);
});

it("a food renamed in the log sheet shows renamed in the Library, from the one cached list", async () => {
  const [rye] = serveFoods(["Rye bread"]);
  serveMeals([]);
  const client = seededClient();
  const day = renderDay(client);
  const log = await openLogSheet();
  const own = within(log).getByRole("region", { name: "My foods" });
  const ryeRow = await within(own).findByRole("button", { name: /^Rye bread/ });
  expect(ryeRow).not.toHaveAttribute("aria-description");
  fireEvent.click(ryeRow);
  const edit = await within(topSheet()).findByRole("button", { name: "Edit food" });
  await viewHoldPassed();
  fireEvent.click(edit);
  const sheet = await screen.findByRole("dialog", { name: "Edit food" });
  fireEvent.change(field("Name"), { target: { value: "Barley bread" } });
  holdListReads();
  fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
  await waitFor(() => expect(openSheet("Edit food")).toBeNull());
  day.unmount();

  renderRecipes(client);
  fireEvent.click(screen.getByRole("tab", { name: "Foods" }));
  await waitFor(() => expect(rowNames("My foods", "recipes-foods")).toEqual(["Barley bread"]));
  expect(client.getQueryData<FoodList>(queryKeys.foodOwn())?.foods.map((f) => [f.id, f.name])).toEqual([
    [rye.id, "Barley bread"],
  ]);
});
