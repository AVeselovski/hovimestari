import { fakeAuth } from "@/__tests__/helpers/auth";
import { deferred, queryWrapper } from "@/__tests__/helpers/queryClient";
import { confirmArmed } from "@/__tests__/sheet";
import { FakeDays, recordToasts, seededClient, serve } from "@/components/day/__tests__/harness";
import { TODAY } from "@/components/day/__tests__/support";
import { detailOf, fineliFood } from "@/components/foods/__tests__/support";
import { TodayProvider } from "@/components/targets/TodayProvider";
import { PAGE_TOAST_END_HALF_CLASS } from "@/components/ui/PageContainer";
import { btnCompact, stepperGroup } from "@/components/ui/styles";
import { ToastProvider, ToastRegion } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { TodayContext } from "@/hooks/useToday";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { deleteRecipe, getRecipe, setRecipeArchived, setRecipeFavourite } from "@/lib/api/recipes";
import { addDays } from "@/lib/localDate";
import { queryKeys } from "@/lib/queryKeys";
import { recipeSummaryOf } from "@/lib/recipeCache";
import type { Recipe, RecipeList } from "@hovimestari/types";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RecipePage } from "../RecipePage";
import { recipeOf, shakshuka } from "./recipeFixtures";
import { FakeRecipes, refusedAt, serveRecipes } from "./recipeServer";
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
let days: FakeDays;

beforeEach(() => {
  clock = pinClock();
  for (const fn of Object.values(router)) fn.mockReset();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  days = new FakeDays([]);
  serve(days);
  shak = shakshuka({ steps: ["Soften the onion.", "Crack in the eggs."], notes: "Good with rye bread.\nServe hot." });
  days.recipes.set(shak.id, { name: shak.name, basis: shak.basis, archived: false });
  recipes = serveRecipes(new FakeRecipes([shak]));
  // The latest day a recipe is on follows the entries, as on the server.
  recipes.putOn = (id) =>
    days.entries
      .filter((e) => e.recipe?.id === id)
      .map((e) => e.date)
      .sort()
      .at(-1) ?? null;
});

afterEach(() => {
  clock.mockRestore();
  onlineManager.setOnline(true);
});

function renderPageView(id = shak.id, client: QueryClient = seededClient()): { unmount: () => void } {
  return render(
    <TodayProvider>
      <ToastProvider>
        <RecipePage id={id} />
        <ToastRegion />
      </ToastProvider>
    </TodayProvider>,
    { wrapper: queryWrapper(client) },
  );
}

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
/** The card's two column headings, which never change: one serving, then the total for the servings shown. */
const headings = () =>
  [...document.querySelectorAll('[data-recipe-figures] thead th[scope="col"]')].map((th) => th.textContent);
const HEADINGS = ["Per serving", "Total"];
/** The stepper's controls, in order: the revert button, the minus, the number and the plus. */
const stepperParts = () => [...document.querySelector("[data-stepper-row]")!.lastElementChild!.children];
const lineAmounts = () =>
  [...document.querySelectorAll("[data-ingredient-rows] li")].map((li) => li.textContent?.replace(/\s+/g, " ").trim());

describe("The recipe page", () => {
  it("shows the server's figures per serving and in total, the lines, the method and the notes", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 2, name: "Shakshuka" })).toBeInTheDocument();
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    // The worked example: 365 kcal and 21.8 g per serving, 730 kcal and 43.6 g whole, never 43.5.
    expect(figureRows()).toEqual([
      ["Calories kcal", "365 kcal", "730 kcal"],
      ["Protein g", "21.8 g", "43.6 g"],
      ["CarbsCarbohydrates g", "9.9 g", "19.7 g"],
      ["Fat g", "25.7 g", "51.4 g"],
    ]);
    expect(headings()).toEqual(HEADINGS);
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
    // Nothing to go back to yet: the revert button keeps its room, unseen, unnamed and out of the Tab order.
    const [revert, minus, number, plus] = stepperParts();
    expect(revert).toHaveAttribute("aria-hidden", "true");
    expect(revert).toHaveAttribute("tabindex", "-1");
    expect(revert.classList.contains("invisible")).toBe(true);
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More servings" }));
    // The headings say the same at every number of servings.
    expect(headings()).toEqual(HEADINGS);
    // Three servings from the basis: 1095 kcal and 65.3 g, never 65.4, three times the rounded serving.
    expect(figureRows().map((r) => r[2])).toEqual(["1095 kcal", "65.3 g", "29.6 g", "77.1 g"]);
    expect(figureRows().map((r) => r[1])).toEqual(["365 kcal", "21.8 g", "9.9 g", "25.7 g"]);
    expect(lineAmounts().slice(0, 4)).toEqual([
      "Kananmuna360 g",
      "Tomaattimurska600 g",
      "Feta90 g",
      "Oliiviöljy22.5 g",
    ]);
    // The button says what it does, and is the element whose room was kept, before the same minus, number and plus.
    const back = screen.getByRole("button", { name: "Back to 2 servings" });
    expect(back).toBe(revert);
    expect(back.classList.contains("invisible")).toBe(false);
    expect(back).not.toHaveAttribute("aria-hidden");
    expect(stepperParts()).toEqual([revert, minus, number, plus]);
    back.focus();
    fireEvent.click(back);
    expect(headings()).toEqual(HEADINGS);
    expect(figureRows().map((r) => r[2])).toEqual(["730 kcal", "43.6 g", "19.7 g", "51.4 g"]);
    expect(lineAmounts()[0]).toBe("Kananmuna240 g");
    // It hides again in place, and focus goes to the minus beside it, never to the page.
    expect(stepperParts()).toEqual([revert, minus, number, plus]);
    expect(revert.classList.contains("invisible")).toBe(true);
    expect(minus).toHaveFocus();
  });

  it("takes a typed number of servings, and keeps the last whole number while the field holds anything else", async () => {
    renderPage();
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    const field = screen.getByLabelText("Servings") as HTMLInputElement;
    const totals = () => figureRows().map((r) => r[2]);
    const own = totals();
    fireEvent.change(field, { target: { value: "4" } });
    expect(totals()).toEqual(["1460 kcal", "87.1 g", "39.5 g", "102.8 g"]);
    expect(screen.getByRole("button", { name: "Back to 2 servings" })).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "" } });
    expect(totals()).toEqual(own);
    fireEvent.change(field, { target: { value: "101" } });
    expect(totals()).toEqual(own);
    expect(headings()).toEqual(HEADINGS);
    fireEvent.blur(field);
    expect(field.value).toBe("2");
  });

  it("shows a row's name, servings and figures from the list while the recipe is read", async () => {
    const client = seededClient();
    client.setQueryData<RecipeList>(queryKeys.recipeList(false), { recipes: [recipeSummaryOf(shak)] });
    jest.mocked(getRecipe).mockReturnValue(new Promise(() => {}));
    renderPage(shak.id, client);
    expect(screen.getByRole("heading", { level: 2, name: "Shakshuka" })).toBeInTheDocument();
    expect(screen.getByText("Serves 2")).toBeInTheDocument();
    expect(figureRows()[0]).toEqual(["Calories kcal", "365 kcal", "730 kcal"]);
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

  it("asks before a delete, then leaves for the Library", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete recipe" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Shakshuka?" });
    expect(confirm).toHaveTextContent("Days it was planned or eaten on keep their figures.");
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    // The list brings the row it focuses into view, so the router is told to leave the scroll alone.
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/recipes", { scroll: false }));
    expect(deleteRecipe).toHaveBeenCalledWith(shak.id);
    expect(recipes.recipes.has(shak.id)).toBe(false);
  });

  it("marks a favourite at once, and archives with a toast that says so", async () => {
    renderPage();
    const star = await screen.findByRole("button", { name: "Favourite" });
    // A press waits while the app asks the server for today, which it does as the page opens.
    await waitFor(() => expect(star).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(star);
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(recipes.recipes.get(shak.id)!.favourite).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Archive recipe" }));
    expect(await screen.findByText("Archived Shakshuka.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore recipe" })).toBeInTheDocument());
    expect(screen.getByText("Archived. It can still be logged.")).toBeInTheDocument();
  });

  it("sends no archive and no favourite while the app asks the server for today, and says nothing", async () => {
    const shown = recordToasts();
    render(
      <TodayContext.Provider
        value={{ today: TODAY, holding: true, confirm: "fresh", unconfirmed: false, retry: () => {} }}
      >
        <ToastProvider>
          <RecipePage id={shak.id} />
          <ToastRegion />
        </ToastProvider>
      </TodayContext.Provider>,
      { wrapper: queryWrapper(seededClient()) },
    );
    const archive = await screen.findByRole("button", { name: "Archive recipe" });
    expect(archive).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(archive);
    const star = screen.getByRole("button", { name: "Favourite" });
    expect(star).toHaveAttribute("aria-disabled", "true");
    // Both dim while they wait: on a phone the cursor says nothing.
    for (const held of [star, archive]) expect(held.className.split(/\s+/)).toContain("aria-disabled:opacity-60");
    fireEvent.click(star);
    await act(async () => {});
    expect(setRecipeArchived).not.toHaveBeenCalled();
    expect(setRecipeFavourite).not.toHaveBeenCalled();
    expect(star).toHaveAttribute("aria-pressed", "false");
    shown.stop();
    expect(shown.shown).toEqual([]);
    expect(screen.getByRole("button", { name: "Archive recipe" })).toBeInTheDocument();
  });

  it("ends in Delete recipe over half a toast's room, with no date line, before and after the recipe is on a day", async () => {
    const client = renderPage();
    const saturday = addDays(TODAY, 5);
    const log = await screen.findByRole("button", { name: "Log" });
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    const page = document.querySelector("[data-recipe-page]")!;
    // The page's end room: its padding classes on the container around the page.
    const endRoom = () =>
      [...page.closest(".pb-toast-clearance, .pb-toast-clearance-half, .pb-12")!.classList].filter((c) =>
        c.startsWith("pb-"),
      );
    const endsInDelete = () =>
      expect(page.lastElementChild).toContainElement(screen.getByRole("button", { name: "Delete recipe" }));
    // A recipe never on a day.
    expect(client.getQueryData<Recipe>(queryKeys.recipeDetail(shak.id))?.lastPutOn).toBeNull();
    endsInDelete();
    expect(page).not.toHaveTextContent(/on a day/i);
    expect(endRoom()).toEqual([PAGE_TOAST_END_HALF_CLASS]);
    fireEvent.click(log);
    const sheet = await screen.findByRole("dialog", { name: "Log Shakshuka" });
    fireEvent.change(within(sheet).getByLabelText("Date"), { target: { value: saturday } });
    const add = within(sheet).getByRole("button", { name: "Add to plan" });
    await waitFor(() => expect(add).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(add);
    // The page reads the recipe again and now holds a latest day, and still shows none, in the same room.
    await waitFor(() => expect(client.getQueryData<Recipe>(queryKeys.recipeDetail(shak.id))?.lastPutOn).toBe(saturday));
    endsInDelete();
    expect(page).not.toHaveTextContent(/on a day/i);
    expect(document.querySelector("[data-recipe-on-day]")).toBeNull();
    expect(endRoom()).toEqual([PAGE_TOAST_END_HALF_CLASS]);
  });

  it("goes back to the Library from a page opened by its address", async () => {
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
    jest.mocked(searchFoods).mockResolvedValue({ foods: [feta], near: [] });
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
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Feta" })).toBeNull());
    fireEvent.click(within(editorOf()).getByRole("button", { name: "Add ingredient" }));
    const picker = await screen.findByRole("dialog", { name: "Add ingredient" });
    fireEvent.change(within(picker).getByLabelText("Search foods"), { target: { value: "feta" } });
    await act(() => new Promise((r) => setTimeout(r, 400)));
    fireEvent.click(await within(picker).findByRole("button", { name: /^Feta/ }));
    fireEvent.change(within(picker).getByRole("textbox", { name: "Amount" }), { target: { value: "60" } });
    fireEvent.click(within(picker).getByRole("button", { name: "Add" }));
    fireEvent.click(within(picker).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(document.querySelector("[data-status-line]")).toBeNull());
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
    const change = await screen.findByRole("dialog", { name: "Feta" });
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

  it("says a failed first read is a failed read, and the offline line only without a connection", async () => {
    jest.mocked(getRecipe).mockRejectedValue(refusedAt(500, "internal"));
    renderPage();
    expect(await screen.findByText("This recipe shows once Hovimestari can reach the server.")).toBeInTheDocument();
    expect(screen.queryByText("This recipe needs a connection.")).toBeNull();
  });

  it("says so under the row's figures when the recipe opened from a row cannot be read", async () => {
    const client = seededClient();
    client.setQueryData<RecipeList>(queryKeys.recipeList(false), { recipes: [recipeSummaryOf(shak)] });
    jest.mocked(getRecipe).mockRejectedValue(refusedAt(500, "internal"));
    renderPage(shak.id, client);
    expect(screen.getByRole("heading", { level: 2, name: "Shakshuka" })).toBeInTheDocument();
    // Never half a page with no word of why the rest is missing.
    expect(await screen.findByText("This recipe shows once Hovimestari can reach the server.")).toBeInTheDocument();
    expect(figureRows()[0]).toEqual(["Calories kcal", "365 kcal", "730 kcal"]);
    expect(document.querySelector("[data-ingredient-rows]")).toBeNull();
  });

  it("shows each unit once at every width: in the row's label on a phone, in the cells from md, and always aloud", async () => {
    renderPage();
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    const tokens = (el: Element) => el.className.split(/\s+/);
    for (const row of document.querySelectorAll("[data-recipe-figures] tbody tr")) {
      // The label's unit: seen on a phone only, never read aloud.
      const inLabel = [...row.querySelectorAll("th span")].find((s) => /^\s*(kcal|g)$/.test(s.textContent ?? ""))!;
      expect(inLabel).toHaveAttribute("aria-hidden", "true");
      expect(tokens(inLabel)).toContain("md:hidden");
      expect(tokens(inLabel)).not.toContain("max-md:sr-only");
      // Each cell's unit: read aloud at every width, seen from md.
      for (const cell of row.querySelectorAll("td")) {
        const unit = cell.querySelector("span")!;
        expect(unit).not.toHaveAttribute("aria-hidden");
        expect(tokens(unit)).toContain("max-md:sr-only");
        expect(tokens(unit)).not.toContain("md:hidden");
      }
    }
    // The row is as tall as Back, and Edit is lower, so Edit arriving with the recipe moves nothing under it.
    const topRow = screen.getByRole("button", { name: "Back" }).parentElement!;
    expect(tokens(topRow)).toContain("min-h-11");
    expect(tokens(screen.getByRole("button", { name: "Back" }))).toContain("min-h-11");
    // Edit is the compact button: drawn 40px tall and pressed over 44, measured in a browser.
    const edit = screen.getByRole("button", { name: "Edit" });
    expect(tokens(edit)).toEqual(btnCompact.split(" "));
  });

  it("keeps the shell's title as the one level 1 heading, and names the browser's title after the recipe", async () => {
    const title = document.createElement("title");
    title.textContent = "Recipes · Hovimestari";
    document.head.append(title);
    const text = title.firstChild;
    try {
      const { unmount } = renderPageView();
      expect(await screen.findByRole("heading", { level: 2, name: "Shakshuka" })).toBeInTheDocument();
      expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
      await waitFor(() => expect(document.title).toBe("Shakshuka · Hovimestari"));
      // The framework's own text node is rewritten in place, so its next title still lands in the document.
      expect(title.firstChild).toBe(text);
      unmount();
      expect(document.title).toBe("Recipes · Hovimestari");
    } finally {
      title.remove();
    }
  });

  it("puts focus on the recipe's name as the page arrives, and leaves it where the person already put it", async () => {
    renderPage();
    const name = await screen.findByRole("heading", { level: 2, name: "Shakshuka" });
    expect(name).toHaveFocus();
  });

  it("opens Edit on the recipe as the server holds it now, reading it first when the page's copy may be old", async () => {
    const client = renderPage();
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    // Changed elsewhere since the page read it, such as by a connected assistant.
    recipes.recipes.set(shak.id, { ...shak, name: "Shakshuka with feta" });
    const read = deferred<Recipe>();
    jest.mocked(getRecipe).mockImplementationOnce(() => read.promise);
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.recipeDetail(shak.id), refetchType: "none" });
    });
    const edit = screen.getByRole("button", { name: "Edit" });
    fireEvent.click(edit);
    await waitFor(() => expect(edit).toHaveAttribute("aria-busy", "true"));
    // Nothing opens on the old copy: a save from it would write over the other edit.
    expect(document.querySelector("[data-editor-ingredients]")).toBeNull();
    await act(async () => read.resolve(recipes.get(shak.id)));
    const editor = await screen.findByRole("dialog", { name: "Edit recipe" });
    expect((within(editor).getByLabelText("Name", { selector: "input" }) as HTMLInputElement).value).toBe(
      "Shakshuka with feta",
    );
    expect(edit).not.toHaveAttribute("aria-busy");
  });

  it("opens Edit at once on a recipe just read", async () => {
    renderPage();
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    const reads = jest.mocked(getRecipe).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(document.querySelector("[data-editor-ingredients]")).not.toBeNull();
    expect(getRecipe).toHaveBeenCalledTimes(reads);
  });

  it("turns the star back and reads the recipe again when the mark fails", async () => {
    renderPage();
    const star = await screen.findByRole("button", { name: "Favourite" });
    await waitFor(() => expect(star).not.toHaveAttribute("aria-disabled"));
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    const reads = jest.mocked(getRecipe).mock.calls.length;
    jest.mocked(setRecipeFavourite).mockRejectedValueOnce(refusedAt(500, "internal"));
    fireEvent.click(star);
    // The failure's line shows in a toast, where the press was.
    await waitFor(() => expect(document.querySelector("[data-toast]")).not.toBeNull());
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "false"));
    // What the server holds is not known after a failure: the page asks.
    await waitFor(() => expect(jest.mocked(getRecipe).mock.calls.length).toBeGreaterThan(reads));
  });

  it("keeps focus on the minus when stepping down to 1, and says the new figures aloud", async () => {
    renderPage();
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    // The live region is on the page before anything is said: one that arrives filled may not be read.
    const region = document.querySelector("[data-figures-said]")!;
    expect(region).toHaveAttribute("aria-live", "polite");
    const said = () => {
      expect(document.querySelector("[data-figures-said]")).toBe(region);
      return region.textContent;
    };
    // Nothing is said before the person steps.
    expect(said()).toBe("");
    const fewer = screen.getByRole("button", { name: "Fewer servings" });
    fewer.focus();
    fireEvent.click(fewer);
    expect(figureRows().map((r) => r[2])).toEqual(figureRows().map((r) => r[1]));
    // At its limit the button says so and stays a button focus can be on.
    expect(fewer).toHaveAttribute("aria-disabled", "true");
    expect(fewer).not.toBeDisabled();
    expect(fewer).toHaveFocus();
    fireEvent.click(fewer);
    expect(headings()).toEqual(HEADINGS);
    // Aloud, the total names its servings.
    expect(said()).toBe("For 1 serving: 365 kcal, 21.8 g protein, 9.9 g carbohydrates, 25.7 g fat.");
    fireEvent.click(screen.getByRole("button", { name: "More servings" }));
    expect(said()).toBe("For 2 servings: 730 kcal, 43.6 g protein, 19.7 g carbohydrates, 51.4 g fat.");
  });

  it("keeps the stepper's room in the card while the recipe is read cold, and says the card is busy", async () => {
    jest.mocked(getRecipe).mockReturnValue(new Promise(() => {}));
    renderPage();
    const card = document.querySelector("[data-recipe-figures]")!;
    expect(card).toHaveAttribute("aria-busy", "true");
    // The room is the stepper's row, unseen: its title and the stepper's width, so it wraps as the row will.
    const room = card.querySelector("[data-stepper-room]")!;
    expect(room).toHaveAttribute("aria-hidden", "true");
    expect(room.classList.contains("invisible")).toBe(true);
    expect(room.textContent).toBe("Servings");
    expect(room.lastElementChild!.className).toBe(stepperGroup);
    // The live region is there already, empty.
    expect(card.querySelector("[data-figures-said]")!.textContent).toBe("");
    expect(card.querySelectorAll("tbody tr")).toHaveLength(4);
  });

  it("says which day a log from the page went to when it is not today, and nothing of the day for today", async () => {
    const shown = recordToasts();
    renderPage();
    const log = await screen.findByRole("button", { name: "Log" });
    await waitFor(() => expect(lineAmounts()).toHaveLength(5));
    const logOn = async (date: string) => {
      fireEvent.click(log);
      const sheet = await screen.findByRole("dialog", { name: "Log Shakshuka" });
      fireEvent.change(within(sheet).getByLabelText("Date"), { target: { value: date } });
      const add = within(sheet).getByRole("button", { name: "Log" });
      await waitFor(() => expect(add).not.toHaveAttribute("aria-disabled"));
      fireEvent.click(add);
      await waitFor(() => expect(days.entries.some((e) => e.date === date)).toBe(true));
      await waitFor(() => expect(document.querySelector('[role="dialog"][data-open]:not([data-toast])')).toBeNull());
    };
    await logOn(addDays(TODAY, -1));
    await waitFor(() => expect(shown.shown).toContain("Logged Shakshuka, 1 serving, for yesterday.Undo"));
    await logOn(TODAY);
    await waitFor(() => expect(shown.shown).toContain("Logged Shakshuka, 1 serving.Undo"));
    shown.stop();
  });
});
