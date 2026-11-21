import { fakeAuth } from "@/__tests__/helpers/auth";
import { deferred, queryWrapper } from "@/__tests__/helpers/queryClient";
import { confirmArmed, openSheet } from "@/__tests__/sheet";
import { recordToasts, seededClient, toasts } from "@/components/day/__tests__/harness";
import { TODAY } from "@/components/day/__tests__/support";
import { refusal } from "@/components/foods/__tests__/support";
import { timeout } from "@/components/log/__tests__/logHarness";
import { ToastProvider, ToastRegion } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { TodayContext } from "@/hooks/useToday";
import { getDay } from "@/lib/api/days";
import { addEntry } from "@/lib/api/entries";
import { deleteFood, getFood, getOwnFoods, updateFood } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { getRecipes as getRecipesApi } from "@/lib/api/recipes";
import {
  createSavedMeal,
  deleteSavedMeal,
  getSavedMeals,
  saveAndLog,
  setSavedMealArchived,
  updateSavedMeal,
} from "@/lib/api/savedMeals";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { readListPlace, setFocusAfterDelete, takeOpenedInApp } from "@/lib/recipeNav";
import type { SavedMeal } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import messages from "../../../../messages/en.json";
import { RecipesTab } from "../RecipesTab";
import { recipeOf, shakshuka } from "./recipeFixtures";
import { FakeRecipes, serveRecipes } from "./recipeServer";
import {
  foodStore,
  pinClock,
  renderRecipes,
  rowNames,
  savedMeal,
  section,
  serveFoods,
  serveMeals,
  topSheet,
} from "./recipesHarness";

// The Recipes tab on its own: its states, the saved meals (new, edit,
// archive, restore, delete) and the own foods (edit, delete), against the
// fake server of components/day/__tests__/harness.tsx and the food store of
// recipesHarness.tsx.

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
// The address the tab reads its segment from, set by each describe below.
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

const MOCKS = [
  getDay,
  addEntry,
  getRecents,
  getOwnFoods,
  getFood,
  updateFood,
  deleteFood,
  getSavedMeals,
  createSavedMeal,
  saveAndLog,
  updateSavedMeal,
  setSavedMealArchived,
  deleteSavedMeal,
];

let bowl: SavedMeal;
let soup: SavedMeal;
let server: ReturnType<typeof serveMeals>;
let clock: jest.SpyInstance;

let recipeServer: FakeRecipes;
beforeEach(() => {
  mockSearch.params = new URLSearchParams();
  mockRouter.replace.mockReset();
  mockRouter.push.mockReset();
  recipeServer = serveRecipes(new FakeRecipes());
  clock = pinClock();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of MOCKS) jest.mocked(fn).mockReset();
  bowl = savedMeal("Chicken bowl", "Wolt", { figures: { energyKcal: 640, proteinG: 42, carbsG: 61, fatG: 22.5 } });
  soup = savedMeal("Salmon soup", "Foodora");
  serveFoods(["Rye bread", "Protein shake"]);
  server = serveMeals([bowl, soup]);
});

afterEach(() => clock.mockRestore());

// Role queries over a page, a sheet and a confirmation are slow in jsdom.
jest.setTimeout(15_000);

const button = (name: string | RegExp) => screen.getByRole("button", { name });
/** Chooses a segment, as a press on it does. Read from the DOM, so it also reaches the page behind an open sheet. */
const show = (name: "Recipes" | "Meals" | "Foods") =>
  fireEvent.click([...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) => tab.textContent === name)!);
/** The segment's one action, in the same place in every segment. */
const action = () => document.querySelector<HTMLElement>("[data-recipes-action]")!;
const mealRow = (name: string) =>
  document.querySelector<HTMLElement>(`[data-list="recipes-meals"] [data-meal-row="${byName(name).id}"]`);
const archivedRow = (name: string) =>
  document.querySelector<HTMLElement>(`[data-list="archived"] [data-meal-row="${byName(name).id}"]`);
const foodRow = (name: string) =>
  document.querySelector<HTMLElement>(
    `[data-list="recipes-foods"] [data-food-row="${[...foodStore.values()].find((f) => f.name === name)!.id}"]`,
  );
const byName = (name: string): SavedMeal => [bowl, soup].find((m) => m.name === name)!;
const field = (label: string) => within(topSheet()).getByLabelText(label, { selector: "input" }) as HTMLInputElement;

/**
 * Every element focus is on from now until `stop()`, after each focus move,
 * the body included: a focusout records where focus is once it has settled.
 */
function recordFocus(): { focused: Element[]; stop: () => void } {
  const focused: Element[] = [];
  const record = () => focused.push(document.activeElement ?? document.body);
  const settled = () => queueMicrotask(record);
  document.addEventListener("focusin", record);
  document.addEventListener("focusout", settled);
  return {
    focused,
    stop: () => {
      document.removeEventListener("focusin", record);
      document.removeEventListener("focusout", settled);
    },
  };
}

async function openMeal(name: string): Promise<HTMLElement> {
  await waitFor(() => expect(mealRow(name) ?? archivedRow(name)).not.toBeNull());
  fireEvent.click((mealRow(name) ?? archivedRow(name))!);
  return screen.findByRole("dialog", { name: "Edit saved meal" });
}

describe("The Recipes tab's states", () => {
  it("shows a new user what goes in each segment, with its own action, and nothing else on the page", async () => {
    serveFoods([]);
    serveMeals([]);
    renderRecipes();
    const panel = () => screen.getByRole("tabpanel");
    expect(await screen.findByText("Recipes you save appear here.")).toBeInTheDocument();
    expect(action()).toHaveTextContent("New recipe");
    expect(screen.getByRole("tab", { name: "Recipes" })).toHaveAttribute("aria-selected", "true");
    show("Meals");
    expect(await screen.findByText("Meals you save appear here.")).toBeInTheDocument();
    expect(panel().textContent).toBe("New saved mealSearch mealsSaved mealsMeals you save appear here.Archived meals");
    show("Foods");
    expect(await screen.findByText("Foods you add appear here.")).toBeInTheDocument();
    expect(panel().textContent).toBe("Add a foodSearch your foodsYour foodsFoods you add appear here.");
  });

  it("opens on the segment the address names", async () => {
    mockSearch.params = new URLSearchParams("show=foods");
    renderRecipes();
    expect(screen.getByRole("tab", { name: "Foods" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Protein shake")).toBeInTheDocument();
    expect(action()).toHaveTextContent("Add a food");
  });

  it("says each list shows once the server can be reached, when it cannot be read", async () => {
    jest.mocked(getSavedMeals).mockRejectedValue(refusal(500, "internal"));
    jest.mocked(getOwnFoods).mockRejectedValue(refusal(500, "internal"));
    renderRecipes();
    show("Meals");
    expect(
      await screen.findByText("Your saved meals show here once Hovimestari can reach the server."),
    ).toBeInTheDocument();
    show("Foods");
    expect(await screen.findByText("Your foods show here once Hovimestari can reach the server.")).toBeInTheDocument();
  });

  it("lists the meals with source and figures, and the own foods by name with no Yours mark", async () => {
    serveFoods(["Rye bread", "Protein shake"], { isFavourite: true });
    renderRecipes();
    show("Meals");
    await waitFor(() => expect(rowNames("Saved meals", "recipes-meals")).toEqual(["Chicken bowl", "Salmon soup"]));
    expect(mealRow("Chicken bowl")).toHaveTextContent("Chicken bowlWolt640 kcal · 42.0 g protein per meal");
    expect(mealRow("Chicken bowl")).toHaveAttribute("aria-description", "Opens it to edit.");
    server.meals.set(soup.id, { ...soup, archived: true });
    fireEvent.click(button("Archived meals"));
    await waitFor(() => expect(archivedRow("Salmon soup")).not.toBeNull());
    expect(archivedRow("Salmon soup")).toHaveAttribute("aria-description", "Opens it to edit.");
    show("Foods");
    await waitFor(() => expect(rowNames("Your foods", "recipes-foods")).toEqual(["Protein shake", "Rye bread"]));
    expect(section("Your foods")).not.toHaveTextContent("Yours");
    expect(within(section("Your foods")).getAllByText("Favourite")).toHaveLength(2);
    expect(foodRow("Rye bread")).toHaveAttribute("aria-description", "Opens it to edit.");
  });

  it("keeps the segments, the action and the search field the same elements across segments and lists of any length", async () => {
    serveMeals([]);
    const { client } = renderRecipes();
    await screen.findByText("Recipes you save appear here.");
    const segments = document.querySelector("[data-recipes-segments]")!;
    const first = action();
    const page = segments.parentElement!;
    expect(page.firstElementChild).toBe(segments);
    show("Meals");
    await screen.findByText("Meals you save appear here.");
    expect(action()).toBe(first);
    server = serveMeals(Array.from({ length: 40 }, (_, i) => savedMeal(`Meal ${String(i).padStart(2, "0")}`, null)));
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(rowNames("Saved meals", "recipes-meals")).toHaveLength(40));
    fireEvent.click(button("Archived meals"));
    await screen.findByText("Meals you archive appear here.");
    show("Foods");
    expect(action()).toBe(first);
    expect(page.firstElementChild).toBe(segments);
    expect(document.querySelector("[data-recipes-segments]")).toBe(segments);
  });

  it("filters the meals and the foods by every word typed, and clears the search from a line that says none match", async () => {
    serveFoods(["Rye bread", "Protein shake", "Rye crisp"]);
    renderRecipes();
    show("Meals");
    await waitFor(() => expect(rowNames("Saved meals", "recipes-meals")).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Search meals"), { target: { value: "wolt chick" } });
    expect(rowNames("Saved meals", "recipes-meals")).toEqual(["Chicken bowl"]);
    fireEvent.change(screen.getByLabelText("Search meals"), { target: { value: "pizza" } });
    expect(screen.getByText("No meal matches.")).toBeInTheDocument();
    fireEvent.click(button("Clear search"));
    expect(rowNames("Saved meals", "recipes-meals")).toHaveLength(2);
    show("Foods");
    await waitFor(() => expect(rowNames("Your foods", "recipes-foods")).toHaveLength(3));
    // Each segment keeps its own search.
    expect((screen.getByLabelText("Search your foods") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Search your foods"), { target: { value: "rye" } });
    expect(rowNames("Your foods", "recipes-foods")).toEqual(["Rye bread", "Rye crisp"]);
  });
});

describe("Recipes on the Recipes tab", () => {
  const recipeNames = () =>
    [...document.querySelectorAll('[data-list="recipes"] [data-recipe-row]')].map(
      (row) => row.querySelector(".line-clamp-2")!.textContent,
    );

  function hold(): void {
    recipeServer.add(shakshuka({ tags: ["Brunch", "Weekend"], timeMinutes: 25, favourite: true }));
    recipeServer.add(recipeOf("Äitin lihapullat", 4, [{ name: "Jauheliha" }], { tags: ["Dinner"] }));
    recipeServer.add(recipeOf("Puuro", 1, [{ name: "Kaurahiutale" }], { tags: ["Breakfast"] }));
    recipeServer.add(recipeOf("Zucchini soup", 2, [{ name: "Water" }], { tags: ["dinner"] }));
    recipeServer.add(recipeOf("Kesäkeitto", 4, [{ name: "Water" }], { archived: true }));
  }

  it("lists the recipes by name in Finnish order, each a link to its page with its servings and figures per serving", async () => {
    hold();
    renderRecipes();
    await waitFor(() => expect(recipeNames()).toEqual(["Puuro", "Shakshuka", "Zucchini soup", "Äitin lihapullat"]));
    const row = document.querySelector<HTMLAnchorElement>(
      `[data-recipe-row="${[...recipeServer.recipes.values()].find((r) => r.name === "Shakshuka")!.id}"]`,
    )!;
    expect(row.getAttribute("href")).toMatch(/^\/recipes\/[0-9a-f-]+$/);
    // Read aloud once in full. On screen, "per serving" shows from md only, so a phone's row keeps one line of figures.
    expect(row.textContent!.replace(/[\u00a0\u2002]/g, " ")).toBe(
      "ShakshukaServes 2 · 25 min365 kcal · 21.8 g protein per serving365 kcal21.8 g protein per servingFavourite",
    );
    const figures = row.querySelector("[data-recipe-figures-line]")!;
    expect(figures.className.split(/\s+/)).toContain("whitespace-nowrap");
    expect(figures.className.split(/\s+/)).not.toContain("flex-wrap");
  });

  it("narrows the list by the words typed and by the chips, and clears both from the line that says none match", async () => {
    hold();
    renderRecipes();
    await waitFor(() => expect(recipeNames()).toHaveLength(4));
    const chips = screen.getByRole("group", { name: "Show only" });
    // Each tag once whatever its case, in the spelling of the first recipe by name that has it, in Finnish order.
    expect(
      within(chips)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Favourites", "Breakfast", "Brunch", "dinner", "Weekend"]);
    fireEvent.change(screen.getByLabelText("Search recipes"), { target: { value: "shak" } });
    expect(recipeNames()).toEqual(["Shakshuka"]);
    fireEvent.change(screen.getByLabelText("Search recipes"), { target: { value: "" } });
    fireEvent.click(within(chips).getByRole("button", { name: "dinner" }));
    expect(recipeNames()).toEqual(["Zucchini soup", "Äitin lihapullat"]);
    fireEvent.click(within(chips).getByRole("button", { name: "Favourites" }));
    expect(within(chips).getByRole("button", { name: "Favourites" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("No recipe matches.")).toBeInTheDocument();
    fireEvent.click(button("Clear search and filters"));
    expect(recipeNames()).toHaveLength(4);
    for (const chip of within(chips).getAllByRole("button")) expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("gives two tags that differ by an accent a chip each, as the server keeps both on a recipe", async () => {
    recipeServer.add(recipeOf("Kakku", 8, [{ name: "Water" }], { tags: ["Häät"] }));
    recipeServer.add(recipeOf("Keitto", 2, [{ name: "Water" }], { tags: ["Haat", "häät"] }));
    renderRecipes();
    await waitFor(() => expect(recipeNames()).toHaveLength(2));
    expect(
      within(screen.getByRole("group", { name: "Show only" }))
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Favourites", "Haat", "Häät"]);
  });

  it("keeps the chip row in place from the first frame, while the list loads", async () => {
    hold();
    jest.mocked(getRecipesApi).mockReturnValueOnce(new Promise(() => {}));
    renderRecipes();
    const chips = screen.getByRole("group", { name: "Show only" });
    expect(
      within(chips)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Favourites"]);
    expect(recipeNames()).toEqual([]);
  });

  it("says when there are none, and when they cannot be read", async () => {
    const { unmount } = renderRecipes();
    expect(await screen.findByText("Recipes you save appear here.")).toBeInTheDocument();
    unmount();
    jest.mocked(getRecipesApi).mockRejectedValue(refusal(500, "internal"));
    renderRecipes();
    expect(
      await screen.findByText("Your recipes show here once Hovimestari can reach the server."),
    ).toBeInTheDocument();
  });

  it("opens the archived recipes in place", async () => {
    hold();
    renderRecipes();
    fireEvent.click(await screen.findByRole("button", { name: "Archived recipes" }));
    const archived = await screen.findByRole("region", { name: "Archived recipes" });
    await waitFor(() =>
      expect(
        within(archived)
          .getAllByRole("link")
          .map((l) => l.textContent),
      ).toHaveLength(1),
    );
    expect(within(archived).getByRole("link")).toHaveTextContent(/^Kesäkeitto/);
  });

  it("puts focus in the search field after Clear search and filters, never on the page", async () => {
    hold();
    renderRecipes();
    await waitFor(() => expect(recipeNames()).toHaveLength(4));
    fireEvent.change(screen.getByLabelText("Search recipes"), { target: { value: "zzz" } });
    const clear = button("Clear search and filters");
    clear.focus();
    fireEvent.click(clear);
    expect(clear).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search recipes")).toHaveFocus();
    show("Meals");
    await waitFor(() => expect(mealRow("Chicken bowl")).not.toBeNull());
    fireEvent.change(screen.getByLabelText("Search meals"), { target: { value: "zzz" } });
    fireEvent.click(button("Clear search"));
    expect(screen.getByLabelText("Search meals")).toHaveFocus();
  });

  describe("back from a recipe's page", () => {
    const idOf = (name: string) => [...recipeServer.recipes.values()].find((r) => r.name === name)!.id;
    const rowOf = (name: string) => document.querySelector<HTMLElement>(`[data-recipe-row="${idOf(name)}"]`)!;
    const chip = (name: string) =>
      within(screen.getByRole("group", { name: "Show only" })).getByRole("button", { name });
    const search = () => screen.getByLabelText("Search recipes") as HTMLInputElement;
    const archivedToggle = () => screen.getByRole("button", { name: "Archived recipes" });
    const start = window.location.pathname + window.location.search;
    let main: HTMLElement;
    let scrolledTo: number[];
    beforeEach(() => {
      main = document.createElement("main");
      document.body.append(main);
      scrolledTo = [];
      main.scrollTo = ((options: ScrollToOptions) => scrolledTo.push(options.top ?? 0)) as typeof main.scrollTo;
      // The list's own history entry, with nothing on it.
      window.history.pushState(null, "", "/recipes");
    });
    afterEach(() => {
      main.remove();
      window.history.replaceState(null, "", start);
    });

    /** A plain press on a row. The row is a link: the press is kept, and the test does not follow it. */
    function press(row: HTMLElement): void {
      row.addEventListener("click", (e) => e.preventDefault(), { once: true });
      fireEvent.click(row);
    }
    /** The recipe's page, as the router opens it: a new history entry. */
    const openPage = (): void => window.history.pushState(null, "", "/recipes/one");
    /** Back through the history, by the page's Back or the browser's own: the entry before shows again. */
    async function goBack(): Promise<void> {
      const moved = new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
      window.history.back();
      await moved;
    }

    /** The list narrowed to one row by a chip and a search, the archived list open, scrolled, and that row pressed. */
    async function leaveNarrowed(): Promise<ReturnType<typeof renderRecipes>> {
      hold();
      const first = renderRecipes();
      await waitFor(() => expect(recipeNames()).toHaveLength(4));
      fireEvent.click(chip("dinner"));
      fireEvent.change(search(), { target: { value: "zu" } });
      fireEvent.click(archivedToggle());
      expect(recipeNames()).toEqual(["Zucchini soup"]);
      main.scrollTop = 420;
      press(rowOf("Zucchini soup"));
      first.unmount();
      openPage();
      // What the first showing scrolled is not what is checked.
      scrolledTo = [];
      return first;
    }

    it("shows the list as the row left it: the search, the chips, the archived list and the scroll, with focus on that row", async () => {
      const first = await leaveNarrowed();
      await goBack();
      renderRecipes(first.client);
      // From the first frame the list is the one that was left, not the whole list narrowed after.
      expect(search().value).toBe("zu");
      expect(chip("dinner")).toHaveAttribute("aria-pressed", "true");
      expect(chip("Favourites")).toHaveAttribute("aria-pressed", "false");
      expect(archivedToggle()).toHaveAttribute("aria-expanded", "true");
      expect(recipeNames()).toEqual(["Zucchini soup"]);
      expect(scrolledTo).toEqual([420]);
      expect(rowOf("Zucchini soup")).toHaveFocus();
    });

    it("comes back to a row of the archived list with that list open and focus on the row", async () => {
      hold();
      const first = renderRecipes();
      fireEvent.click(await screen.findByRole("button", { name: "Archived recipes" }));
      await waitFor(() => expect(document.querySelector('[data-list="archived-recipes"] a')).not.toBeNull());
      main.scrollTop = 900;
      press(rowOf("Kesäkeitto"));
      first.unmount();
      openPage();
      scrolledTo = [];
      await goBack();
      renderRecipes(first.client);
      expect(archivedToggle()).toHaveAttribute("aria-expanded", "true");
      expect(scrolledTo).toEqual([900]);
      expect(rowOf("Kesäkeitto")).toHaveFocus();
    });

    it("opens the list fresh, at its top with no row focused, when it is reached by the tab bar after a recipe", async () => {
      const first = await leaveNarrowed();
      // The tab bar's Recipes: a new history entry.
      window.history.pushState(null, "", "/recipes");
      renderRecipes(first.client);
      await waitFor(() => expect(recipeNames()).toHaveLength(4));
      expect(search().value).toBe("");
      expect(chip("dinner")).toHaveAttribute("aria-pressed", "false");
      expect(archivedToggle()).toHaveAttribute("aria-expanded", "false");
      // <main> keeps the scroll of the page before, so the list puts itself at its top.
      expect(scrolledTo).toEqual([0]);
      expect(rowOf("Zucchini soup")).not.toHaveFocus();
    });

    it("restores nothing after the recipe was left by the tab bar and the history moved since", async () => {
      const first = await leaveNarrowed();
      // The tab bar to Day, a way back through the history to the recipe, then the tab bar to Recipes.
      window.history.pushState(null, "", "/");
      await goBack();
      window.history.pushState(null, "", "/recipes");
      renderRecipes(first.client);
      await waitFor(() => expect(recipeNames()).toHaveLength(4));
      expect(search().value).toBe("");
      expect(scrolledTo).toEqual([0]);
      expect(document.activeElement).toBe(document.body);
    });

    it("serves one way back, and leaves the list alone while it is used after", async () => {
      const first = await leaveNarrowed();
      await goBack();
      const back = renderRecipes(first.client);
      expect(rowOf("Zucchini soup")).toHaveFocus();
      // Another segment and back: the recipes' search is kept as on any visit, the chips start over, nothing scrolls.
      show("Meals");
      show("Recipes");
      expect(search().value).toBe("zu");
      expect(chip("dinner")).toHaveAttribute("aria-pressed", "false");
      expect(scrolledTo).toEqual([420]);
      // The same history entry shown again, as by a way forward and back, holds no place any more: the list is fresh.
      back.unmount();
      renderRecipes(first.client);
      await waitFor(() => expect(recipeNames()).toHaveLength(4));
      expect(search().value).toBe("");
      expect(scrolledTo).toEqual([420, 0]);
    });

    it("keeps nothing for a press that opens the recipe in a new tab", async () => {
      hold();
      renderRecipes();
      await waitFor(() => expect(recipeNames()).toHaveLength(4));
      rowOf("Shakshuka").addEventListener("click", (e) => e.preventDefault());
      fireEvent.click(rowOf("Shakshuka"), { ctrlKey: true });
      expect(takeOpenedInApp()).toBe(false);
      expect(readListPlace()).toBeNull();
      fireEvent.click(rowOf("Shakshuka"));
      expect(takeOpenedInApp()).toBe(true);
      expect(readListPlace()).toMatchObject({ rowId: idOf("Shakshuka") });
    });
  });

  describe("after a recipe is deleted on its page", () => {
    const idOf = (name: string) => [...recipeServer.recipes.values()].find((r) => r.name === name)!.id;
    const rowOf = (name: string) => document.querySelector<HTMLElement>(`[data-recipe-row="${idOf(name)}"]`);

    it("puts focus on the row the delete named, once the list is on screen, and brings it into view", async () => {
      hold();
      // jsdom lays nothing out: what can be checked is that the list asks for the row in the middle of the page.
      const main = document.body.appendChild(document.createElement("main"));
      const toTop = jest.fn();
      main.scrollTo = toTop;
      const shown: { el: Element; block: unknown }[] = [];
      const into = jest.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (
        this: Element,
        options,
      ) {
        shown.push({ el: this, block: typeof options === "object" ? options.block : options });
      });
      try {
        setFocusAfterDelete(idOf("Shakshuka"));
        renderRecipes();
        await waitFor(() => expect(recipeNames()).toHaveLength(4));
        expect(document.activeElement).toBe(rowOf("Shakshuka"));
        expect(shown).toEqual([{ el: rowOf("Shakshuka"), block: "center" }]);
        // The row is where the page goes, not its top.
        expect(toTop).not.toHaveBeenCalled();
      } finally {
        into.mockRestore();
        main.remove();
      }
    });

    it("puts focus on the row when the list was not in the cache and is read after the page shows", async () => {
      hold();
      const read = deferred<{ recipes: [] }>();
      jest.mocked(getRecipesApi).mockImplementationOnce(() => read.promise);
      setFocusAfterDelete(idOf("Puuro"));
      renderRecipes();
      expect(recipeNames()).toEqual([]);
      await act(async () => read.resolve(recipeServer.list(false) as never));
      await waitFor(() => expect(recipeNames()).toHaveLength(4));
      expect(document.activeElement).toBe(rowOf("Puuro"));
    });

    it("puts focus on New recipe after the last recipe is deleted", async () => {
      setFocusAfterDelete("new");
      renderRecipes();
      expect(await screen.findByText("Recipes you save appear here.")).toBeInTheDocument();
      expect(document.activeElement).toBe(action());
      expect(action()).toHaveTextContent("New recipe");
    });

    it("puts focus on New recipe after an archived recipe is deleted, whose next row is in the closed archived list", async () => {
      hold();
      recipeServer.add(recipeOf("Talvikeitto", 4, [{ name: "Water" }], { archived: true }));
      // The page named the next archived row, which is not on screen: the archived list is closed.
      setFocusAfterDelete(idOf("Talvikeitto"));
      renderRecipes();
      await waitFor(() => expect(recipeNames()).toHaveLength(4));
      expect(document.activeElement).toBe(action());
    });
  });

  it("opens the editor from New recipe, and a saved recipe opens its page", async () => {
    renderRecipes();
    fireEvent.click(await screen.findByRole("button", { name: "New recipe" }));
    const editor = await screen.findByRole("dialog", { name: "New recipe" });
    fireEvent.change(within(editor).getByLabelText("Name", { selector: "input" }), { target: { value: "Water soup" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Add a line not counted" }));
    const plain = await screen.findByRole("dialog", { name: "Line not counted" });
    fireEvent.change(within(plain).getByLabelText("Name", { selector: "input" }), { target: { value: "Water" } });
    fireEvent.click(within(plain).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(openSheet("Line not counted")).toBeNull());
    fireEvent.click(within(editor).getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
    const [created] = recipeServer.created;
    expect(mockRouter.push).toHaveBeenCalledWith(`/recipes/${created.id}`);
    expect(created.lines).toEqual([
      { counted: false, id: expect.any(String), name: "Water", written: null, note: null },
    ]);
  });
});

describe("Saved meals on the Recipes tab", () => {
  beforeEach(() => {
    mockSearch.params = new URLSearchParams("show=meals");
  });

  it("saves a new meal without logging it: no Eaten or planned, Save meal sends POST /saved-meals only", async () => {
    renderRecipes();
    await waitFor(() => expect(rowNames("Saved meals", "recipes-meals")).toHaveLength(2));
    fireEvent.click(button("New saved meal"));
    const sheet = await screen.findByRole("dialog", { name: "New saved meal" });
    expect(within(sheet).queryByRole("radiogroup", { name: "Eaten or planned" })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: /Save and/ })).toBeNull();
    fireEvent.change(field("Name"), { target: { value: "Bean stew" } });
    fireEvent.change(field("Calories"), { target: { value: "500" } });
    fireEvent.change(field("Protein"), { target: { value: "30" } });
    fireEvent.change(field("Carbohydrates"), { target: { value: "50" } });
    fireEvent.change(field("Fat"), { target: { value: "10" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(openSheet("New saved meal")).toBeNull());
    expect(createSavedMeal).toHaveBeenCalledTimes(1);
    expect(saveAndLog).not.toHaveBeenCalled();
    expect(addEntry).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(rowNames("Saved meals", "recipes-meals")).toEqual(["Bean stew", "Chicken bowl", "Salmon soup"]),
    );
  });

  it("archives from the edit sheet in place: one button turns into Restore meal with focus kept, and no toast", async () => {
    renderRecipes();
    await waitFor(() => expect(rowNames("Saved meals", "recipes-meals")).toHaveLength(2));
    fireEvent.click(button("Archived meals"));
    await screen.findByText("Meals you archive appear here.");
    const sheet = await openMeal("Chicken bowl");
    const archive = within(sheet).getByRole("button", { name: "Archive meal" });
    archive.focus();
    fireEvent.click(archive);
    await waitFor(() => expect(archive).toHaveTextContent("Restore meal"));
    expect(archive).toHaveFocus();
    expect(archive.isConnected).toBe(true);
    expect(setSavedMealArchived).toHaveBeenCalledWith(bowl.id, true);
    // The row moved under the sheet, which stays open.
    await waitFor(() => expect(archivedRow("Chicken bowl")).not.toBeNull());
    expect(mealRow("Chicken bowl")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Edit saved meal" })).toBe(sheet);
    fireEvent.click(archive);
    await waitFor(() => expect(archive).toHaveTextContent("Archive meal"));
    expect(archive).toHaveFocus();
    expect(setSavedMealArchived).toHaveBeenLastCalledWith(bowl.id, false);
    await waitFor(() => expect(mealRow("Chicken bowl")).not.toBeNull());
    expect(archivedRow("Chicken bowl")).toBeNull();
    expect(toasts()).toHaveLength(0);
  });

  it("keeps the sheet's source chips through an archive, so the form does not move under the finger", async () => {
    renderRecipes();
    const sheet = await openMeal("Chicken bowl");
    const chips = () =>
      [...sheet.querySelectorAll<HTMLElement>("[data-meal-sources] button")].map((chip) => chip.textContent);
    await waitFor(() => expect(chips()).toEqual(["Foodora", "Wolt"]));
    const row = sheet.querySelector("[data-meal-sources]");
    // Chicken bowl is the only meal from Wolt: archived, Wolt leaves the active meals' sources.
    fireEvent.click(within(sheet).getByRole("button", { name: "Archive meal" }));
    await within(sheet).findByRole("button", { name: "Restore meal" });
    await waitFor(() => expect(mealRow("Chicken bowl")).toBeNull());
    expect(sheet.querySelector("[data-meal-sources]")).toBe(row);
    expect(chips()).toEqual(["Foodora", "Wolt"]);
  });

  it("shows a failed archive on the sheet's own error line, not in a toast", async () => {
    renderRecipes();
    const sheet = await openMeal("Chicken bowl");
    jest.mocked(setSavedMealArchived).mockRejectedValueOnce(timeout());
    fireEvent.click(within(sheet).getByRole("button", { name: "Archive meal" }));
    await waitFor(() => expect(within(sheet).getByRole("alert")).toHaveTextContent("Could not confirm. Try again."));
    expect(within(sheet).getByRole("button", { name: "Archive meal" })).toBeInTheDocument();
    expect(toasts()).toHaveLength(0);
  });

  /** Holds the next archive or restore until `release()`, then answers it as the server does. */
  function holdArchive(): { release: () => void } {
    const answer = jest.mocked(setSavedMealArchived).getMockImplementation()!;
    const gate = deferred<void>();
    jest.mocked(setSavedMealArchived).mockImplementationOnce(async (id, archived) => {
      await gate.promise;
      return answer(id, archived);
    });
    return { release: () => gate.resolve() };
  }

  it("holds Delete while an archive from the sheet runs: no confirmation, no request, and no gone notice", async () => {
    renderRecipes();
    const sheet = await openMeal("Chicken bowl");
    const held = holdArchive();
    fireEvent.click(within(sheet).getByRole("button", { name: "Archive meal" }));
    await waitFor(() => expect(setSavedMealArchived).toHaveBeenCalledTimes(1));
    fireEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
    await act(async () => {});
    expect(openSheet("Delete Chicken bowl?")).toBeNull();
    expect(deleteSavedMeal).not.toHaveBeenCalled();
    await act(async () => held.release());
    await within(sheet).findByRole("button", { name: "Restore meal" });
    expect(openSheet("Edit saved meal")).toBe(sheet);
    expect(toasts()).toHaveLength(0);
  });

  it("holds Save while an archive from the sheet runs, and saves once it has answered", async () => {
    renderRecipes();
    const sheet = await openMeal("Chicken bowl");
    fireEvent.change(field("Name"), { target: { value: "Chicken rice bowl" } });
    const held = holdArchive();
    fireEvent.click(within(sheet).getByRole("button", { name: "Archive meal" }));
    await waitFor(() => expect(setSavedMealArchived).toHaveBeenCalledTimes(1));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save meal" }));
    await act(async () => {});
    expect(updateSavedMeal).not.toHaveBeenCalled();
    expect(openSheet("Edit saved meal")).toBe(sheet);
    await act(async () => held.release());
    await within(sheet).findByRole("button", { name: "Restore meal" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(openSheet("Edit saved meal")).toBeNull());
    expect(updateSavedMeal).toHaveBeenCalledTimes(1);
  });

  it("sends no archive while the app asks the server for today", async () => {
    const client = seededClient();
    render(
      <TodayContext.Provider
        value={{ today: TODAY, holding: true, confirm: "checking", unconfirmed: false, retry: () => {} }}
      >
        <ToastProvider>
          <RecipesTab />
          <ToastRegion />
        </ToastProvider>
      </TodayContext.Provider>,
      { wrapper: queryWrapper(client) },
    );
    const sheet = await openMeal("Chicken bowl");
    const archive = within(sheet).getByRole("button", { name: "Archive meal" });
    expect(archive).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(archive);
    await act(async () => {});
    expect(setSavedMealArchived).not.toHaveBeenCalled();
  });

  it("deletes from the edit sheet: the confirmation is stacked on the sheet, both close, and focus goes to the next row", async () => {
    renderRecipes();
    const sheet = await openMeal("Chicken bowl");
    const focus = recordFocus();
    try {
      await deleteBowl(sheet, focus);
    } finally {
      focus.stop();
    }
  });

  async function deleteBowl(sheet: HTMLElement, focus: ReturnType<typeof recordFocus>): Promise<void> {
    fireEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Chicken bowl?" });
    expect(confirm).toHaveTextContent("Days it was logged on keep their figures.");
    // Nested in the meal sheet: a stacked sheet's backdrop is marked, and its popup is the raised surface.
    expect(document.querySelector("[data-sheet-backdrop][data-sheet-stacked]")).not.toBeNull();
    expect(confirm.className.split(" ")).toContain("bg-surface-raised");
    await confirmArmed();
    const next = mealRow("Salmon soup")!;
    expect(openSheet("Edit saved meal")).not.toBeNull();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(openSheet("Edit saved meal")).toBeNull());
    await waitFor(() => expect(mealRow("Chicken bowl")).toBeNull());
    expect(deleteSavedMeal).toHaveBeenCalledTimes(1);
    expect(deleteSavedMeal).toHaveBeenCalledWith(bowl.id);
    await waitFor(() => expect(next).toHaveFocus());
    await act(async () => {});
    expect(focus.focused.filter((el) => el === document.body)).toEqual([]);
  }

  it("puts focus on New saved meal after deleting the last meal, and takes a meal already gone as deleted", async () => {
    const alone = serveMeals([bowl]);
    renderRecipes();
    const sheet = await openMeal("Chicken bowl");
    fireEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Chicken bowl?" });
    await confirmArmed();
    // Deleted on another device meanwhile: the server answers 404 saved_meal_not_found.
    alone.meals.delete(bowl.id);
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(openSheet("Edit saved meal")).toBeNull());
    await waitFor(() => expect(button("New saved meal")).toHaveFocus());
    await screen.findByText("Meals you save appear here.");
  });

  it("restores from the archived list in place, and says so in a toast when it fails", async () => {
    const old = savedMeal("Old curry", null, { archived: true });
    const older = savedMeal("Older pasta", null, { archived: true });
    for (const meal of [old, older]) server.meals.set(meal.id, meal);
    renderRecipes();
    fireEvent.click(button("Archived meals"));
    await waitFor(() => expect(within(section("Saved meals")).getByRole("button", { name: "Restore Old curry" })));
    fireEvent.click(within(section("Saved meals")).getByRole("button", { name: "Restore Old curry" }));
    await waitFor(() => expect(rowNames("Saved meals", "recipes-meals")).toContain("Old curry"));
    expect(rowNames("Saved meals", "archived")).toEqual(["Older pasta"]);
    jest.mocked(setSavedMealArchived).mockRejectedValueOnce(timeout());
    fireEvent.click(within(section("Saved meals")).getByRole("button", { name: "Restore Older pasta" }));
    await waitFor(() => expect(toasts().map((t) => t.textContent)).toContain("Could not confirm. Try again."));
    expect(rowNames("Saved meals", "archived")).toEqual(["Older pasta"]);
  });
});

describe("Own foods on the Recipes tab", () => {
  beforeEach(() => {
    mockSearch.params = new URLSearchParams("show=foods");
  });

  it("opens a food's edit sheet from its row, saves a rename that moves the row, and returns focus to it", async () => {
    renderRecipes();
    await waitFor(() => expect(foodRow("Rye bread")).not.toBeNull());
    fireEvent.click(foodRow("Rye bread")!);
    const sheet = await screen.findByRole("dialog", { name: "Edit food" });
    expect(field("Name").value).toBe("Rye bread");
    fireEvent.change(field("Name"), { target: { value: "Barley bread" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
    await waitFor(() => expect(openSheet("Edit food")).toBeNull());
    await waitFor(() => expect(rowNames("Your foods", "recipes-foods")).toEqual(["Barley bread", "Protein shake"]));
    await waitFor(() => expect(foodRow("Barley bread")).toHaveFocus());
  });

  it("deletes from the edit sheet and puts focus on the next row, then on Add a food when none is left, never on the page", async () => {
    renderRecipes();
    await waitFor(() => expect(foodRow("Protein shake")).not.toBeNull());
    const focus = recordFocus();
    try {
      for (const [name, then] of [
        ["Protein shake", () => foodRow("Rye bread")],
        ["Rye bread", () => action()],
      ] as const) {
        fireEvent.click(foodRow(name)!);
        const sheet = await screen.findByRole("dialog", { name: "Edit food" });
        const target = then();
        fireEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
        const confirm = await screen.findByRole("dialog", { name: `Delete ${name}?` });
        await confirmArmed();
        fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(openSheet("Edit food")).toBeNull());
        await waitFor(() => expect(target).toHaveFocus());
        await act(async () => {});
      }
      expect(focus.focused.length).toBeGreaterThan(0);
      expect(focus.focused.filter((el) => el === document.body)).toEqual([]);
    } finally {
      focus.stop();
    }
    expect(deleteFood).toHaveBeenCalledTimes(2);
    await screen.findByText("Foods you add appear here.");
  });

  /** Holds the next food detail read until `release()`, then answers it from the store. */
  function holdFoodRead(): { release: () => void } {
    const answer = jest.mocked(getFood).getMockImplementation()!;
    const gate = deferred<void>();
    jest.mocked(getFood).mockImplementationOnce(async (id, options) => {
      await gate.promise;
      return answer(id, options);
    });
    return { release: () => gate.resolve() };
  }

  const openSheetTitles = () =>
    [...document.querySelectorAll('[role="dialog"][data-open]')].map((d) => d.querySelector("h2")?.textContent);

  it.each([
    ["a meal's row", "Edit saved meal", () => mealRow("Chicken bowl")!],
    ["New saved meal", "New saved meal", () => button("New saved meal")],
  ])(
    "opens one sheet, the last one asked for, when %s is pressed while a food's detail is read",
    async (_name, title, other) => {
      renderRecipes();
      await waitFor(() => expect(foodRow("Rye bread")).not.toBeNull());
      const read = holdFoodRead();
      fireEvent.click(foodRow("Rye bread")!);
      // The row shows the read on screen: pressed, with the busy ring in the star's place.
      expect(foodRow("Rye bread")).toHaveAttribute("aria-busy", "true");
      expect(foodRow("Rye bread")!.querySelector("[data-row-busy]")).not.toBeNull();
      expect(openSheetTitles()).toEqual([]);
      show("Meals");
      await waitFor(() => expect(mealRow("Chicken bowl")).not.toBeNull());
      fireEvent.click(other());
      await waitFor(() => expect(openSheetTitles()).toEqual([title]));
      show("Foods");
      expect(foodRow("Rye bread")).not.toHaveAttribute("aria-busy");
      await act(async () => read.release());
      await act(async () => {});
      expect(getFood).toHaveBeenCalledTimes(1);
      expect(openSheetTitles()).toEqual([title]);
    },
  );

  it("opens a food read before at once, from the cached detail, with no read", async () => {
    renderRecipes();
    await waitFor(() => expect(foodRow("Rye bread")).not.toBeNull());
    fireEvent.click(foodRow("Rye bread")!);
    const sheet = await screen.findByRole("dialog", { name: "Edit food" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(openSheet("Edit food")).toBeNull());
    expect(getFood).toHaveBeenCalledTimes(1);
    fireEvent.click(foodRow("Rye bread")!);
    // In the same update as the press: no read and no wait.
    expect(openSheet("Edit food")).not.toBeNull();
    expect(foodRow("Rye bread")).not.toHaveAttribute("aria-busy");
    expect(getFood).toHaveBeenCalledTimes(1);
  });

  /** Opens `name`'s edit sheet once, so its detail is cached, and closes it again. */
  async function readOnce(name: string): Promise<void> {
    await waitFor(() => expect(foodRow(name)).not.toBeNull());
    fireEvent.click(foodRow(name)!);
    const sheet = await screen.findByRole("dialog", { name: "Edit food" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(openSheet("Edit food")).toBeNull());
  }

  /** Renames `name` on the fake server only, as another device or an assistant would. */
  function renameOnServer(name: string, to: string): string {
    const food = [...foodStore.values()].find((f) => f.name === name)!;
    foodStore.set(food.id, { ...food, name: to });
    return food.id;
  }

  it("reads a food again before its sheet opens once the cached detail is older than the stale time", async () => {
    renderRecipes();
    await readOnce("Rye bread");
    const row = foodRow("Rye bread")!;
    renameOnServer("Rye bread", "Rye loaf");
    clock.mockReturnValue(Date.parse(`${TODAY}T10:00:00Z`) + STALE.live + 1);
    const read = holdFoodRead();
    fireEvent.click(row);
    expect(openSheet("Edit food")).toBeNull();
    expect(row).toHaveAttribute("aria-busy", "true");
    await act(async () => read.release());
    await screen.findByRole("dialog", { name: "Edit food" });
    expect(field("Name").value).toBe("Rye loaf");
    expect(getFood).toHaveBeenCalledTimes(2);
  });

  it("reads a food again before its sheet opens when a write has invalidated its cached detail", async () => {
    const { client } = renderRecipes();
    await readOnce("Rye bread");
    const row = foodRow("Rye bread")!;
    const id = renameOnServer("Rye bread", "Rye loaf");
    await act(() => client.invalidateQueries({ queryKey: queryKeys.foodDetail(id) }));
    fireEvent.click(row);
    expect(openSheet("Edit food")).toBeNull();
    await screen.findByRole("dialog", { name: "Edit food" });
    expect(field("Name").value).toBe("Rye loaf");
    expect(getFood).toHaveBeenCalledTimes(2);
  });

  it("opens a food's stale cached detail at once while offline, with no read", async () => {
    renderRecipes();
    await readOnce("Rye bread");
    clock.mockReturnValue(Date.parse(`${TODAY}T10:00:00Z`) + STALE.live + 1);
    const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    try {
      fireEvent.click(foodRow("Rye bread")!);
      expect(openSheet("Edit food")).not.toBeNull();
      expect(getFood).toHaveBeenCalledTimes(1);
    } finally {
      onLine.mockRestore();
      act(() => void window.dispatchEvent(new Event("online")));
    }
  });

  it("drops a food found gone from the list even when its read answers after another open, without a toast", async () => {
    renderRecipes();
    await waitFor(() => expect(foodRow("Rye bread")).not.toBeNull());
    const row = foodRow("Rye bread")!;
    foodStore.delete(row.getAttribute("data-food-row")!);
    const read = holdFoodRead();
    fireEvent.click(row);
    show("Meals");
    await waitFor(() => expect(mealRow("Chicken bowl")).not.toBeNull());
    fireEvent.click(mealRow("Chicken bowl")!);
    await waitFor(() => expect(openSheet("Edit saved meal")).not.toBeNull());
    await act(async () => read.release());
    show("Foods");
    await waitFor(() => expect(rowNames("Your foods", "recipes-foods")).toEqual(["Protein shake"]));
    expect(openSheet("Edit saved meal")).not.toBeNull();
    expect(toasts().map((t) => t.textContent)).not.toContain("This food is no longer available.");
  });

  it("takes a row whose food is gone off the list with a toast, and shows a failed read as a toast", async () => {
    const shown = recordToasts();
    renderRecipes();
    await waitFor(() => expect(foodRow("Rye bread")).not.toBeNull());
    const id = foodRow("Rye bread")!.getAttribute("data-food-row")!;
    foodStore.delete(id);
    fireEvent.click(document.querySelector(`[data-food-row="${id}"]`)!);
    await waitFor(() => expect(toasts().map((t) => t.textContent)).toContain("This food is no longer available."));
    await waitFor(() => expect(rowNames("Your foods", "recipes-foods")).toEqual(["Protein shake"]));
    jest.mocked(getFood).mockRejectedValueOnce(refusal(500, "internal"));
    fireEvent.click(foodRow("Protein shake")!);
    await waitFor(() => expect(shown.shown).toHaveLength(2));
    shown.stop();
    // "internal" is no code the app knows, so the toast says the catalog's general line.
    expect(shown.shown[1]).toBe(messages.errors.fallback);
    expect(openSheet("Edit food")).toBeNull();
  });
});
