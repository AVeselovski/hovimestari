import { fakeAuth } from "@/__tests__/helpers/auth";
import { queryWrapper } from "@/__tests__/helpers/queryClient";
import { confirmArmed } from "@/__tests__/sheet";
import { FakeDays, seededClient, serve } from "@/components/day/__tests__/harness";
import { detailOf, fineliFood } from "@/components/foods/__tests__/support";
import { TodayProvider } from "@/components/targets/TodayProvider";
import { ToastProvider, ToastRegion } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { deleteRecipe, getRecipe } from "@/lib/api/recipes";
import { queryKeys } from "@/lib/queryKeys";
import { recipeSummaryOf } from "@/lib/recipeCache";
import type { Recipe, RecipeList } from "@hovimestari/types";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RecipePage } from "../RecipePage";
import { recipeOf, shakshuka } from "./recipeFixtures";
import { FakeRecipes, serveRecipes } from "./recipeServer";
import { pinClock } from "./recipesHarness";

// The recipe page against the fake recipe server: its figures and lines,
// the servings stepper, every state of the page, and deleting.

const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/recipes/x",
}));
jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/entries", () => ({
  addEntry: jest.fn(),
  setEntriesStatus: jest.fn(),
  patchEntry: jest.fn(),
  removeEntry: jest.fn(),
  restoreEntry: jest.fn(),
}));
jest.mock("@/lib/api/foods", () => ({
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn().mockResolvedValue({ foods: [] }),
  getOwnFoods: jest.fn().mockResolvedValue({ foods: [] }),
  getFood: jest.fn(),
  createFood: jest.fn(),
  updateFood: jest.fn(),
  deleteFood: jest.fn(),
  setFavourite: jest.fn(),
  lookupBarcode: jest.fn(),
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
let recipes: FakeRecipes;
let shak: Recipe;

beforeEach(() => {
  clock = pinClock();
  for (const fn of Object.values(router)) fn.mockReset();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  serve(new FakeDays([]));
  shak = shakshuka({ steps: ["Soften the onion.", "Crack in the eggs."], notes: "Good with rye bread.\nServe hot." });
  recipes = serveRecipes(new FakeRecipes([shak]));
});

afterEach(() => {
  clock.mockRestore();
  onlineManager.setOnline(true);
});

function renderPage(id = shak.id, client: QueryClient = seededClient()): QueryClient {
  render(
    <TodayProvider>
      <ToastProvider>
        <RecipePage id={id} />
        <ToastRegion />
      </ToastProvider>
    </TodayProvider>,
    { wrapper: queryWrapper(client) },
  );
  return client;
}

/** The figures card's cells, row by row: label, one serving, the second column. */
function figureRows(): string[][] {
  const card = document.querySelector("[data-recipe-figures]")!;
  return [...card.querySelectorAll("tbody tr")].map((tr) =>
    [...tr.children].map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
}
const heading = () => document.querySelector("[data-whole-heading]")!.textContent;
const lineAmounts = () =>
  [...document.querySelectorAll("[data-ingredient-rows] li")].map((li) => li.textContent?.replace(/\s+/g, " ").trim());

describe("The recipe page", () => {
  it("shows the server's figures per serving and for the whole recipe, the lines, the method and the notes", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Shakshuka" })).toBeInTheDocument();
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    // The worked example: 365 kcal and 21.8 g per serving, 730 kcal and 43.6 g whole, never 43.5.
    expect(figureRows()).toEqual([
      ["Calories", "365 kcal", "730 kcal"],
      ["Protein", "21.8 g", "43.6 g"],
      ["CarbsCarbohydrates", "9.9 g", "19.7 g"],
      ["Fat", "25.7 g", "51.4 g"],
    ]);
    expect(heading()).toBe("Whole recipe");
    expect(screen.getByText("Serves 2")).toBeInTheDocument();
    expect(lineAmounts()).toEqual([
      "Kananmuna240 g",
      "Tomaattimurska400 g",
      "Feta60 g",
      "Oliiviöljy15 g",
      "SaltNot counted",
    ]);
    const method = screen.getByRole("region", { name: "Method" });
    expect(
      within(method)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Soften the onion.", "Crack in the eggs."]);
    expect(screen.getByRole("region", { name: "Notes" }).querySelector("p")!.textContent).toBe(
      "Good with rye bread.\nServe hot.",
    );
  });

  it("scales the lines and the figures with the stepper, from the basis, and goes back to the recipe's servings", async () => {
    renderPage();
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    fireEvent.click(screen.getByRole("button", { name: "More servings" }));
    expect(heading()).toBe("For 3 servings");
    // Three servings from the basis: 1095 kcal and 65.3 g, never 65.4, three times the rounded serving.
    expect(figureRows().map((r) => r[2])).toEqual(["1095 kcal", "65.3 g", "29.6 g", "77.1 g"]);
    expect(figureRows().map((r) => r[1])).toEqual(["365 kcal", "21.8 g", "9.9 g", "25.7 g"]);
    expect(lineAmounts().slice(0, 4)).toEqual([
      "Kananmuna360 g",
      "Tomaattimurska600 g",
      "Feta90 g",
      "Oliiviöljy22.5 g",
    ]);
    const back = screen.getByRole("button", { name: "Back to 2" });
    fireEvent.click(back);
    expect(heading()).toBe("Whole recipe");
    expect(figureRows().map((r) => r[2])).toEqual(["730 kcal", "43.6 g", "19.7 g", "51.4 g"]);
    expect(lineAmounts()[0]).toBe("Kananmuna240 g");
  });

  it("takes a typed number of servings, and keeps the last whole number while the field holds anything else", async () => {
    renderPage();
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    const field = screen.getByLabelText("Servings") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "4" } });
    expect(heading()).toBe("For 4 servings");
    fireEvent.change(field, { target: { value: "" } });
    expect(heading()).toBe("Whole recipe");
    fireEvent.change(field, { target: { value: "101" } });
    expect(heading()).toBe("Whole recipe");
    fireEvent.blur(field);
    expect(field.value).toBe("2");
  });

  it("shows a row's name, servings and figures from the list while the recipe is read", async () => {
    const client = seededClient();
    client.setQueryData<RecipeList>(queryKeys.recipeList(false), { recipes: [recipeSummaryOf(shak)] });
    jest.mocked(getRecipe).mockReturnValue(new Promise(() => {}));
    renderPage(shak.id, client);
    expect(screen.getByRole("heading", { level: 1, name: "Shakshuka" })).toBeInTheDocument();
    expect(screen.getByText("Serves 2")).toBeInTheDocument();
    expect(figureRows()[0]).toEqual(["Calories", "365 kcal", "730 kcal"]);
    expect(document.querySelector("[data-ingredient-rows]")).toBeNull();
  });

  it("says a recipe that is not there is no longer available, with a way back", async () => {
    renderPage("00000000-0000-4000-8000-00000000dead");
    expect(await screen.findByText("This recipe is no longer available.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to recipes" }));
    expect(router.push).toHaveBeenCalledWith("/recipes");
  });

  it("says it needs a connection when it was never read and the device is offline", async () => {
    onlineManager.setOnline(false);
    renderPage();
    expect(await screen.findByText("This recipe needs a connection.")).toBeInTheDocument();
    expect(getRecipe).not.toHaveBeenCalled();
  });

  it("says an archived recipe can still be logged, and offers Log and Restore", async () => {
    recipes.recipes.set(shak.id, { ...shak, archived: true });
    renderPage();
    expect(await screen.findByText("Archived. It can still be logged.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Restore recipe" })).toBeInTheDocument();
  });

  it("shows a deleted recipe, opened from a day, with nothing to change", async () => {
    recipes.recipes.set(shak.id, { ...shak, deleted: true });
    renderPage();
    expect(await screen.findByText("This recipe was deleted. Days it was on keep their figures.")).toBeInTheDocument();
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    for (const name of ["Edit", "Log", "Duplicate", "Archive recipe", "Delete recipe", "Favourite"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("asks before a delete, then leaves for the Recipes tab", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete recipe" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Shakshuka?" });
    expect(confirm).toHaveTextContent("Days it was planned or eaten on keep their figures.");
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/recipes"));
    expect(deleteRecipe).toHaveBeenCalledWith(shak.id);
    expect(recipes.recipes.has(shak.id)).toBe(false);
  });

  it("marks a favourite at once, and archives with a toast that says so", async () => {
    renderPage();
    const star = await screen.findByRole("button", { name: "Favourite" });
    // A press waits while the app asks the server for today, which it does as the page opens.
    await waitFor(() => {
      if (star.getAttribute("aria-pressed") !== "true") fireEvent.click(star);
      expect(star).toHaveAttribute("aria-pressed", "true");
    });
    await waitFor(() => expect(recipes.recipes.get(shak.id)!.favourite).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Archive recipe" }));
    expect(await screen.findByText("Archived Shakshuka.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore recipe" })).toBeInTheDocument());
    expect(screen.getByText("Archived. It can still be logged.")).toBeInTheDocument();
  });

  it("goes back to the Recipes tab from a page opened by its address", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(router.push).toHaveBeenCalledWith("/recipes");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("shows a line's portion count and its written words beside the grams, and a food that is gone", async () => {
    const other = recipeOf("Omelette", 1, [
      {
        food: { id: shak.lines[0].food!.id, name: "Kananmuna", per100g: shak.lines[0].food!.per100g },
        grams: 110,
        portion: { id: "00000000-0000-4000-8000-0000000000a1", unit: "KPL_M", name: null, count: 2 },
      },
      {
        food: {
          id: "00000000-0000-4000-8000-0000000000a2",
          name: "Valkosipuli",
          per100g: { energyKcal: 108, proteinG: 7.9, carbsG: 21, fatG: 0.5 },
        },
        grams: 10,
        written: { amount: 2, unit: "clove" },
        note: "sliced",
      },
      { name: "Water", written: { amount: 1, unit: "dl" } },
    ]);
    other.lines[1] = { ...other.lines[1], food: { ...other.lines[1].food!, deleted: true } };
    recipes.recipes.set(other.id, other);
    await act(async () => {});
    renderPage(other.id);
    await waitFor(() => expect(lineAmounts()).toHaveLength(3));
    expect(lineAmounts()).toEqual([
      "Kananmuna2 × Medium piece · 110 g",
      "ValkosipulislicedThis food was deleted.2 cloves · 10 g",
      "WaterNot counted1 dl",
    ]);
  });

  it("keeps the ids a save answers: a line removed and added again stays the same line through the next edit", async () => {
    const fetaLine = shak.lines[2];
    const feta = fineliFood("Feta", { id: fetaLine.food!.id, per100g: fetaLine.food!.per100g });
    jest.mocked(searchFoods).mockResolvedValue({ foods: [feta] });
    jest.mocked(getFood).mockResolvedValue(detailOf(feta));
    jest.mocked(getFavouriteFoods).mockResolvedValue({ foods: [] });
    jest.mocked(getOwnFoods).mockResolvedValue({ foods: [] });
    renderPage();
    const editorOf = () =>
      document.querySelector("[data-editor-ingredients]")!.closest<HTMLElement>('[role="dialog"]')!;
    const save = async (n: number) => {
      fireEvent.click(within(editorOf()).getByRole("button", { name: "Save recipe" }));
      await waitFor(() => expect(recipes.updated).toHaveLength(n));
      await waitFor(() => expect(document.querySelector("[data-editor-ingredients]")).toBeNull());
    };
    // First edit: the feta line removed, and the same feta added again under a new id.
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByRole("dialog", { name: "Edit recipe" });
    fireEvent.click(within(editorOf()).getByRole("button", { name: /^Feta/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove ingredient" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add ingredient" })).toBeNull());
    fireEvent.click(within(editorOf()).getByRole("button", { name: "Add ingredient" }));
    const picker = await screen.findByRole("dialog", { name: "Add ingredient" });
    fireEvent.change(within(picker).getByLabelText("Search foods"), { target: { value: "feta" } });
    await act(() => new Promise((r) => setTimeout(r, 400)));
    fireEvent.click(await within(picker).findByRole("button", { name: /^Feta/ }));
    fireEvent.change(within(picker).getByRole("textbox", { name: "Amount" }), { target: { value: "60" } });
    fireEvent.click(within(picker).getByRole("button", { name: "Add" }));
    fireEvent.click(within(picker).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add ingredient" })).toBeNull());
    await save(1);
    const sentFirst = recipes.updated[0].body.lines.find((l) => l.counted && l.foodId === feta.id)!.id;
    expect(sentFirst).not.toBe(fetaLine.id);
    // The server paired it with the line it held: the answer keeps the old id.
    expect(
      recipes
        .get(shak.id)
        .lines.filter((l) => l.food?.id === feta.id)
        .map((l) => l.id),
    ).toEqual([fetaLine.id]);
    // Second edit: the same line changed. It goes under the id the answer gave, so it stays one line.
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByRole("dialog", { name: "Edit recipe" });
    fireEvent.click(within(editorOf()).getByRole("button", { name: /^Feta/ }));
    const change = await screen.findByRole("dialog", { name: "Add ingredient" });
    fireEvent.change(within(change).getByRole("textbox", { name: "Amount" }), { target: { value: "100" } });
    fireEvent.click(within(change).getByRole("button", { name: "Save" }));
    await save(2);
    const sentSecond = recipes.updated[1].body.lines.find((l) => l.counted && l.foodId === feta.id)!;
    expect(sentSecond.id).toBe(fetaLine.id);
    expect(recipes.get(shak.id).lines.find((l) => l.food?.id === feta.id)).toMatchObject({
      id: fetaLine.id,
      grams: 100,
    });
  });
});
