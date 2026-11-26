import { fakeAuth } from "@/__tests__/helpers/auth";
import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import { deferred, queryWrapper } from "@/__tests__/helpers/queryClient";
import { FakeDays, liveToast, renderDay, rowOf, seededClient, serve } from "@/components/day/__tests__/harness";
import { TODAY, foodEntry, recipeEntry } from "@/components/day/__tests__/support";
import { openLogSheet } from "@/components/log/__tests__/logHarness";
import { TodayProvider } from "@/components/targets/TodayProvider";
import { ToastProvider, ToastRegion } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { TodayContext, type TodayState } from "@/hooks/useToday";
import { createCook } from "@/lib/api/cooks";
import { getRecipe } from "@/lib/api/recipes";
import { formatGrams, formatKcal } from "@/lib/foodFormat";
import { queryKeys } from "@/lib/queryKeys";
import { recipeSummaryOf } from "@/lib/recipeCache";
import type { Day, Entry, Recipe } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RecipePage } from "../RecipePage";
import { FakeCooks, serveCooks } from "./cookServer";
import { shakshuka } from "./recipeFixtures";
import { FakeRecipes, refusedAt, serveRecipes } from "./recipeServer";

// ---------------------------------------------------------------------------
// The three ways into the "log as made" sheet, each on the real screen that
// holds it: an entry's sheet on the Day tab, the log sheet's recipe view, and
// the recipe's page. And what a batch's serving reads on the Day tab after.
// The fake days, recipe and batch servers answer. The app's today is Monday
// 16 November 2026, the clock runs from noon that day, and dates and figures
// format as a British phone.
// ---------------------------------------------------------------------------

const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let searchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
  usePathname: () => "/",
}));
jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/cooks", () => ({ createCook: jest.fn() }));
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn() }));
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
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
  copyEntries: jest.fn(),
  removeEntries: jest.fn(),
}));
jest.mock("@/lib/api/foods", () => ({
  searchFoods: jest.fn().mockResolvedValue({ foods: [], near: [] }),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
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

jest.setTimeout(20_000);

const TOMORROW = "2026-11-17";
let recipe: Recipe;
let recipes: FakeRecipes;
let days: FakeDays;
let cooks: FakeCooks;

function serving(date: string, servings = 1, overrides: Partial<Entry> = {}): Entry {
  return recipeEntry("Shakshuka", servings, recipe.basis, {
    date,
    status: "planned",
    recipe: { id: recipe.id, archived: false, deleted: false },
    ...overrides,
  });
}

function world(entries: Entry[]): void {
  days = new FakeDays(entries);
  days.recipes.set(recipe.id, { name: recipe.name, basis: recipe.basis, archived: false });
  serve(days, { recipes: false });
  cooks = serveCooks(days, recipes);
}

beforeEach(() => {
  clockFrom(`${TODAY}T12:00:00Z`);
  setTestLocale("en-GB");
  searchParams = new URLSearchParams();
  for (const fn of Object.values(router)) fn.mockReset();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  recipe = shakshuka();
  recipes = serveRecipes(new FakeRecipes([recipe]));
});
afterEach(() => jest.restoreAllMocks());

/** The batch sheet, read from the DOM. */
const cookSheet = () =>
  document.querySelector("[data-cook-ingredients]")?.closest<HTMLElement>('[role="dialog"]') ?? null;
const dialogs = () => [
  ...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]:not([data-toast])'),
];
const mainButton = (name: string) => within(rowOf(name)).getByRole("button", { name: new RegExp(`^${name}`) });
/** A row's amount line and its two figures as shown. */
function rowShows(name: string): string[] {
  const button = mainButton(name);
  const meta = button.querySelector(".line-clamp-2")!.nextElementSibling!.textContent;
  const figures = [...button.querySelectorAll(".font-mono > span")].map((line) => {
    const copy = line.cloneNode(true) as Element;
    for (const spoken of copy.querySelectorAll(".sr-only")) spoken.remove();
    return copy.textContent!.replace(/ /g, " ");
  });
  return [meta ?? "", ...figures];
}
const rowOfServer = (entry: Entry, meta: string) => [
  meta,
  `${formatKcal(entry.figures.energyKcal)} kcal`,
  `${formatGrams(entry.figures.proteinG)} g`,
];

async function openEntry(name: string): Promise<HTMLElement> {
  fireEvent.click(await waitFor(() => mainButton(name)));
  return screen.findByRole("dialog", { name });
}

async function pressLogAsMade(within_: HTMLElement): Promise<HTMLElement> {
  fireEvent.click(within(within_).getByRole("button", { name: "Log as made" }));
  await waitFor(() => expect(cookSheet()).not.toBeNull());
  // The days it reads for the other planned servings land a task later.
  await act(() => new Promise((r) => setTimeout(r, 30)));
  return cookSheet()!;
}

describe("Log as made from an entry on the Day tab", () => {
  it("stacks the batch sheet on the entry's sheet, logs in one request, closes both and shows the batch's serving on both days", async () => {
    const saturday = serving(TODAY);
    const sunday = serving(TOMORROW);
    world([foodEntry("Quark", 250), saturday, sunday]);
    const { client } = renderDay();
    const entrySheet = await openEntry("Shakshuka");
    const reads = jest.mocked(getRecipe).mock.calls.length;
    const sheet = await pressLogAsMade(entrySheet);
    // The recipe is read for the batch's lines, once, and the sheet opens on it.
    expect(getRecipe).toHaveBeenCalledTimes(reads + 1);
    expect(sheet).toHaveAccessibleName("Log Shakshuka as made");
    expect(dialogs()).toHaveLength(2);
    expect(within(sheet).getByLabelText("Made on")).toHaveValue(TODAY);

    fireEvent.change(within(sheet).getByLabelText("It gave", { selector: "input" }), { target: { value: "3" } });
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Tue 17 Nov · 1 serving" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Log as made" }));
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    expect(createCook).toHaveBeenCalledTimes(1);
    expect(cooks.created[0]).toMatchObject({
      attach: [saturday.id, sunday.id],
      attachStatus: [{ id: saturday.id, status: "eaten" }],
      add: [],
      servings: 3,
    });
    // The toast names the days, since the batch fed two.
    const toast = liveToast();
    expect(toast).toHaveTextContent("Logged Shakshuka as made, on 2 days.");
    expect(within(toast).queryByRole("button")).toBeNull();

    // The row is the server's entry: marked eaten, the batch's figures, and "as made" once.
    const held = days.entries.find((e) => e.id === saturday.id)!;
    expect(held.figures).not.toEqual(saturday.figures);
    await waitFor(() => expect(rowShows("Shakshuka")).toEqual(rowOfServer(held, "1 serving as made")));
    expect(within(rowOf("Shakshuka")).queryByRole("button", { name: "Mark Shakshuka eaten" })).toBeNull();
    // The other day is in the cache from the same answer, both readings as the server holds them.
    const cached = client.getQueryData<Day>(queryKeys.day(TOMORROW))!;
    expect(cached.entries.map((e) => [e.cook?.id, e.status, e.figures])).toEqual([
      [cooks.created[0].id, "planned", days.entries.find((e) => e.id === sunday.id)!.figures],
    ]);
    expect(cached.withPlan.figures).toEqual(days.day(TOMORROW).withPlan.figures);
    expect(cached.eaten.figures).toEqual(days.day(TOMORROW).eaten.figures);
    // Its sheet now names the batch, says it differs, and offers no second batch.
    const again = await openEntry("Shakshuka");
    expect(again.querySelector("[data-entry-batch]")).toHaveTextContent(
      "From the batch made on Mon 16 Nov. It differs from the recipe.",
    );
    expect(within(again).queryByRole("button", { name: "Log as made" })).toBeNull();
    expect(within(again).getByRole("link", { name: "Open recipe" })).toBeInTheDocument();
  });

  it("says as made on the row only while the batch differs: a batch made as written reads as the recipe", async () => {
    const entry = serving(TODAY);
    world([entry]);
    renderDay();
    const sheet = await pressLogAsMade(await openEntry("Shakshuka"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Log as made" }));
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    const held = days.entries[0];
    expect(held.cook).toMatchObject({ differs: false });
    await waitFor(() => expect(rowShows("Shakshuka")).toEqual(rowOfServer(held, "1 serving")));
    const again = await openEntry("Shakshuka");
    expect(again.querySelector("[data-entry-batch]")!.textContent).toBe("From the batch made on Mon 16 Nov.");
  });

  it("goes back to the entry's sheet on Cancel, with focus on Log as made, and to the row when that closes", async () => {
    world([serving(TODAY)]);
    renderDay();
    const entrySheet = await openEntry("Shakshuka");
    const sheet = await pressLogAsMade(entrySheet);
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(cookSheet()).toBeNull());
    expect(within(entrySheet).getByRole("button", { name: "Log as made" })).toHaveFocus();
    expect(createCook).not.toHaveBeenCalled();
    fireEvent.click(within(entrySheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    expect(mainButton("Shakshuka")).toHaveFocus();
  });

  it("waits on unsaved changes as Open recipe does, and says why", async () => {
    world([serving(TODAY)]);
    renderDay();
    const entrySheet = await openEntry("Shakshuka");
    const reads = jest.mocked(getRecipe).mock.calls.length;
    fireEvent.change(within(entrySheet).getByLabelText("Servings", { selector: "input" }), { target: { value: "2" } });
    const button = within(entrySheet).getByRole("button", { name: "Log as made" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Save or cancel first.");
    fireEvent.click(button);
    await act(async () => {});
    expect(getRecipe).toHaveBeenCalledTimes(reads);
    expect(cookSheet()).toBeNull();
  });

  it("is busy while the recipe is read, opens once for two presses, and says a failed read in the entry sheet's footer", async () => {
    world([serving(TODAY)]);
    renderDay();
    const entrySheet = await openEntry("Shakshuka");
    const held = deferred<Recipe>();
    jest.mocked(getRecipe).mockReturnValueOnce(held.promise);
    const button = within(entrySheet).getByRole("button", { name: "Log as made" });
    const reads = jest.mocked(getRecipe).mock.calls.length;
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    expect(getRecipe).toHaveBeenCalledTimes(reads + 1);
    await act(async () => held.reject(refusedAt(404, "recipe_not_found")));
    expect(cookSheet()).toBeNull();
    expect(button).not.toHaveAttribute("aria-busy");
    expect(entrySheet.querySelector("[data-sheet-footer]")).toHaveTextContent("This recipe is no longer available.");
  });

  describe("a recipe read that answers after the entry's sheet has moved on", () => {
    /** Presses Log as made with the recipe's read held, and answers how to let it go. */
    async function pressWithReadHeld(entrySheet: HTMLElement): Promise<() => Promise<void>> {
      const held = deferred<Recipe>();
      jest.mocked(getRecipe).mockReturnValueOnce(held.promise);
      const button = within(entrySheet).getByRole("button", { name: "Log as made" });
      fireEvent.click(button);
      await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
      return async () => {
        await act(async () => held.resolve(JSON.parse(JSON.stringify(recipe)) as Recipe));
        await act(() => new Promise((r) => setTimeout(r, 30)));
      };
    }

    it("opens no batch sheet over servings typed during the read, and keeps what was typed", async () => {
      world([serving(TODAY)]);
      renderDay();
      const entrySheet = await openEntry("Shakshuka");
      const release = await pressWithReadHeld(entrySheet);
      const field = within(entrySheet).getByLabelText("Servings", { selector: "input" });
      fireEvent.change(field, { target: { value: "2" } });
      await release();
      expect(cookSheet()).toBeNull();
      expect(dialogs()).toHaveLength(1);
      expect(field).toHaveValue("2");
      expect(within(entrySheet).getByRole("button", { name: "Log as made" })).not.toHaveAttribute("aria-busy");
    });

    it("opens once the changes are undone and Log as made is pressed again", async () => {
      world([serving(TODAY)]);
      renderDay();
      const entrySheet = await openEntry("Shakshuka");
      const release = await pressWithReadHeld(entrySheet);
      const field = within(entrySheet).getByLabelText("Servings", { selector: "input" });
      fireEvent.change(field, { target: { value: "2" } });
      await release();
      fireEvent.change(field, { target: { value: "1" } });
      await pressLogAsMade(entrySheet);
      expect(dialogs()).toHaveLength(2);
    });

    it("opens no batch sheet after Remove entry was pressed during the read", async () => {
      world([serving(TODAY)]);
      renderDay();
      const entrySheet = await openEntry("Shakshuka");
      const release = await pressWithReadHeld(entrySheet);
      fireEvent.click(within(entrySheet).getByRole("button", { name: "Remove entry" }));
      await waitFor(() => expect(days.entries).toHaveLength(0));
      await release();
      expect(cookSheet()).toBeNull();
      await waitFor(() => expect(dialogs()).toHaveLength(0));
      expect(createCook).not.toHaveBeenCalled();
    });
  });

  it("closes the entry's sheet with the batch sheet once a lost answer's batch is known to be stored, with no toast", async () => {
    const entry = serving(TODAY);
    world([entry]);
    renderDay();
    const sheet = await pressLogAsMade(await openEntry("Shakshuka"));
    // The first request lands and its answer is lost. The second, changed, is answered with the first batch.
    jest.mocked(createCook).mockImplementationOnce(async (body) => {
      cooks.create(body);
      throw refusedAt(500, "internal");
    });
    fireEvent.click(within(sheet).getByRole("button", { name: "Log as made" }));
    await waitFor(() => expect(createCook).toHaveBeenCalledTimes(1));
    await act(() => new Promise((r) => setTimeout(r, 50)));
    fireEvent.change(within(sheet).getByLabelText("It gave", { selector: "input" }), { target: { value: "4" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Log as made" }));
    await waitFor(() =>
      expect(sheet.querySelector("[data-sheet-footer]")).toHaveTextContent(
        "This batch was already logged as it was first sent. Press Cancel to see it on the day.",
      ),
    );
    expect(dialogs()).toHaveLength(2);
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    expect(document.querySelector("[data-toast]")).toBeNull();
    // The day shows the batch as it was stored: the recipe's own two servings, so no mark.
    const held = days.entries.find((e) => e.id === entry.id)!;
    expect(held.cook).toMatchObject({ servings: 2, differs: false });
    await waitFor(() => expect(rowShows("Shakshuka")).toEqual(rowOfServer(held, "1 serving")));
  });

  it("puts Open recipe and Log as made in one row, and dims both with one line while the sheet has changes", async () => {
    world([serving(TODAY)]);
    renderDay();
    const entrySheet = await openEntry("Shakshuka");
    const row = entrySheet.querySelector<HTMLElement>("[data-recipe-actions]")!;
    expect([...row.children].map((c) => c.textContent)).toEqual(["Open recipe", "Log as made"]);
    const why = entrySheet.querySelector<HTMLElement>("[data-open-recipe-why]")!;
    // Under the row, not in it: the line showing moves neither action.
    expect(row.contains(why)).toBe(false);
    expect(why).toBeEmptyDOMElement();
    fireEvent.change(within(entrySheet).getByLabelText("Servings", { selector: "input" }), { target: { value: "2" } });
    expect(why).toHaveTextContent("Save or cancel first.");
    for (const control of [
      within(entrySheet).getByRole("link", { name: "Open recipe" }),
      within(entrySheet).getByRole("button", { name: "Log as made" }),
    ]) {
      expect(control).toHaveAttribute("aria-disabled", "true");
      expect(control).toHaveAccessibleDescription("Save or cancel first.");
    }
  });

  it("offers no batch for an entry of a deleted recipe, which keeps Open recipe", async () => {
    world([serving(TODAY, 1, { recipe: { id: recipe.id, archived: false, deleted: true } })]);
    renderDay();
    const entrySheet = await openEntry("Shakshuka");
    expect(within(entrySheet).getByRole("link", { name: "Open recipe" })).toBeInTheDocument();
    expect(within(entrySheet).queryByRole("button", { name: "Log as made" })).toBeNull();
    expect(entrySheet.querySelector("[data-entry-batch]")).toBeNull();
  });
});

describe("Log as made from the log sheet's recipe view", () => {
  beforeEach(() => {
    world([foodEntry("Quark", 250)]);
    days.recipeSummaries = [recipeSummaryOf(recipe)];
  });

  it("stands beside Open recipe, starts the batch on the sheet's day with the servings typed, and closes both sheets", async () => {
    renderDay();
    const logSheet = await openLogSheet();
    fireEvent.click(
      within(within(logSheet).getByRole("region", { name: "Recipes" })).getByRole("button", { name: /^Shakshuka/ }),
    );
    await within(logSheet).findByRole("button", { name: "Back" });
    const actions = logSheet.querySelector<HTMLElement>("[data-recipe-actions]")!;
    expect([...actions.children].map((c) => c.textContent)).toEqual(["Open recipe", "Log as made"]);
    fireEvent.change(within(logSheet).getByRole("textbox", { name: "Servings" }), { target: { value: "1.5" } });

    const sheet = await pressLogAsMade(actions);
    expect(dialogs()).toHaveLength(2);
    expect(within(sheet).getByLabelText("Made on")).toHaveValue(TODAY);
    const first = within(sheet).getByRole("group", { name: "New servings 1" });
    expect(within(first).getByLabelText("Date")).toHaveValue(TODAY);
    expect(within(first).getByLabelText("Servings", { selector: "input" })).toHaveValue("1.5");
    expect(within(first).getByRole("radio", { name: "Eaten" })).toBeChecked();

    fireEvent.click(within(sheet).getByRole("button", { name: "Log as made" }));
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    expect(cooks.created[0]).toMatchObject({
      attach: [],
      add: [{ date: TODAY, status: "eaten", servings: 1.5 }],
    });
    expect(liveToast()).toHaveTextContent("Logged Shakshuka as made.");
    const held = days.entries.find((e) => e.kind === "recipe")!;
    await waitFor(() => expect(rowShows("Shakshuka")).toEqual(rowOfServer(held, "1.5 servings")));
  });

  it("opens no batch sheet when Back was pressed while the recipe was read", async () => {
    renderDay();
    const logSheet = await openLogSheet();
    fireEvent.click(
      within(within(logSheet).getByRole("region", { name: "Recipes" })).getByRole("button", { name: /^Shakshuka/ }),
    );
    await within(logSheet).findByRole("button", { name: "Back" });
    const held = deferred<Recipe>();
    jest.mocked(getRecipe).mockReturnValueOnce(held.promise);
    const button = within(logSheet).getByRole("button", { name: "Log as made" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    fireEvent.click(within(logSheet).getByRole("button", { name: "Back" }));
    await within(logSheet).findByRole("region", { name: "Recipes" });
    await act(async () => held.resolve(JSON.parse(JSON.stringify(recipe)) as Recipe));
    await act(() => new Promise((r) => setTimeout(r, 30)));
    expect(cookSheet()).toBeNull();
    expect(dialogs()).toHaveLength(1);
  });

  it("starts with 1 serving when the log block holds none it can read", async () => {
    renderDay();
    const logSheet = await openLogSheet();
    fireEvent.click(
      within(within(logSheet).getByRole("region", { name: "Recipes" })).getByRole("button", { name: /^Shakshuka/ }),
    );
    await within(logSheet).findByRole("button", { name: "Back" });
    fireEvent.change(within(logSheet).getByRole("textbox", { name: "Servings" }), { target: { value: "" } });
    const sheet = await pressLogAsMade(logSheet.querySelector<HTMLElement>("[data-recipe-actions]")!);
    const first = within(sheet).getByRole("group", { name: "New servings 1" });
    expect(within(first).getByLabelText("Servings", { selector: "input" })).toHaveValue("1");
  });
});

describe("Log as made from the recipe's page", () => {
  function renderPage(client = seededClient()): void {
    render(
      <TodayProvider>
        <ToastProvider>
          <RecipePage id={recipe.id} />
          <ToastRegion />
        </ToastProvider>
      </TodayProvider>,
      { wrapper: queryWrapper(client) },
    );
  }

  it("waits while today is unknown, and opens with today once it is known", async () => {
    world([]);
    const unknown: TodayState = {
      today: null,
      holding: true,
      confirm: "checking",
      unconfirmed: false,
      retry: () => {},
    };
    const page = (today: TodayState) => (
      <TodayContext.Provider value={today}>
        <ToastProvider>
          <RecipePage id={recipe.id} />
          <ToastRegion />
        </ToastProvider>
      </TodayContext.Provider>
    );
    const view = render(page(unknown), { wrapper: queryWrapper(seededClient()) });
    const button = await screen.findByRole("button", { name: "Log as made" });
    await screen.findByRole("heading", { name: "Ingredients" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    await act(() => new Promise((r) => setTimeout(r, 30)));
    expect(cookSheet()).toBeNull();
    view.rerender(page({ ...unknown, today: TODAY, holding: false, confirm: "fresh" }));
    expect(button).not.toHaveAttribute("aria-disabled");
    fireEvent.click(button);
    await waitFor(() => expect(cookSheet()).not.toBeNull());
    expect(within(cookSheet()!).getByLabelText("Made on")).toHaveValue(TODAY);
    expect(
      within(within(cookSheet()!).getByRole("group", { name: "New servings 1" })).getByLabelText("Date"),
    ).toHaveValue(TODAY);
  });

  it("opens the editor alone when Edit is pressed while the recipe is read for Log as made", async () => {
    world([]);
    const client = seededClient();
    renderPage(client);
    const button = await screen.findByRole("button", { name: "Log as made" });
    await screen.findByRole("heading", { name: "Ingredients" });
    // The page's copy is marked stale and its read does not answer yet, so both presses wait on one read.
    const held = deferred<Recipe>();
    jest.mocked(getRecipe).mockReturnValueOnce(held.promise);
    void client.invalidateQueries({ queryKey: queryKeys.recipeDetail(recipe.id) });
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await act(async () => held.resolve(JSON.parse(JSON.stringify(recipe)) as Recipe));
    await act(() => new Promise((r) => setTimeout(r, 30)));
    expect(cookSheet()).toBeNull();
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0]).toHaveAccessibleName("Edit recipe");
    expect(button).not.toHaveAttribute("aria-busy");
  });

  it("opens with no entry: made today, a first row for today with 1 serving and Eaten, and the toast after it closes", async () => {
    world([]);
    recipes.putOn = (id) => days.entries.find((e) => e.recipe?.id === id)?.date ?? null;
    renderPage();
    const button = await screen.findByRole("button", { name: "Log as made" });
    await screen.findByRole("heading", { name: "Ingredients" });
    fireEvent.click(button);
    await waitFor(() => expect(cookSheet()).not.toBeNull());
    await act(() => new Promise((r) => setTimeout(r, 30)));
    const sheet = cookSheet()!;
    expect(dialogs()).toHaveLength(1);
    expect(within(sheet).getByLabelText("Made on")).toHaveValue(TODAY);
    expect(sheet.querySelector("[data-cook-opening]")).toBeNull();
    const first = within(sheet).getByRole("group", { name: "New servings 1" });
    expect(within(first).getByLabelText("Date")).toHaveValue(TODAY);
    expect(within(first).getByLabelText("Servings", { selector: "input" })).toHaveValue("1");
    expect(within(first).getByRole("radio", { name: "Eaten" })).toBeChecked();

    const reads = jest.mocked(getRecipe).mock.calls.length;
    fireEvent.click(within(sheet).getByRole("button", { name: "Log as made" }));
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    expect(cooks.created[0].add).toEqual([expect.objectContaining({ date: TODAY, status: "eaten", servings: 1 })]);
    await waitFor(() => expect(liveToast()).toHaveTextContent("Logged Shakshuka as made."));
    expect(button).toHaveFocus();
    // The page reads the recipe again, so it holds the day it is now on.
    await waitFor(() => expect(getRecipe).toHaveBeenCalledTimes(reads + 1));
  });
});
