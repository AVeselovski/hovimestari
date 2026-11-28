import { fakeAuth } from "@/__tests__/helpers/auth";
import { viewHoldPassed } from "@/__tests__/sheet";
import { refused, renderDay, rowNames } from "@/components/day/__tests__/harness";
import { useAuth } from "@/contexts/AuthContext";
import { getDay } from "@/lib/api/days";
import { addEntry } from "@/lib/api/entries";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { getRecipes } from "@/lib/api/recipes";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import { addDays } from "@/lib/localDate";
import { readDayPlace, takeOpenedInApp } from "@/lib/recipeNav";
import { entryFigures, type AddEntryBody } from "@hovimestari/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  TODAY,
  favouritesOf,
  holdRecipe,
  loosely,
  openLogSheet,
  ownFoods,
  plus,
  recipeLogWorld,
  timeout,
  type RecipeWorld,
} from "./logHarness";

// Recipes in the log sheet: among the recent items, in their own browse
// list, in the results of what is typed, logged with "+", and in the recipe
// view. The real Day tab against the fake server of
// components/day/__tests__/harness.tsx, which holds two recipes
// (`recipeLogWorld`).

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn() }));
jest.mock("@/lib/api/recipes", () => ({ getRecipes: jest.fn() }));
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
let searchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/",
}));

jest.setTimeout(15_000);

let world: RecipeWorld;
const start = window.location.pathname + window.location.search;
beforeEach(() => {
  searchParams = new URLSearchParams();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, addEntry, getRecents, getRecipes, getFavouriteFoods, getOwnFoods, getFood, searchFoods]) {
    jest.mocked(fn).mockReset();
  }
  world = recipeLogWorld();
  jest.mocked(getFavouriteFoods).mockResolvedValue(favouritesOf(world));
  jest.mocked(getOwnFoods).mockResolvedValue(ownFoods());
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
  jest.mocked(searchFoods).mockResolvedValue({ foods: [], near: [] });
  // The day's own history entry, with nothing on it.
  window.history.pushState(null, "", "/");
  takeOpenedInApp();
});
afterEach(() => window.history.replaceState(null, "", start));

const sent = (): AddEntryBody[] => jest.mocked(addEntry).mock.calls.map(([body]) => body);
const dialog = () => screen.getByRole("dialog");
const list = (name: string) => within(dialog()).getByRole("region", { name });
const names = (name: string) =>
  within(list(name))
    .queryAllByRole("listitem")
    .map((li) => li.querySelector("button .font-medium")?.textContent ?? "");
const servings = () => within(dialog()).getByRole("textbox", { name: "Servings" }) as HTMLInputElement;
const logButton = () => within(dialog()).getByRole("button", { name: /^(Log|Add to plan|Logging…)$/ });
const figure = (macro: string) =>
  dialog().querySelector<HTMLElement>(`[data-log-figures] [data-macro="${macro}"] dd`)!.textContent;
const search = () => within(dialog()).getByLabelText("Search foods, meals and recipes") as HTMLInputElement;

/** Opens a recipe's view from its row in `listName`. */
async function openRecipe(listName: string, name: string): Promise<HTMLElement> {
  const row = within(list(listName)).getByRole("button", { name: new RegExp(`^${name}`) });
  fireEvent.click(row);
  await within(dialog()).findByRole("button", { name: "Back" });
  await viewHoldPassed();
  return row;
}

/** The recipe is deleted on another device: the server lists it nowhere and takes no entry of it. */
function deleteOnServer(id: string): void {
  world.server.recipes.delete(id);
  world.server.recipeSummaries = world.server.recipeSummaries.filter((r) => r.id !== id);
}

describe("Recipes while browsing the log sheet", () => {
  it("lists the active recipes under Favourites, favourites first and then by name, each with one serving's figures", async () => {
    holdRecipe(world.server, { ...world.lentils, id: "00000000-0000-4000-8000-0000000000b1", name: "Åland pancake" });
    holdRecipe(world.server, {
      ...world.lentils,
      id: "00000000-0000-4000-8000-0000000000b2",
      name: "Winter stew",
      archived: true,
    });
    renderDay();
    await openLogSheet();
    // The favourite first, then by name in Finnish order, å after z, and no archived recipe.
    expect(names("Recipes")).toEqual(["Shakshuka", "Lentil soup", "Åland pancake"]);
    const rows = within(list("Recipes")).getAllByRole("listitem");
    expect(within(rows[0]).getByText("Favourite")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("Favourite")).toBeNull();
    // Read aloud in full, per serving.
    expect(rows[0].querySelector("[data-recipe-figures-line] .sr-only")!.textContent!.replace(/ /g, " ")).toBe(
      `${formatKcal(world.shakshuka.perServing.energyKcal)} kcal · ${formatMacroGrams(world.shakshuka.perServing.proteinG)} g protein per serving`,
    );
  });

  it("says where recipes come from when there are none", async () => {
    world.server.recipeSummaries = [];
    world.server.recents = world.server.recents.filter((item) => item.kind !== "recipe");
    renderDay();
    await openLogSheet();
    expect(within(list("Recipes")).getByText("Recipes you save appear here.")).toBeInTheDocument();
    expect(within(list("Recipes")).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("shows a recent recipe with its last servings, after the items eaten since", async () => {
    renderDay();
    await openLogSheet();
    expect(names("Recent")).toEqual(["Quark", "Banana", "Shake", "Shakshuka"]);
    const row = within(list("Recent")).getAllByRole("listitem")[3];
    expect(row).toHaveTextContent("Last 1.5 servings");
  });

  it("names each recipe's '+' for what it adds: the last servings, else 1 serving", async () => {
    renderDay();
    await openLogSheet();
    const again = within(list("Recipes"))
      .getAllByRole("button", { name: /^Log / })
      .map((b) => b.getAttribute("aria-label"));
    expect(again).toEqual(["Log Shakshuka again, 1.5 servings", "Log Lentil soup, 1 serving"]);
  });
});

describe("A recipe's '+' in the log sheet", () => {
  it("logs a recent recipe again with its last servings, as written, and the row and totals come from the answer", async () => {
    renderDay();
    await openLogSheet();
    // The row among the recent items, not the same recipe's row in the Recipes list.
    fireEvent.click(within(list("Recent")).getByRole("button", { name: loosely("Log Shakshuka again, 1.5 servings") }));
    await screen.findByText("Logged Shakshuka, 1.5 servings.");
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatchObject({
      kind: "recipe",
      recipeId: world.shakshuka.id,
      servings: 1.5,
      date: TODAY,
      status: "eaten",
    });
    // The recipe as written, never a batch of it.
    expect(sent()[0]).not.toHaveProperty("cookId");
    expect(rowNames()).toEqual(["Oats", "Shakshuka"]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log food" })).toBeNull());
  });

  it("logs 1 serving of a recipe never eaten, from the Recipes list", async () => {
    renderDay();
    await openLogSheet();
    fireEvent.click(within(list("Recipes")).getByRole("button", { name: "Log Lentil soup, 1 serving" }));
    await screen.findByText("Logged Lentil soup, 1 serving.");
    expect(sent()[0]).toMatchObject({ kind: "recipe", recipeId: world.lentils.id, servings: 1 });
  });

  it("plans it on a future day", async () => {
    searchParams = new URLSearchParams({ date: addDays(TODAY, 2) });
    renderDay();
    await openLogSheet();
    fireEvent.click(plus("Plan Shakshuka, 1.5 servings"));
    await screen.findByText("Added Shakshuka to the plan.");
    expect(sent()[0]).toMatchObject({ kind: "recipe", servings: 1.5, status: "planned", date: addDays(TODAY, 2) });
  });
});

describe("Recipes in the log sheet's results", () => {
  it("puts the recipes that match first, above the saved meals, found on the device by name or tag", async () => {
    holdRecipe(world.server, { ...world.lentils, id: "00000000-0000-4000-8000-0000000000b3", name: "Shake pancakes" });
    jest.mocked(searchFoods).mockResolvedValue({ foods: [world.quark], near: [] });
    renderDay();
    await openLogSheet();
    const reads = jest.mocked(getRecipes).mock.calls.length;
    fireEvent.change(search(), { target: { value: "sha" } });
    await within(dialog()).findByRole("region", { name: "Foods" });
    const sections = [...dialog().querySelectorAll("[data-sheet-body] section[data-list]")].map((s) =>
      s.getAttribute("data-list"),
    );
    expect(sections).toEqual(["recipe-results", "meal-results", "food-results"]);
    expect(names("Recipes")).toEqual(["Shake pancakes", "Shakshuka"]);
    expect(names("My meals")).toEqual(["Shake"]);
    // A tag finds its recipes, case and accents folded, as the shared filter does.
    fireEvent.change(search(), { target: { value: "LUNCH" } });
    await waitFor(() => expect(names("Recipes")).toEqual(["Lentil soup", "Shake pancakes"]));
    // Filtered from the list read once: typing reads no recipe again.
    expect(getRecipes).toHaveBeenCalledTimes(reads);
    expect(dialog().querySelector('[aria-live="polite"].sr-only')).toHaveTextContent("2 recipes found.");
  });

  it("logs a found recipe with its '+', and opens its view from its row", async () => {
    renderDay();
    await openLogSheet();
    fireEvent.change(search(), { target: { value: "lentil" } });
    await waitFor(() => expect(names("Recipes")).toEqual(["Lentil soup"]));
    fireEvent.click(within(list("Recipes")).getByRole("button", { name: /^Lentil soup/ }));
    await within(dialog()).findByRole("button", { name: "Back" });
    await viewHoldPassed();
    expect(screen.getByRole("dialog", { name: "Lentil soup" })).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Back" }));
    // Back to the results as they were, with focus on the row that opened the view.
    expect(search().value).toBe("lentil");
    expect(within(list("Recipes")).getByRole("button", { name: /^Lentil soup/ })).toHaveFocus();
    fireEvent.click(within(list("Recipes")).getByRole("button", { name: "Log Lentil soup, 1 serving" }));
    await screen.findByText("Logged Lentil soup, 1 serving.");
  });

  it("keeps the lines that save the text as a meal while only a recipe matches", async () => {
    renderDay();
    await openLogSheet();
    fireEvent.change(search(), { target: { value: "lentil" } });
    await waitFor(() => expect(names("Recipes")).toEqual(["Lentil soup"]));
    expect(within(dialog()).getByRole("button", { name: "Save “lentil” as a meal" })).toBeInTheDocument();
    expect(within(dialog()).queryByRole("region", { name: "My meals" })).toBeNull();
  });

  it("titles the foods found when only a recipe matches above them", async () => {
    jest.mocked(searchFoods).mockResolvedValue({ foods: [world.quark], near: [] });
    renderDay();
    await openLogSheet();
    fireEvent.change(search(), { target: { value: "lentil" } });
    const foods = await within(dialog()).findByRole("region", { name: "Foods" });
    expect(names("Recipes")).toEqual(["Lentil soup"]);
    expect(within(dialog()).queryByRole("region", { name: "My meals" })).toBeNull();
    expect(within(foods).getByRole("heading", { name: "Foods" })).toBeInTheDocument();
  });
});

describe("The log sheet's recipe view", () => {
  it("opens on the last servings, and shows for the amount the figures the shared function gives", async () => {
    renderDay();
    await openLogSheet();
    await openRecipe("Recent", "Shakshuka");
    expect(screen.getByRole("dialog", { name: "Shakshuka" })).toBeInTheDocument();
    expect(servings().value).toBe("1.5");
    const { basis } = world.shakshuka;
    const expected = entryFigures(basis, { per: "serving", count: 1.5 });
    expect(figure("energy")).toBe(`${formatKcal(expected.energyKcal)}kcal`);
    expect(figure("protein")).toBe(`${formatMacroGrams(expected.proteinG)}g`);
    expect(figure("carbs")).toBe(`${formatMacroGrams(expected.carbsG)}g`);
    expect(figure("fat")).toBe(`${formatMacroGrams(expected.fatG)}g`);
    fireEvent.change(servings(), { target: { value: "0,75" } });
    const less = entryFigures(basis, { per: "serving", count: 0.75 });
    expect(figure("energy")).toBe(`${formatKcal(less.energyKcal)}kcal`);
    expect(figure("protein")).toBe(`${formatMacroGrams(less.proteinG)}g`);
  });

  it("opens a recipe never eaten on 1 serving, whose figures are the recipe's own per serving", async () => {
    renderDay();
    await openLogSheet();
    await openRecipe("Recipes", "Lentil soup");
    expect(servings().value).toBe("1");
    const { perServing } = world.lentils;
    expect(figure("energy")).toBe(`${formatKcal(perServing.energyKcal)}kcal`);
    expect(figure("protein")).toBe(`${formatMacroGrams(perServing.proteinG)}g`);
    // Under the log block: the name, one serving's figures and how many it serves.
    const perServingSection = within(dialog()).getByRole("region", { name: "Per serving" });
    expect(perServingSection.textContent!.replace(/[  ]/g, " ")).toContain(`${formatKcal(perServing.energyKcal)} kcal`);
    // The body names the recipe under the log block, as a food's and a meal's view name theirs.
    expect(within(dialog()).getByRole("heading", { name: "Lentil soup" })).toBeInTheDocument();
    expect(dialog().querySelector("[data-recipe-serves]")).toHaveTextContent("Serves 4");
  });

  it("logs the servings typed with Log, eaten or planned, and says so once the sheet has closed", async () => {
    renderDay();
    await openLogSheet();
    await openRecipe("Recent", "Shakshuka");
    fireEvent.change(servings(), { target: { value: "2" } });
    fireEvent.click(within(dialog()).getByRole("radio", { name: "Planned" }));
    expect(logButton()).toHaveTextContent("Add to plan");
    fireEvent.click(logButton());
    await screen.findByText("Added Shakshuka to the plan.");
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatchObject({ kind: "recipe", recipeId: world.shakshuka.id, servings: 2, status: "planned" });
    expect(sent()[0]).not.toHaveProperty("cookId");
  });

  it("refuses servings the field cannot take, under the field, and sends nothing", async () => {
    renderDay();
    await openLogSheet();
    await openRecipe("Recent", "Shakshuka");
    fireEvent.change(servings(), { target: { value: "0" } });
    fireEvent.click(logButton());
    expect(await within(dialog()).findByText("Enter 0.01 to 100, two decimals at most.")).toBeInTheDocument();
    expect(addEntry).not.toHaveBeenCalled();
    expect(servings()).toHaveFocus();
  });

  it("returns to the search with its line when the recipe was deleted elsewhere, and the row leaves every list", async () => {
    renderDay();
    await openLogSheet();
    await openRecipe("Recent", "Shakshuka");
    deleteOnServer(world.shakshuka.id);
    fireEvent.click(logButton());
    expect(await within(dialog()).findByText("This recipe is no longer available.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Log food" })).toBeInTheDocument();
    expect(search()).toHaveFocus();
    await waitFor(() => expect(names("Recent")).toEqual(["Quark", "Banana", "Shake"]));
    expect(names("Recipes")).toEqual(["Lentil soup"]);
    // Nothing was logged: the day behind the sheet still holds its one entry.
    expect(document.querySelectorAll("li[data-entry-id]")).toHaveLength(1);
  });

  it("keeps the view and what was typed on another refusal, and says it above Log", async () => {
    renderDay();
    await openLogSheet();
    await openRecipe("Recent", "Shakshuka");
    fireEvent.change(servings(), { target: { value: "3" } });
    jest.mocked(addEntry).mockRejectedValueOnce(refused(400, "recipe_serving_too_large"));
    fireEvent.click(logButton());
    await waitFor(() => expect(within(dialog()).getByRole("alert")).not.toBeEmptyDOMElement());
    expect(screen.getByRole("dialog", { name: "Shakshuka" })).toBeInTheDocument();
    expect(servings().value).toBe("3");
  });

  it("starts again for another recipe: its own servings, and its own entry id after an add that could not confirm", async () => {
    renderDay();
    await openLogSheet();
    await openRecipe("Recent", "Shakshuka");
    fireEvent.change(servings(), { target: { value: "3" } });
    jest.mocked(addEntry).mockRejectedValueOnce(timeout());
    fireEvent.click(logButton());
    await waitFor(() => expect(within(dialog()).getByRole("alert")).not.toBeEmptyDOMElement());
    expect(sent()[0]).toMatchObject({ recipeId: world.shakshuka.id, servings: 3 });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Back" }));
    await openRecipe("Recipes", "Lentil soup");
    // Lentil soup was never eaten: 1 serving, not the 3 typed for Shakshuka, and no line from its add.
    expect(servings().value).toBe("1");
    expect(within(dialog()).queryByRole("alert")?.textContent ?? "").toBe("");
    fireEvent.click(logButton());
    await screen.findByText("Logged Lentil soup, 1 serving.");
    expect(sent()).toHaveLength(2);
    expect(sent()[1]).toMatchObject({ recipeId: world.lentils.id, servings: 1 });
    // A new entry, never a replay of the one sent for Shakshuka.
    expect(sent()[1].id).not.toBe(sent()[0].id);
  });

  it("Back returns to the lists as they were, with focus on the row that opened the view", async () => {
    renderDay();
    await openLogSheet();
    const before = { recent: names("Recent"), recipes: names("Recipes") };
    await openRecipe("Recipes", "Shakshuka");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Back" }));
    expect({ recent: names("Recent"), recipes: names("Recipes") }).toEqual(before);
    // The row in the Recipes list, not the same recipe's row in Recent.
    expect(within(list("Recipes")).getByRole("button", { name: /^Shakshuka/ })).toHaveFocus();
  });

  it("Open recipe leaves the sheet for the recipe's page, and keeps the day's place for the way back", async () => {
    const main = document.body.appendChild(document.createElement("main"));
    try {
      renderDay();
      await openLogSheet();
      await openRecipe("Recent", "Shakshuka");
      const link = within(dialog()).getByRole("link", { name: "Open recipe" });
      expect(link).toHaveAttribute("href", `/recipes/${world.shakshuka.id}`);
      main.scrollTop = 310;
      // The press is kept, and the test does not follow the link.
      link.addEventListener("click", (e) => e.preventDefault(), { once: true });
      fireEvent.click(link);
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Shakshuka" })).toBeNull());
      // The recipe page's Back goes back through the history, to this day where it was, with no entry to focus.
      expect(takeOpenedInApp()).toBe(true);
      expect(readDayPlace()).toEqual({ entryId: null, top: 310 });
      expect(addEntry).not.toHaveBeenCalled();
    } finally {
      main.remove();
    }
  });

  it("a press that opens the recipe in a new tab leaves the sheet as it is and keeps no place", async () => {
    renderDay();
    await openLogSheet();
    await openRecipe("Recent", "Shakshuka");
    const link = within(dialog()).getByRole("link", { name: "Open recipe" });
    link.addEventListener("click", (e) => e.preventDefault(), { once: true });
    fireEvent.click(link, { ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Shakshuka" })).toBeInTheDocument();
    expect(takeOpenedInApp()).toBe(false);
    expect(readDayPlace()).toBeNull();
  });
});
