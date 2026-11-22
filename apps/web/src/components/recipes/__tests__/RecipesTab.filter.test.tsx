import { fakeAuth } from "@/__tests__/helpers/auth";
import { deferred } from "@/__tests__/helpers/queryClient";
import { getSheetBackdrop, pressOutsideSheet } from "@/__tests__/sheet";
import { TODAY } from "@/components/day/__tests__/support";
import { chipOff, chipOn, chipRowEnd } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { getRecipes as getRecipesApi } from "@/lib/api/recipes";
import { formatDayShort } from "@/lib/localDate";
import { readListPlace } from "@/lib/recipeNav";
import { filterRecipes, sortRecipes, type Recipe, type RecipeList } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { EGG, FETA, OIL, recipeOf, TOMATO } from "./recipeFixtures";
import { FakeRecipes, serveRecipes } from "./recipeServer";
import { pinClock, renderRecipes, serveFoods, serveMeals } from "./recipesHarness";

// The Recipes tab's filter sheet and sorts: the Filter chip and its count,
// the draft the sheet holds, Clear, the bounds and the orders, the row's
// third line, and the filter kept on the way to a recipe and back. The list
// is filtered and sorted by the shared functions, so every expected list
// here is what those functions give for the same recipes.

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
const mockSearch = { params: new URLSearchParams() };
const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearch.params,
  usePathname: () => "/recipes",
}));
jest.mock("@/lib/api/recipes", () => ({
  getRecipes: jest.fn(),
  getRecipe: jest.fn(),
  createRecipe: jest.fn(),
  updateRecipe: jest.fn(),
  setRecipeArchived: jest.fn(),
  setRecipeFavourite: jest.fn(),
  deleteRecipe: jest.fn(),
}));

jest.setTimeout(15_000);

let clock: jest.SpyInstance;
let recipeServer: FakeRecipes;
let main: HTMLElement;
let scrolledTo: number[];
const start = window.location.pathname + window.location.search;

/** Five recipes whose figures per serving differ, from their lines: two on a day, three never. */
const RECIPES = (): Recipe[] => [
  // 2 servings of 240 g egg: 171.6 kcal and 15.1 g protein each.
  recipeOf("Eggs", 2, [{ food: EGG, grams: 240 }], { lastPutOn: "2026-11-14", tags: ["Breakfast"] }),
  // 1 serving of 400 g tomato: 96 kcal and 4.8 g protein.
  recipeOf("Tomato soup", 1, [{ food: TOMATO, grams: 400 }], { lastPutOn: "2026-11-21" }),
  // 1 serving of 200 g feta: 528 kcal and 28.4 g protein.
  recipeOf("Feta bake", 1, [{ food: FETA, grams: 200 }], { favourite: true }),
  // 1 serving of 300 g egg and 20 g oil: 605.8 kcal and 37.8 g protein.
  recipeOf(
    "Big omelette",
    1,
    [
      { food: EGG, grams: 300 },
      { food: OIL, grams: 20 },
    ],
    {},
  ),
  // 4 servings of 60 g feta: 39.6 kcal and 2.1 g protein each.
  recipeOf("Crumbs", 4, [{ food: FETA, grams: 60 }], {}),
];

beforeEach(() => {
  mockSearch.params = new URLSearchParams();
  mockRouter.replace.mockReset();
  mockRouter.push.mockReset();
  recipeServer = serveRecipes(new FakeRecipes(RECIPES()));
  clock = pinClock();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  serveFoods([]);
  serveMeals([]);
  main = document.createElement("main");
  document.body.append(main);
  scrolledTo = [];
  main.scrollTo = ((options: ScrollToOptions) => scrolledTo.push(options.top ?? 0)) as typeof main.scrollTo;
  // The list's own history entry, with nothing on it.
  window.history.pushState(null, "", "/recipes");
});
afterEach(() => {
  clock.mockRestore();
  main.remove();
  window.history.replaceState(null, "", start);
});

const summaries = () => recipeServer.list(false).recipes;
const idOf = (name: string) => summaries().find((r) => r.name === name)!.id;
const rowOf = (name: string) => document.querySelector<HTMLElement>(`[data-recipe-row="${idOf(name)}"]`)!;
const recipeNames = () =>
  [...document.querySelectorAll('[data-list="recipes"] [data-recipe-row]')].map(
    (row) => row.querySelector(".line-clamp-2")!.textContent,
  );
/** What the shared filter and sort give for the server's recipes: the list the screen must show. */
const expected = (filter: Parameters<typeof filterRecipes>[1], sort: Parameters<typeof sortRecipes>[1]) =>
  sortRecipes(filterRecipes(summaries(), filter), sort).map((r) => r.name);
const filterChip = () => document.querySelector<HTMLElement>("[data-recipe-filter]")!;
const sheet = () => screen.getByRole("dialog", { name: "Filter recipes" });
const sheetOpen = () => document.querySelector('[role="dialog"][data-open]') !== null;
const sortSelect = () => within(sheet()).getByLabelText("Sort by") as HTMLSelectElement;
const bound = (label: string) => within(sheet()).getByLabelText(label, { selector: "input" }) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(bound(label), { target: { value } });
const show = () => fireEvent.click(within(sheet()).getByRole("button", { name: "Show recipes" }));
const has = (el: Element, recipe: string) => recipe.split(" ").every((token) => el.classList.contains(token));

async function renderLoaded(client?: Parameters<typeof renderRecipes>[0]): Promise<ReturnType<typeof renderRecipes>> {
  const view = renderRecipes(client);
  await waitFor(() => expect(recipeNames()).toHaveLength(5));
  return view;
}

async function openFilter(): Promise<void> {
  fireEvent.click(filterChip());
  await screen.findByRole("dialog", { name: "Filter recipes" });
}

describe("The Filter chip", () => {
  it("ends the chip row from the first frame, reads Filter and is not chosen while nothing is in force", () => {
    jest.mocked(getRecipesApi).mockReturnValueOnce(new Promise(() => {}));
    renderRecipes();
    const row = document.querySelector<HTMLElement>("[data-recipe-chips]")!;
    const chips = within(row).getAllByRole("button");
    expect(chips.at(-1)).toBe(filterChip());
    expect(filterChip()).toHaveAccessibleName("Filter");
    expect(filterChip()).toHaveAttribute("aria-haspopup", "dialog");
    expect(has(filterChip(), chipOff)).toBe(true);
    expect(has(filterChip(), chipOn)).toBe(false);
  });

  it("stays outside the chips that scroll or wrap, so it keeps its place however many tags there are", async () => {
    await renderLoaded();
    const row = document.querySelector<HTMLElement>("[data-recipe-chips]")!;
    // The row's two children: the chips that scroll on a phone, then Filter.
    expect([...row.children]).toEqual([row.firstElementChild, filterChip()]);
    // "Show only" names the chips that narrow the list. Filter opens a dialog, so it stands outside that group.
    const group = screen.getByRole("group", { name: "Show only" });
    expect(group).toBe(row.firstElementChild);
    expect(group.contains(filterChip())).toBe(false);
    expect(row).not.toHaveAttribute("role");
    expect(row.firstElementChild!.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["overflow-x-auto", "flex-1", "md:flex-wrap"]),
    );
    // One width with and without its count, so a count that comes and goes moves no chip.
    expect(has(filterChip(), chipRowEnd)).toBe(true);
    expect(
      within(row.firstElementChild as HTMLElement)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Favourites", "Breakfast"]);
  });

  it("counts each bound set and a sort other than name, is drawn as chosen, and says the count aloud", async () => {
    await renderLoaded();
    await openFilter();
    type("Protein at least", "10");
    show();
    await waitFor(() => expect(filterChip()).toHaveTextContent("Filter · 1"));
    expect(filterChip()).toHaveAccessibleName("Filter, 1 set");
    expect(has(filterChip(), chipOn)).toBe(true);
    await openFilter();
    fireEvent.change(sortSelect(), { target: { value: "protein" } });
    type("Calories at most", "600");
    show();
    await waitFor(() => expect(filterChip()).toHaveTextContent("Filter · 3"));
    expect(filterChip()).toHaveAccessibleName("Filter, 3 set");
    // A sort alone keeps it on.
    await openFilter();
    type("Protein at least", "");
    type("Calories at most", "");
    show();
    await waitFor(() => expect(filterChip()).toHaveTextContent("Filter · 1"));
    expect(has(filterChip(), chipOn)).toBe(true);
  });
});

describe("The filter sheet", () => {
  it("opens on what is in force: by name, with no bound", async () => {
    await renderLoaded();
    await openFilter();
    expect(sortSelect().value).toBe("name");
    expect([...sortSelect().options].map((o) => o.textContent)).toEqual([
      "Name",
      "Last on a day",
      "Most protein per serving",
      "Fewest calories per serving",
    ]);
    for (const label of ["Protein at least", "Protein at most", "Calories at least", "Calories at most"]) {
      expect(bound(label).value).toBe("");
    }
    // The four bounds sit under one heading, and each names its unit.
    const group = within(sheet()).getByRole("group", { name: "Per serving" });
    expect(within(group).getAllByRole("textbox")).toHaveLength(4);
    expect(bound("Protein at least")).toHaveAccessibleDescription("g");
    expect(bound("Calories at most")).toHaveAccessibleDescription("kcal");
  });

  it("holds a draft: nothing typed or chosen moves the list or the chip until Show recipes", async () => {
    await renderLoaded();
    const before = recipeNames();
    expect(before).toEqual(expected({ archived: false }, "name"));
    await openFilter();
    type("Protein at least", "20");
    type("Calories at most", "550");
    fireEvent.change(sortSelect(), { target: { value: "protein" } });
    // The list under the sheet, row for row, and the chip, are as they were.
    expect(recipeNames()).toEqual(before);
    expect(filterChip()).toHaveTextContent(/^Filter$/);
    show();
    const narrowed = expected({ archived: false, minProteinG: 20, maxEnergyKcal: 550 }, "protein");
    expect(narrowed).toEqual(["Feta bake"]);
    await waitFor(() => expect(recipeNames()).toEqual(narrowed));
    await waitFor(() => expect(sheetOpen()).toBe(false));
    expect(filterChip()).toHaveTextContent("Filter · 3");
  });

  it("Cancel leaves the list and the chip as they were, and the next open starts from what is in force", async () => {
    await renderLoaded();
    await openFilter();
    type("Protein at least", "20");
    show();
    await waitFor(() => expect(recipeNames()).toEqual(expected({ archived: false, minProteinG: 20 }, "name")));
    const inForce = recipeNames();
    await openFilter();
    expect(bound("Protein at least").value).toBe("20");
    type("Protein at least", "500");
    fireEvent.change(sortSelect(), { target: { value: "energy" } });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(sheetOpen()).toBe(false));
    expect(recipeNames()).toEqual(inForce);
    expect(filterChip()).toHaveTextContent("Filter · 1");
    await openFilter();
    expect(bound("Protein at least").value).toBe("20");
    expect(sortSelect().value).toBe("name");
  });

  it("Clear empties the draft, and the list follows only with Show recipes", async () => {
    await renderLoaded();
    await openFilter();
    type("Protein at least", "20");
    fireEvent.change(sortSelect(), { target: { value: "energy" } });
    show();
    const inForce = expected({ archived: false, minProteinG: 20 }, "energy");
    await waitFor(() => expect(recipeNames()).toEqual(inForce));
    await openFilter();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Clear" }));
    expect(bound("Protein at least").value).toBe("");
    expect(sortSelect().value).toBe("name");
    // Still the filtered list, and the sheet still open.
    expect(recipeNames()).toEqual(inForce);
    expect(filterChip()).toHaveTextContent("Filter · 2");
    expect(sheetOpen()).toBe(true);
    show();
    await waitFor(() => expect(recipeNames()).toEqual(expected({ archived: false }, "name")));
    expect(filterChip()).toHaveTextContent(/^Filter$/);
    expect(has(filterChip(), chipOff)).toBe(true);
  });

  it("keeps a figure as it is shown: at least 28.4 g keeps the recipe that shows 28.4 g", async () => {
    await renderLoaded();
    await openFilter();
    type("Protein at least", "28,4");
    type("Protein at most", "37.8");
    show();
    const kept = expected({ archived: false, minProteinG: 28.4, maxProteinG: 37.8 }, "name");
    expect(kept).toEqual(["Big omelette", "Feta bake"]);
    await waitFor(() => expect(recipeNames()).toEqual(kept));
  });

  it("refuses a bound it cannot read in the line its pair shares, moves nothing, and stays open", async () => {
    await renderLoaded();
    const before = recipeNames();
    await openFilter();
    type("Protein at most", "lots");
    type("Calories at least", "2,000");
    show();
    expect(within(sheet()).getByText("Enter a number, one decimal at most.")).toBeInTheDocument();
    expect(within(sheet()).getByText("No comma or point, or fewer decimals.")).toBeInTheDocument();
    expect(bound("Protein at most")).toHaveAttribute("aria-invalid", "true");
    expect(bound("Protein at least")).not.toHaveAttribute("aria-invalid");
    expect(bound("Protein at most")).toHaveFocus();
    expect(sheetOpen()).toBe(true);
    expect(recipeNames()).toEqual(before);
    expect(filterChip()).toHaveTextContent(/^Filter$/);
    // Typing in the refused field takes its line away.
    type("Protein at most", "30");
    expect(within(sheet()).queryByText("Enter a number, one decimal at most.")).toBeNull();
  });

  it("drops a changed draft on Escape, a press outside and Cancel alike: each closes it and the list stays", async () => {
    await renderLoaded();
    await openFilter();
    type("Protein at least", "20");
    show();
    await waitFor(() => expect(recipeNames()).toEqual(expected({ archived: false, minProteinG: 20 }, "name")));
    const inForce = recipeNames();
    for (const dismiss of [
      () => fireEvent.keyDown(document, { key: "Escape" }),
      () => pressOutsideSheet(getSheetBackdrop()),
      () => fireEvent.click(within(sheet()).getByRole("button", { name: "Cancel" })),
    ]) {
      (document.activeElement as HTMLElement | null)?.blur();
      await openFilter();
      // A draft that differs from what is in force, in a bound and in the order.
      type("Protein at least", "500");
      fireEvent.change(sortSelect(), { target: { value: "energy" } });
      dismiss();
      await waitFor(() => expect(sheetOpen()).toBe(false));
      expect(recipeNames()).toEqual(inForce);
      expect(filterChip()).toHaveTextContent("Filter · 1");
      expect(filterChip()).toHaveFocus();
    }
    // The next open starts from what is in force, not from the draft that was dropped.
    await openFilter();
    expect(bound("Protein at least").value).toBe("20");
    expect(sortSelect().value).toBe("name");
  });

  it("takes a bound with one decimal and refuses one with two", async () => {
    await renderLoaded();
    const before = recipeNames();
    await openFilter();
    type("Protein at least", "28.45");
    show();
    expect(within(sheet()).getByText("Enter a number, one decimal at most.")).toBeInTheDocument();
    expect(bound("Protein at least")).toHaveAttribute("aria-invalid", "true");
    expect(sheetOpen()).toBe(true);
    expect(recipeNames()).toEqual(before);
    type("Protein at least", "28.4");
    show();
    await waitFor(() => expect(recipeNames()).toEqual(expected({ archived: false, minProteinG: 28.4 }, "name")));
  });

  it("gives focus back to the Filter chip by every way out", async () => {
    await renderLoaded();
    for (const leave of [
      () => fireEvent.click(within(sheet()).getByRole("button", { name: "Cancel" })),
      () => fireEvent.keyDown(document, { key: "Escape" }),
      () => {
        type("Protein at least", "5");
        show();
      },
    ]) {
      // A tap: the chip is not focused as the sheet opens.
      (document.activeElement as HTMLElement | null)?.blur();
      await openFilter();
      leave();
      await waitFor(() => expect(sheetOpen()).toBe(false));
      expect(filterChip()).toHaveFocus();
    }
  });
});

describe("The list under a sort", () => {
  it("orders by protein, most first, and by calories, fewest first, as the shared sort does", async () => {
    await renderLoaded();
    await openFilter();
    fireEvent.change(sortSelect(), { target: { value: "protein" } });
    show();
    const byProtein = expected({ archived: false }, "protein");
    expect(byProtein).toEqual(["Big omelette", "Feta bake", "Eggs", "Tomato soup", "Crumbs"]);
    await waitFor(() => expect(recipeNames()).toEqual(byProtein));
    await openFilter();
    fireEvent.change(sortSelect(), { target: { value: "energy" } });
    show();
    const byEnergy = expected({ archived: false }, "energy");
    expect(byEnergy).toEqual(["Crumbs", "Tomato soup", "Eggs", "Feta bake", "Big omelette"]);
    await waitFor(() => expect(recipeNames()).toEqual(byEnergy));
  });

  it("gains a third line under the last-on-a-day sort, and loses it under any other", async () => {
    await renderLoaded();
    expect(document.querySelector("[data-recipe-last-on]")).toBeNull();
    await openFilter();
    fireEvent.change(sortSelect(), { target: { value: "lastPutOn" } });
    show();
    const byDay = expected({ archived: false }, "lastPutOn");
    expect(byDay).toEqual(["Tomato soup", "Eggs", "Big omelette", "Crumbs", "Feta bake"]);
    await waitFor(() => expect(recipeNames()).toEqual(byDay));
    const lines = byDay.map((name) => rowOf(name).querySelector("[data-recipe-last-on]")!.textContent);
    // The date as the device writes it: rendering, so the test asks the same formatter.
    expect(lines).toEqual([
      `On a day ${formatDayShort("2026-11-21", undefined, TODAY)}`,
      `On a day ${formatDayShort("2026-11-14", undefined, TODAY)}`,
      "Not on a day yet",
      "Not on a day yet",
      "Not on a day yet",
    ]);
    // Under the figures, the row's last line.
    const spans = [...rowOf("Eggs").firstElementChild!.children];
    expect(spans.at(-1)).toBe(rowOf("Eggs").querySelector("[data-recipe-last-on]"));
    await openFilter();
    fireEvent.change(sortSelect(), { target: { value: "name" } });
    show();
    await waitFor(() => expect(document.querySelector("[data-recipe-last-on]")).toBeNull());
  });

  it("narrows with the search and the chips too, every one of them holding", async () => {
    await renderLoaded();
    await openFilter();
    type("Protein at least", "10");
    fireEvent.change(sortSelect(), { target: { value: "energy" } });
    show();
    await waitFor(() => expect(recipeNames()).toEqual(expected({ archived: false, minProteinG: 10 }, "energy")));
    fireEvent.click(screen.getByRole("button", { name: "Favourites" }));
    expect(recipeNames()).toEqual(expected({ archived: false, minProteinG: 10, favourites: true }, "energy"));
    fireEvent.click(screen.getByRole("button", { name: "Favourites" }));
    fireEvent.change(screen.getByLabelText("Search recipes"), { target: { value: "e" } });
    expect(recipeNames()).toEqual(expected({ archived: false, minProteinG: 10, q: "e" }, "energy"));
  });

  it("says how many recipes show when only a bound narrows the list", async () => {
    await renderLoaded();
    const said = () => document.querySelector("[data-recipe-list] [aria-live=polite]")!.textContent;
    expect(said()).toBe("");
    await openFilter();
    type("Protein at least", "20");
    show();
    const kept = expected({ archived: false, minProteinG: 20 }, "name");
    await waitFor(() => expect(recipeNames()).toEqual(kept));
    expect(kept).toHaveLength(2);
    expect(said()).toBe("2 recipes");
  });

  it("says when the bounds match none, and Clear search and filters takes the bounds and the order away, as the sheet's Clear does", async () => {
    await renderLoaded();
    await openFilter();
    type("Protein at least", "900");
    fireEvent.change(sortSelect(), { target: { value: "energy" } });
    show();
    expect(await screen.findByText("No recipe matches.")).toBeInTheDocument();
    expect(filterChip()).toHaveTextContent("Filter · 2");
    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(recipeNames()).toEqual(expected({ archived: false }, "name"));
    expect(expected({ archived: false }, "name")).not.toEqual(expected({ archived: false }, "energy"));
    // Nothing is left in force, so Filter reads plain and is not drawn as chosen.
    expect(filterChip()).toHaveTextContent(/^Filter$/);
    expect(has(filterChip(), chipOff)).toBe(true);
    expect(screen.getByLabelText("Search recipes")).toHaveFocus();
  });
});

describe("The filter on the way to a recipe and back", () => {
  /** A plain press on a row. The row is a link: the press is kept, and the test does not follow it. */
  function press(row: HTMLElement): void {
    row.addEventListener("click", (e) => e.preventDefault(), { once: true });
    fireEvent.click(row);
  }
  async function goBack(): Promise<void> {
    const moved = new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    window.history.back();
    await moved;
  }
  /** The list under a filter and a sort, scrolled, with a row pressed and the recipe's page opened. */
  async function leaveFiltered(): Promise<ReturnType<typeof renderRecipes>> {
    const first = await renderLoaded();
    await openFilter();
    type("Protein at least", "10");
    type("Calories at most", "600");
    fireEvent.change(sortSelect(), { target: { value: "lastPutOn" } });
    show();
    await waitFor(() => expect(recipeNames()).toEqual(["Eggs", "Feta bake"]));
    await waitFor(() => expect(sheetOpen()).toBe(false));
    main.scrollTop = 260;
    press(rowOf("Feta bake"));
    expect(readListPlace()).toMatchObject({
      sort: "lastPutOn",
      bounds: { minProteinG: 10, maxEnergyKcal: 600 },
      rowId: idOf("Feta bake"),
    });
    first.unmount();
    window.history.pushState(null, "", "/recipes/one");
    scrolledTo = [];
    return first;
  }

  it("comes back to the list under the same sort and bounds, from its first frame, with the chip on", async () => {
    const first = await leaveFiltered();
    await goBack();
    renderRecipes(first.client);
    expect(recipeNames()).toEqual(["Eggs", "Feta bake"]);
    expect(filterChip()).toHaveTextContent("Filter · 3");
    expect(rowOf("Eggs").querySelector("[data-recipe-last-on]")).not.toBeNull();
    expect(scrolledTo).toEqual([260]);
    expect(rowOf("Feta bake")).toHaveFocus();
    // The sheet opens on what came back.
    await openFilter();
    expect(sortSelect().value).toBe("lastPutOn");
    expect(bound("Protein at least").value).toBe("10");
    expect(bound("Calories at most").value).toBe("600");
    expect(bound("Protein at most").value).toBe("");
  });

  it("opens fresh by the tab bar: by name, no bound, the chip off", async () => {
    const first = await leaveFiltered();
    // The tab bar's Recipes: a new history entry.
    window.history.pushState(null, "", "/recipes");
    await renderLoaded(first.client);
    expect(recipeNames()).toEqual(expected({ archived: false }, "name"));
    expect(filterChip()).toHaveTextContent(/^Filter$/);
    expect(document.querySelector("[data-recipe-last-on]")).toBeNull();
    expect(scrolledTo).toEqual([0]);
  });
});

describe("A kept place and a list that answers late", () => {
  it("uses the place's scroll and focus only when the recipes are there as the list first shows", async () => {
    const place = {
      query: "e",
      favourites: false,
      tags: [],
      sort: "protein",
      bounds: { minProteinG: 10 },
      archivedOpen: false,
      top: 480,
      rowId: idOf("Feta bake"),
    };
    window.history.replaceState({ __NA: true, hoviRecipeList: place }, "");
    // After a reload on the recipe's page nothing is cached: the list is read as the tab shows, and answers late.
    const read = deferred<RecipeList>();
    jest.mocked(getRecipesApi).mockImplementationOnce(() => read.promise);
    renderRecipes();
    // The page is at its top, and the place is let go at once.
    expect(scrolledTo).toEqual([0]);
    expect(readListPlace()).toBeNull();
    // The person is already typing when the list answers.
    const search = screen.getByLabelText("Search recipes") as HTMLInputElement;
    expect(search.value).toBe("e");
    search.focus();
    await act(async () => read.resolve(recipeServer.list(false)));
    await waitFor(() => expect(recipeNames().length).toBeGreaterThan(0));
    // The row the place named is on screen, and is left alone: nothing scrolled since, and the focus is where
    // the person put it.
    expect(rowOf("Feta bake")).toBeInTheDocument();
    expect(scrolledTo).toEqual([0]);
    expect(search).toHaveFocus();
    // What the place held of the list itself is kept: the search, the sort and the bound.
    expect(filterChip()).toHaveTextContent("Filter · 2");
    expect(recipeNames()).toEqual(expected({ archived: false, q: "e", minProteinG: 10 }, "protein"));
  });
});
