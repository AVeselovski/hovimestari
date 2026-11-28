import { stubPhone } from "@/__tests__/formSheet";
import { fakeAuth } from "@/__tests__/helpers/auth";
import { tap, tapClick } from "@/__tests__/helpers/tap";
import { controlSheetAnimations } from "@/__tests__/sheet";
import { renderDay, seededClient } from "@/components/day/__tests__/harness";
import { fineliFood, ownFood } from "@/components/foods/__tests__/support";
import { recipeOf } from "@/components/recipes/__tests__/recipeFixtures";
import { useAuth } from "@/contexts/AuthContext";
import { ARM_DELAY_MS } from "@/hooks/usePressGuard";
import { getDay } from "@/lib/api/days";
import { addEntry, removeEntry } from "@/lib/api/entries";
import { getFavouriteFoods, getFood, getOwnFoods } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { getRecipes } from "@/lib/api/recipes";
import { createSavedMeal, getSavedMeals } from "@/lib/api/savedMeals";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { recipeSummaryOf } from "@/lib/recipeCache";
import type { FavouriteFood, FoodSummary, SavedMeal } from "@hovimestari/types";
import { focusManager, onlineManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  favouritesOf,
  holdRecipe,
  openLogSheet,
  plus,
  recipeLogWorld,
  statusLine,
  timeout,
  type RecipeWorld,
} from "./logHarness";

// An open list never reorders under the finger (components/log/heldList.tsx).
// While the log sheet is open, no read that lands in the background changes
// the order or the set of rows in Recent, Favourites, Recipes, My meals or
// My foods: an unconfirmed "+", the window coming back into focus, the
// connection coming back, or any read at all. A row's own data changes in
// place. The next open shows what was read.

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn() }));
jest.mock("@/lib/api/recipes", () => ({ getRecipes: jest.fn().mockResolvedValue({ recipes: [] }) }));
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

const LISTS = ["Recent", "Favourites", "Recipes", "My meals", "My foods"] as const;

let world: RecipeWorld;
let favourites: FavouriteFood[];
let own: FoodSummary[];
const pasta: FavouriteFood = { ...fineliFood("Pasta", { isFavourite: true }), lastAmount: null };
const rye = ownFood("Rye bread");
const apple = ownFood("Apple cake");
const soup: SavedMeal = {
  id: "00000000-0000-4000-8000-0000000000a1",
  name: "Arctic soup",
  source: null,
  figures: { energyKcal: 300, proteinG: 20, carbsG: 30, fatG: 10 },
  archived: false,
  lastCount: null,
};
const borscht = recipeSummaryOf(recipeOf("Borscht", 4, [{ name: "Beetroot" }]));

beforeEach(() => {
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, addEntry, removeEntry, getRecents, getFavouriteFoods, getOwnFoods, getFood]) {
    jest.mocked(fn).mockReset();
  }
  jest.mocked(getSavedMeals).mockReset();
  world = recipeLogWorld();
  favourites = favouritesOf(world).foods;
  own = [rye];
  jest.mocked(getFavouriteFoods).mockImplementation(async () => ({ foods: favourites }));
  jest.mocked(getOwnFoods).mockImplementation(async () => ({ foods: own }));
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  act(() => {
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
  });
});

/**
 * The app's freshness, so a read happens only when something asks for it. The
 * focus and reconnect cases use the test client's, as if the lists were read
 * more than 30 seconds ago: only a stale read is read again then.
 */
function appClient(): QueryClient {
  const client = seededClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, staleTime: STALE.live } });
  return client;
}

const sheet = (): HTMLElement => screen.getByRole("dialog", { name: "Log food" });

/** Every row of every list, by list, as its name reads: the order on screen. */
function rows(): Record<(typeof LISTS)[number], string[]> {
  const out = {} as Record<(typeof LISTS)[number], string[]>;
  for (const list of LISTS) {
    out[list] = within(within(sheet()).getByRole("region", { name: list }))
      .queryAllByRole("listitem")
      .map((li) => li.querySelector("button .font-medium")?.textContent ?? "");
  }
  return out;
}

/** Another device logged and saved: every list reads in a new order, with a new row in it. */
function everyListChanges(): void {
  const [quark, banana, shake, shakshuka] = world.server.recents;
  world.server.recents = [shakshuka, shake, banana, quark];
  favourites = [pasta, ...favourites];
  holdRecipe(world.server, borscht);
  world.server.meals.set(soup.id, soup);
  own = [apple, rye];
}

/** The fresh order each list reads after `everyListChanges`. */
const FRESH = {
  Recent: ["Shakshuka", "Shake", "Banana", "Quark"],
  Favourites: ["Pasta", "Oats"],
  Recipes: ["Shakshuka", "Borscht", "Lentil soup"],
  "My meals": ["Arctic soup", "Shake"],
  "My foods": ["Apple cake", "Rye bread"],
};

/** Waits until every read in flight has landed, and a moment more for TanStack's notify timer. */
async function settle(client: QueryClient): Promise<void> {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((r) => setTimeout(r, 50)));
}

async function closeAndReopen(client: QueryClient): Promise<void> {
  fireEvent.keyDown(sheet(), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log food" })).toBeNull());
  await settle(client);
  await openLogSheet();
  await settle(client);
}

describe("An open list in the log sheet never reorders under the finger", () => {
  jest.setTimeout(15_000);

  it("after an unconfirmed '+': every row keeps its index, and the next open shows the fresh order", async () => {
    const client = appClient();
    renderDay(client);
    await openLogSheet();
    await settle(client);
    const before = rows();
    expect(before.Recent).toEqual(["Quark", "Banana", "Shake", "Shakshuka"]);
    jest.mocked(addEntry).mockImplementationOnce(async (body) => {
      world.server.add(body);
      everyListChanges();
      throw timeout();
    });
    fireEvent.click(plus("Log Banana again, 2 × Piece · 110 g"));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm. Try again."));
    // The day was read again: the entry that landed is on the Day tab.
    await waitFor(() => expect(document.querySelectorAll("li[data-entry-id]")).toHaveLength(2));
    await settle(client);
    expect(rows()).toEqual(before);
    // The press again at the same place is the same item, a replay.
    fireEvent.click(plus("Log Banana again, 2 × Piece · 110 g"));
    await screen.findByText("Already logged Banana.");
    expect(jest.mocked(addEntry).mock.calls.map(([b]) => b.id)).toEqual([
      jest.mocked(addEntry).mock.calls[0][0].id,
      jest.mocked(addEntry).mock.calls[0][0].id,
    ]);
    await settle(client);
    await openLogSheet();
    await settle(client);
    // An add leaves the user's own foods as they were read: nothing made them stale.
    expect(rows()).toEqual({ ...FRESH, "My foods": before["My foods"] });
  });

  it("after an unconfirmed '+' and a close with no other write: the next open shows the recent items read as it closed", async () => {
    const client = appClient();
    renderDay(client);
    await openLogSheet();
    await settle(client);
    const before = rows();
    const reads = jest.mocked(getRecents).mock.calls.length;
    jest.mocked(addEntry).mockImplementationOnce(async (body) => {
      world.server.add(body);
      everyListChanges();
      throw timeout();
    });
    fireEvent.click(plus("Log Banana again, 2 × Piece · 110 g"));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm. Try again."));
    await settle(client);
    // Marked stale, not read while the sheet shows them.
    expect(getRecents).toHaveBeenCalledTimes(reads);
    expect(rows()).toEqual(before);
    const onServer = world.server
      .recentList()
      .items.map((i) => (i.kind === "food" ? i.food.name : i.kind === "recipe" ? i.recipe.name : i.meal.name));
    expect(rows().Recent).not.toEqual(onServer);
    await closeAndReopen(client);
    expect(rows().Recent).toEqual(onServer);
  });

  it("when the window comes back into focus: every row keeps its index, and the next open shows the fresh order", async () => {
    const client = seededClient();
    renderDay(client);
    await openLogSheet();
    await settle(client);
    const before = rows();
    everyListChanges();
    const reads = jest.mocked(getRecents).mock.calls.length;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(getRecents).toHaveBeenCalledTimes(reads + 1));
    await settle(client);
    expect(rows()).toEqual(before);
    await closeAndReopen(client);
    expect(rows()).toEqual(FRESH);
  });

  it("when the connection comes back: every row keeps its index, and the next open shows the fresh order", async () => {
    const client = seededClient();
    renderDay(client);
    await openLogSheet();
    await settle(client);
    const before = rows();
    everyListChanges();
    const reads = jest.mocked(getRecents).mock.calls.length;
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(getRecents).toHaveBeenCalledTimes(reads + 1));
    await settle(client);
    expect(rows()).toEqual(before);
    await closeAndReopen(client);
    expect(rows()).toEqual(FRESH);
  });

  it("whatever read lands: the rows keep their places, and a row's own data changes in place", async () => {
    const client = appClient();
    renderDay(client);
    await openLogSheet();
    await settle(client);
    const before = rows();
    everyListChanges();
    // Quark, now last of the recent items, was last eaten as 300 g.
    world.server.recents[3] = { ...world.server.recents[3], last: { grams: 300, portion: null } } as never;
    await act(() => client.refetchQueries());
    await settle(client);
    expect(rows()).toEqual(before);
    expect(
      within(within(sheet()).getByRole("region", { name: "Recent" })).getAllByRole("listitem")[0],
    ).toHaveTextContent(/Last 300\sg/);
    await closeAndReopen(client);
    expect(rows()).toEqual(FRESH);
  });

  it("holds again once a sheet stacked on it has closed", async () => {
    const client = appClient();
    renderDay(client);
    const opened = await openLogSheet();
    await settle(client);
    const before = rows();
    fireEvent.click(within(opened).getByRole("button", { name: "Add an estimate" }));
    const stacked = await screen.findByRole("dialog", { name: "Add an estimate" });
    fireEvent.click(within(stacked).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add an estimate" })).toBeNull());
    everyListChanges();
    await act(() => client.refetchQueries());
    await settle(client);
    expect(rows()).toEqual(before);
  });

  it("shows a meal saved from the stacked sheet in its place by name, from the save's answer", async () => {
    const client = appClient();
    renderDay(client);
    const opened = await openLogSheet();
    await settle(client);
    const before = rows();
    // Every read after the save hangs, so only the save's answer can put the meal in the list.
    jest.mocked(getSavedMeals).mockImplementation(() => new Promise(() => {}));
    fireEvent.click(within(opened).getByRole("button", { name: "New meal" }));
    const stacked = await screen.findByRole("dialog", { name: "New meal" });
    for (const [label, value] of [
      ["Name", "Arctic soup"],
      ["Calories", "300"],
      ["Protein", "20"],
      ["Carbohydrates", "30"],
      ["Fat", "10"],
    ]) {
      fireEvent.change(within(stacked).getByLabelText(label, { selector: "input" }), { target: { value } });
    }
    fireEvent.click(within(stacked).getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New meal" })).toBeNull());
    expect(createSavedMeal).toHaveBeenCalledTimes(1);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(rows()).toEqual({ ...before, "My meals": ["Arctic soup", ...before["My meals"]] });
  });

  it("on a phone, follows a read that lands while the sheet slides in, then holds once it is at rest", async () => {
    const restorePhone = stubPhone();
    // The sheet's entry ends when the test says so. The guard arms no sooner
    // than that, however long the reads below take on this machine: the arm
    // delay alone, on the real clock, never arms it.
    const animations = controlSheetAnimations();
    try {
      const client = appClient();
      renderDay(client);
      const opened = await openLogSheet();
      const guard = (): Element | null => opened.querySelector("[data-press-guard]");
      // Not at rest yet: presses wait, so the list may still take what is read.
      expect(guard()).toHaveAttribute("data-press-guard", "waiting");
      everyListChanges();
      await act(() => client.refetchQueries());
      await settle(client);
      expect(guard()).toHaveAttribute("data-press-guard", "waiting");
      expect(rows()).toEqual(FRESH);
      // The entry ends (Base UI may ask for the animations more than once): at rest, armed.
      await waitFor(() => {
        animations.finish();
        expect(guard()).toHaveAttribute("data-press-guard", "armed");
      });
      const atRest = rows();
      world.server.recents = [...world.server.recents].reverse();
      await act(() => client.refetchQueries());
      await settle(client);
      expect(rows()).toEqual(atRest);
    } finally {
      animations.restore();
      restorePhone();
    }
  });
});

// A food or a saved meal found gone leaves every list at once, also while the
// lists hold: the person's own press found it gone, and its row can only say so again.
describe("A food or a saved meal found gone in the open log sheet", () => {
  jest.setTimeout(15_000);

  /** Deleted on another device: the server no longer has the food, nor its recent item. */
  function deleteFoodOnServer(food: FoodSummary): void {
    world.server.foods.delete(food.id);
    world.server.recents = world.server.recents.filter((i) => i.kind !== "food" || i.food.id !== food.id);
    favourites = favourites.filter((f) => f.id !== food.id);
  }

  it("'+' on a recent food that is gone: the notice shows and the row leaves Recent and Favourites", async () => {
    const client = appClient();
    favourites = [{ ...world.banana, isFavourite: true, lastAmount: { grams: 110, portion: null } }, ...favourites];
    renderDay(client);
    await openLogSheet();
    await settle(client);
    const before = rows();
    expect(before.Recent).toEqual(["Quark", "Banana", "Shake", "Shakshuka"]);
    expect(before.Favourites).toEqual(["Banana", "Oats"]);
    deleteFoodOnServer(world.banana);
    fireEvent.click(plus("Log Banana again, 2 × Piece · 110 g"));
    expect(await within(sheet()).findByText("This food is no longer available.")).toBeInTheDocument();
    await waitFor(() => expect(rows().Recent).toEqual(["Quark", "Shake", "Shakshuka"]));
    await settle(client);
    expect(rows()).toEqual({ ...before, Recent: ["Quark", "Shake", "Shakshuka"], Favourites: ["Oats"] });
  });

  it("'+' on a recent saved meal that is gone: the notice shows and the row leaves Recent and My meals", async () => {
    const client = appClient();
    renderDay(client);
    await openLogSheet();
    await settle(client);
    const before = rows();
    expect(before["My meals"]).toEqual(["Shake"]);
    world.server.meals.delete(world.shake.id);
    fireEvent.click(plus("Log Shake again, 1 meal"));
    expect(await within(sheet()).findByText("This saved meal is no longer available.")).toBeInTheDocument();
    await waitFor(() => expect(rows().Recent).toEqual(["Quark", "Banana", "Shakshuka"]));
    await settle(client);
    expect(rows()).toEqual({ ...before, Recent: ["Quark", "Banana", "Shakshuka"], "My meals": [] });
  });

  it("Log from the view of a food that is gone: back to browsing with the notice, without the row", async () => {
    const client = appClient();
    renderDay(client);
    await openLogSheet();
    await settle(client);
    const before = rows();
    const recent = within(sheet()).getByRole("region", { name: "Recent" });
    fireEvent.click(within(recent).getByRole("button", { name: /^Banana/ }));
    // The food view names the sheet after the food.
    const view = await screen.findByRole("dialog", { name: "Banana" });
    await within(view).findByRole("button", { name: "Back" });
    deleteFoodOnServer(world.banana);
    fireEvent.click(within(view).getByRole("button", { name: /^(Log|Add to plan)$/ }));
    await screen.findByRole("dialog", { name: "Log food" });
    expect(await within(sheet()).findByText("This food is no longer available.")).toBeInTheDocument();
    await settle(client);
    expect(rows()).toEqual({ ...before, Recent: ["Quark", "Shake", "Shakshuka"] });
  });

  it("'+' on a recent recipe that is gone: the notice shows and the row leaves Recent and Recipes", async () => {
    const client = appClient();
    renderDay(client);
    await openLogSheet();
    await settle(client);
    const before = rows();
    expect(before.Recipes).toEqual(["Shakshuka", "Lentil soup"]);
    // Deleted on another device: the server no longer takes an entry of it, and lists it nowhere.
    world.server.recipes.delete(world.shakshuka.id);
    world.server.recipeSummaries = world.server.recipeSummaries.filter((r) => r.id !== world.shakshuka.id);
    fireEvent.click(plus("Log Shakshuka again, 1.5 servings"));
    expect(await within(sheet()).findByText("This recipe is no longer available.")).toBeInTheDocument();
    await waitFor(() => expect(rows().Recent).toEqual(["Quark", "Banana", "Shake"]));
    await settle(client);
    expect(rows()).toEqual({ ...before, Recent: ["Quark", "Banana", "Shake"], Recipes: ["Lentil soup"] });
  });
});

// The first open after a page load: the lists answer one by one, and a list
// that fills late would push the others down under the finger. No list shows
// a row until every list has its first answer, and then all of them show in
// one render (components/log/heldList.tsx).
describe("The first read of the log sheet's lists", () => {
  jest.setTimeout(15_000);

  type Held<T> = { promise: Promise<T>; resolve: (value: T) => void };
  function held<T>(): Held<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }
  type Recents = Awaited<ReturnType<typeof getRecents>>;
  type Meals = Awaited<ReturnType<typeof getSavedMeals>>;

  /** The recent items and the active saved meals wait for `release`; the favourites and own foods answer. */
  function slowRecentsAndMeals(): { recents: Held<Recents>; meals: Held<Meals> } {
    const recents = held<Recents>();
    const meals = held<Meals>();
    jest.mocked(getRecents).mockImplementation(() => recents.promise);
    jest
      .mocked(getSavedMeals)
      .mockImplementation((archived) => (archived ? Promise.resolve(world.server.mealList(true)) : meals.promise));
    return { recents, meals };
  }

  /** Opens the sheet once the favourites and own foods have answered. */
  async function openWithFastListsIn(client: QueryClient): Promise<void> {
    renderDay(client);
    await openLogSheet();
    await waitFor(() => expect(client.getQueryData(queryKeys.foodFavourites())).toBeDefined());
    await waitFor(() => expect(client.getQueryData(queryKeys.foodOwn())).toBeDefined());
    await act(() => new Promise((r) => setTimeout(r, 50)));
  }

  const againButtons = (): HTMLElement[] => within(sheet()).queryAllByRole("button", { name: /^Log .+ again, / });
  const guard = (): HTMLElement => sheet().querySelector<HTMLElement>("[data-lists-guard]")!;

  it("shows no row of any list until the last list answers, then every list's rows at once", async () => {
    const { recents, meals } = slowRecentsAndMeals();
    const client = appClient();
    await openWithFastListsIn(client);
    expect(within(sheet()).queryAllByRole("listitem")).toHaveLength(0);
    expect(againButtons()).toHaveLength(0);
    // The headings and the create actions are there to see and to press.
    for (const list of LISTS) expect(within(sheet()).getByRole("region", { name: list })).toBeInTheDocument();
    expect(within(sheet()).getByRole("button", { name: "New meal" })).toBeInTheDocument();
    await act(async () => recents.resolve(world.server.recentList()));
    await act(() => new Promise((r) => setTimeout(r, 50)));
    // One list still has no answer: the one that has waits with the rest.
    expect(within(sheet()).queryAllByRole("listitem")).toHaveLength(0);
    await act(async () => meals.resolve(world.server.mealList(false)));
    await waitFor(() => expect(within(sheet()).queryAllByRole("listitem").length).toBeGreaterThan(0));
    expect(rows()).toEqual({
      Recent: ["Quark", "Banana", "Shake", "Shakshuka"],
      Favourites: ["Oats"],
      Recipes: ["Shakshuka", "Lentil soup"],
      "My meals": ["Shake"],
      "My foods": ["Rye bread"],
    });
  });

  it("waits for the recipes too: no list shows a row until the Recipes list has answered", async () => {
    const recipes = held<Awaited<ReturnType<typeof getRecipes>>>();
    jest.mocked(getRecipes).mockImplementation(() => recipes.promise);
    const client = appClient();
    await openWithFastListsIn(client);
    await waitFor(() => expect(client.getQueryData(queryKeys.recents())).toBeDefined());
    await waitFor(() => expect(client.getQueryData(queryKeys.savedMealList(false))).toBeDefined());
    await act(() => new Promise((r) => setTimeout(r, 50)));
    // Every other list has its answer, and waits with the one that has not.
    expect(within(sheet()).queryAllByRole("listitem")).toHaveLength(0);
    await act(async () => recipes.resolve(world.server.recipeList(false)));
    await waitFor(() => expect(within(sheet()).queryAllByRole("listitem").length).toBeGreaterThan(0));
    expect(rows().Recipes).toEqual(["Shakshuka", "Lentil soup"]);
    expect(rows().Recent).toEqual(["Quark", "Banana", "Shake", "Shakshuka"]);
  });

  it("sends no add while the lists wait, and a press that started before the rows were in place logs nothing", async () => {
    const { recents, meals } = slowRecentsAndMeals();
    const client = appClient();
    await openWithFastListsIn(client);
    expect(againButtons()).toHaveLength(0);
    for (const button of within(sheet()).queryAllByRole("button")) {
      if (/^Log .+ again/.test(button.getAttribute("aria-label") ?? "")) fireEvent.click(button);
    }
    // A finger goes down on what is under it while the lists wait.
    fireEvent.pointerDown(within(sheet()).getByRole("button", { name: "Archived meals" }));
    // The delay after the rows on a clock the test moves, so the rows stay settling until it says.
    jest.useFakeTimers();
    try {
      await act(async () => {
        recents.resolve(world.server.recentList());
        meals.resolve(world.server.mealList(false));
        // TanStack's notify, the render, and the frame that paints the rows.
        await jest.advanceTimersByTimeAsync(20);
      });
      expect(guard()).toHaveAttribute("data-lists-guard", "settling");
      // It comes up on the row now there: that press started before the row was.
      tapClick(plus("Log Oats again, 80 g"));
      await act(() => jest.advanceTimersByTimeAsync(50));
      expect(addEntry).not.toHaveBeenCalled();
      await act(() => jest.advanceTimersByTimeAsync(ARM_DELAY_MS));
      expect(guard()).toHaveAttribute("data-lists-guard", "armed");
      expect(addEntry).not.toHaveBeenCalled();
      // A press on the row in place logs that row's own item.
      tap(plus("Log Oats again, 80 g"));
      await act(() => jest.advanceTimersByTimeAsync(50));
      expect(addEntry).toHaveBeenCalledTimes(1);
      expect(jest.mocked(addEntry).mock.calls[0][0]).toMatchObject({ kind: "food", foodId: world.oats.id });
    } finally {
      jest.useRealTimers();
    }
  });

  it("after a wait, ignores a whole press until ARM_DELAY_MS after the rows are painted, then logs the row under it", async () => {
    const { recents, meals } = slowRecentsAndMeals();
    const client = appClient();
    await openWithFastListsIn(client);
    expect(guard()).toHaveAttribute("data-lists-guard", "waiting");
    jest.useFakeTimers();
    try {
      await act(async () => {
        recents.resolve(world.server.recentList());
        meals.resolve(world.server.mealList(false));
        // TanStack's notify, the render, and the frame that paints the rows.
        await jest.advanceTimersByTimeAsync(20);
      });
      expect(rows().Favourites).toEqual(["Oats"]);
      await act(() => jest.advanceTimersByTimeAsync(80));
      // A person who aimed before the rows came presses 100 ms after them: a press that starts and ends now.
      const press = (): void => {
        tap(plus("Log Oats again, 80 g"));
      };
      press();
      await act(() => jest.advanceTimersByTimeAsync(50));
      expect(addEntry).not.toHaveBeenCalled();
      await act(() => jest.advanceTimersByTimeAsync(ARM_DELAY_MS));
      expect(guard()).toHaveAttribute("data-lists-guard", "armed");
      press();
      await act(() => jest.advanceTimersByTimeAsync(50));
      expect(addEntry).toHaveBeenCalledTimes(1);
      expect(jest.mocked(addEntry).mock.calls[0][0]).toMatchObject({ kind: "food", foodId: world.oats.id });
    } finally {
      jest.useRealTimers();
    }
  });

  /** Lets the waiting lists answer on the fake clock, then waits until their rows are at rest. */
  async function answerAndSettle(recents: Held<Recents>, meals: Held<Meals>): Promise<void> {
    await act(async () => {
      recents.resolve(world.server.recentList());
      meals.resolve(world.server.mealList(false));
      // TanStack's notify, the render, and the frame that paints the rows.
      await jest.advanceTimersByTimeAsync(20);
    });
    await act(() => jest.advanceTimersByTimeAsync(ARM_DELAY_MS + 50));
    expect(guard()).toHaveAttribute("data-lists-guard", "armed");
  }

  it("a touch that turns into a scroll while the lists wait holds no later press: a screen reader's activation logs the row", async () => {
    const { recents, meals } = slowRecentsAndMeals();
    const client = appClient();
    await openWithFastListsIn(client);
    expect(guard()).toHaveAttribute("data-lists-guard", "waiting");
    // A finger goes down on the lists, and the browser takes it for a scroll: no pointerup and no click follow.
    const archived = within(sheet()).getByRole("button", { name: "Archived meals" });
    fireEvent.pointerDown(archived);
    fireEvent.pointerCancel(archived);
    jest.useFakeTimers();
    try {
      await answerAndSettle(recents, meals);
      // A screen reader's activation, which can count as one click and comes with no pointerdown.
      tapClick(plus("Log Oats again, 80 g"));
      await act(() => jest.advanceTimersByTimeAsync(50));
      expect(addEntry).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a press that never ended while the lists waited holds no Enter once the rows are at rest", async () => {
    const { recents, meals } = slowRecentsAndMeals();
    const client = appClient();
    await openWithFastListsIn(client);
    fireEvent.pointerDown(within(sheet()).getByRole("button", { name: "Archived meals" }));
    jest.useFakeTimers();
    try {
      await answerAndSettle(recents, meals);
      // Enter: a click with no pointer of its own (`detail` 0).
      fireEvent.click(plus("Log Oats again, 80 g"));
      await act(() => jest.advanceTimersByTimeAsync(50));
      expect(addEntry).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a press that started while the lists waited and ends once they are at rest logs nothing", async () => {
    const { recents, meals } = slowRecentsAndMeals();
    await openWithFastListsIn(appClient());
    fireEvent.pointerDown(within(sheet()).getByRole("button", { name: "Archived meals" }));
    jest.useFakeTimers();
    try {
      await answerAndSettle(recents, meals);
      // The same press, still down, ends on the row now there.
      expect(tapClick(plus("Log Oats again, 80 g")).defaultPrevented).toBe(true);
      await act(() => jest.advanceTimersByTimeAsync(50));
      expect(addEntry).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("takes a list that cannot be read as answered: its line shows with the other lists' rows", async () => {
    const recents = held<Recents>();
    jest.mocked(getRecents).mockImplementation(() => recents.promise);
    jest.mocked(getSavedMeals).mockRejectedValue(
      Object.assign(new Error("Request failed with status code 500"), {
        isAxiosError: true,
        response: { status: 500, data: { code: "internal_error" } },
      }),
    );
    const client = appClient();
    await openWithFastListsIn(client);
    await waitFor(() => expect(getSavedMeals).toHaveBeenCalled());
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(within(sheet()).queryAllByRole("listitem")).toHaveLength(0);
    const line = /^Your recent items, recipes and saved meals show here once/;
    expect(within(sheet()).queryByText(line)).toBeNull();
    await act(async () => recents.resolve(world.server.recentList()));
    await waitFor(() => expect(within(sheet()).queryAllByRole("listitem").length).toBeGreaterThan(0));
    expect(rows()).toEqual({
      Recent: ["Quark", "Banana", "Shake", "Shakshuka"],
      Favourites: ["Oats"],
      Recipes: ["Shakshuka", "Lentil soup"],
      "My meals": [],
      "My foods": ["Rye bread"],
    });
    expect(within(within(sheet()).getByRole("region", { name: "My meals" })).getByText(line)).toBeInTheDocument();
  });

  it("shows the rows in its first render when every list is cached", async () => {
    const client = appClient();
    client.setQueryData(queryKeys.recents(), world.server.recentList());
    client.setQueryData(queryKeys.foodFavourites(), { foods: favourites });
    client.setQueryData(queryKeys.savedMealList(false), world.server.mealList(false));
    client.setQueryData(queryKeys.recipeList(false), world.server.recipeList(false));
    client.setQueryData(queryKeys.foodOwn(), { foods: own });
    renderDay(client);
    await openLogSheet();
    // The render that shows the headings shows the rows, and presses count at once.
    expect(rows()).toEqual({
      Recent: ["Quark", "Banana", "Shake", "Shakshuka"],
      Favourites: ["Oats"],
      Recipes: ["Shakshuka", "Lentil soup"],
      "My meals": ["Shake"],
      "My foods": ["Rye bread"],
    });
    expect(guard()).toHaveAttribute("data-lists-guard", "armed");
    // No wait, so no delay: a press at once logs the row under it.
    tap(plus("Log Oats again, 80 g"));
    await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(1));
    expect(jest.mocked(addEntry).mock.calls[0][0]).toMatchObject({ kind: "food", foodId: world.oats.id });
  });
});
