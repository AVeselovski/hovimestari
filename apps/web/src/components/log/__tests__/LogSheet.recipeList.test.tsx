import { fakeAuth } from "@/__tests__/helpers/auth";
import { renderDay } from "@/components/day/__tests__/harness";
import { useAuth } from "@/contexts/AuthContext";
import { getDay } from "@/lib/api/days";
import { addEntry } from "@/lib/api/entries";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { getRecipes } from "@/lib/api/recipes";
import { takeOpenedInApp } from "@/lib/recipeNav";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { favouritesOf, holdRecipe, openLogSheet, ownFoods, recipeLogWorld, type RecipeWorld } from "./logHarness";

// The log sheet's Recipes list while browsing: at most five recipes,
// favourites first and then by name, and one button that shows the rest in
// place. The real Day tab against the fake server of
// components/day/__tests__/harness.tsx (`recipeLogWorld`).

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

const dialog = () => screen.getByRole("dialog");
const list = (name: string) => within(dialog()).getByRole("region", { name });
const names = (name: string) =>
  within(list(name))
    .queryAllByRole("listitem")
    .map((li) => li.querySelector("button .font-medium")?.textContent ?? "");
const search = () => within(dialog()).getByLabelText("Search foods, meals and recipes") as HTMLInputElement;

const BASE = "00000000-0000-4000-8000-0000000000";
/** Five more recipes, so the server holds seven: two favourites (Borscht, Shakshuka) and five others. */
function sevenRecipes(): void {
  const more: [string, string, boolean][] = [
    ["c1", "Åland pancake", false],
    ["c2", "Dal", false],
    ["c3", "Borscht", true],
    ["c4", "Egg curry", false],
    ["c5", "Carrot cake", false],
  ];
  for (const [id, name, favourite] of more)
    holdRecipe(world.server, { ...world.lentils, id: BASE + id, name, favourite });
}
const FIRST_FIVE = ["Borscht", "Shakshuka", "Carrot cake", "Dal", "Egg curry"];
const REST = ["Lentil soup", "Åland pancake"];
const allButton = () => within(list("Recipes")).queryByRole("button", { name: /^All \d+ recipes$/ });
const rowButton = (name: string) => within(list("Recipes")).getByRole("button", { name: new RegExp(`^${name}`) });

describe("The log sheet's Recipes list", () => {
  it("shows five recipes at most, favourites first and then by name, each with its '+', and a button that counts them all", async () => {
    sevenRecipes();
    renderDay();
    await openLogSheet();
    expect(names("Recipes")).toEqual(FIRST_FIVE);
    expect(within(list("Recipes")).getAllByRole("button", { name: /^Log / })).toHaveLength(5);
    expect(allButton()).toHaveTextContent("All 7 recipes");
    // The button ends the section, under the rows.
    expect(list("Recipes").lastElementChild).toBe(allButton());
  });

  it("has no button with five recipes or fewer", async () => {
    sevenRecipes();
    for (const id of ["c1", "c2"]) {
      world.server.recipeSummaries = world.server.recipeSummaries.filter((r) => r.id !== BASE + id);
    }
    renderDay();
    await openLogSheet();
    expect(names("Recipes")).toEqual(["Borscht", "Shakshuka", "Carrot cake", "Egg curry", "Lentil soup"]);
    expect(allButton()).toBeNull();
  });

  it("the button shows the rest in place, under the five in the same order, and focus moves to the first row it revealed", async () => {
    sevenRecipes();
    renderDay();
    await openLogSheet();
    const five = within(list("Recipes")).getAllByRole("listitem");
    fireEvent.click(allButton()!);
    // The five rows are the same elements in the same places: nothing above the button moved.
    expect(within(list("Recipes")).getAllByRole("listitem").slice(0, 5)).toEqual(five);
    expect(names("Recipes")).toEqual([...FIRST_FIVE, ...REST]);
    expect(allButton()).toBeNull();
    expect(rowButton(REST[0])).toHaveFocus();
    // A revealed row logs as the others do.
    expect(within(list("Recipes")).getAllByRole("button", { name: /^Log / })).toHaveLength(7);
  });

  it("stays as the person left it through a recipe view and a search, and opens on five again next time", async () => {
    sevenRecipes();
    renderDay();
    await openLogSheet();
    fireEvent.click(allButton()!);
    // Into a revealed recipe's view and back: the whole list, with focus on that row.
    fireEvent.click(rowButton("Åland pancake"));
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Back" }));
    expect(names("Recipes")).toEqual([...FIRST_FIVE, ...REST]);
    expect(rowButton("Åland pancake")).toHaveFocus();
    // Through a search and back to browsing.
    fireEvent.change(search(), { target: { value: "dal" } });
    await waitFor(() => expect(names("Recipes")).toEqual(["Dal"]));
    fireEvent.change(search(), { target: { value: "" } });
    await waitFor(() => expect(names("Recipes")).toEqual([...FIRST_FIVE, ...REST]));
    expect(allButton()).toBeNull();
    // Closed and opened again: five and the button.
    fireEvent.keyDown(dialog(), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log food" })).toBeNull());
    await openLogSheet();
    expect(names("Recipes")).toEqual(FIRST_FIVE);
    expect(allButton()).toHaveTextContent("All 7 recipes");
  });

  it("holds its five, its count and its revealed rows when a read lands with another order", async () => {
    sevenRecipes();
    const { client } = renderDay();
    await openLogSheet();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // Another device saves a favourite that sorts first, and marks Dal a favourite: both would change the five.
    const landed = async (): Promise<void> => {
      await act(() => client.refetchQueries());
      await waitFor(() => expect(client.isFetching()).toBe(0));
      await act(() => new Promise((r) => setTimeout(r, 50)));
    };
    holdRecipe(world.server, { ...world.lentils, id: BASE + "c6", name: "Aubergine bake", favourite: true });
    holdRecipe(world.server, { ...world.lentils, id: BASE + "c2", name: "Dal", favourite: true });
    await landed();
    expect(names("Recipes")).toEqual(FIRST_FIVE);
    expect(allButton()).toHaveTextContent("All 7 recipes");
    // Dal's own row shows its star where it stands.
    expect(within(within(list("Recipes")).getAllByRole("listitem")[3]).getByText("Favourite")).toBeInTheDocument();
    fireEvent.click(allButton()!);
    expect(names("Recipes")).toEqual([...FIRST_FIVE, ...REST]);
    holdRecipe(world.server, { ...world.lentils, id: BASE + "c7", name: "Aamupuuro" });
    await landed();
    expect(names("Recipes")).toEqual([...FIRST_FIVE, ...REST]);
  });

  it("typed text finds a recipe the five do not show", async () => {
    sevenRecipes();
    renderDay();
    await openLogSheet();
    expect(names("Recipes")).not.toContain("Åland pancake");
    fireEvent.change(search(), { target: { value: "pancake" } });
    await waitFor(() => expect(names("Recipes")).toEqual(["Åland pancake"]));
  });
});

describe("What a '+' is called", () => {
  it("says 'again' only for a recipe eaten before", async () => {
    renderDay();
    await openLogSheet();
    const called = within(list("Recipes"))
      .getAllByRole("button", { name: /^Log / })
      .map((b) => b.getAttribute("aria-label"));
    // Shakshuka, a favourite last eaten as 1.5 servings, then Lentil soup, never eaten.
    expect(called).toEqual(["Log Shakshuka again, 1.5 servings", "Log Lentil soup, 1 serving"]);
  });

  it("says 'again' only for a saved meal eaten before", async () => {
    const never = { ...world.shake, id: BASE + "d1", name: "Wrap", lastCount: null };
    world.server.meals.set(never.id, never);
    renderDay();
    await openLogSheet();
    const called = within(list("My meals"))
      .getAllByRole("button", { name: /^Log / })
      .map((b) => b.getAttribute("aria-label"));
    expect(called).toEqual(["Log Shake again, 1 meal", "Log Wrap, 1 meal"]);
  });
});

describe("The log sheet's lists that cannot be read", () => {
  const down = () =>
    Object.assign(new Error("Request failed with status code 500"), {
      isAxiosError: true,
      response: { status: 500, data: { code: "internal_error" } },
    });
  const recipesLine = "Your recipes show here once Hovimestari can reach the server.";
  const recentLine = /^Your recent items, recipes and saved meals show here once/;

  it("the Recipes list says so itself while the recent items can be read", async () => {
    jest.mocked(getRecipes).mockRejectedValue(down());
    renderDay();
    await openLogSheet();
    expect(await within(list("Recipes")).findByText(recipesLine)).toBeInTheDocument();
  });

  it("says it once, under Recent, when the recent items cannot be read either", async () => {
    jest.mocked(getRecipes).mockRejectedValue(down());
    jest.mocked(getRecents).mockRejectedValue(down());
    renderDay();
    await openLogSheet();
    expect(await within(list("Recent")).findByText(recentLine)).toBeInTheDocument();
    expect(within(list("Recipes")).queryByText(recipesLine)).toBeNull();
    expect(within(list("Recipes")).queryAllByRole("listitem")).toHaveLength(0);
  });
});
