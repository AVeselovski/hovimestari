import { describeFormSheetContract } from "@/__tests__/formSheet";
import { fakeAuth } from "@/__tests__/helpers/auth";
import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import { createTestQueryClient, deferred, registerTestQueryClient } from "@/__tests__/helpers/queryClient";
import { viewHoldPassed } from "@/__tests__/sheet";
import { FakeDays, serve } from "@/components/day/__tests__/fakeDays";
import { TODAY, recipeEntry } from "@/components/day/__tests__/support";
import { detailOf, fineliFood } from "@/components/foods/__tests__/support";
import { ToastProvider, ToastRegion } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useEntryActions } from "@/hooks/useEntryActions";
import { TodayContext, type TodayState } from "@/hooks/useToday";
import { createCook } from "@/lib/api/cooks";
import { getDay } from "@/lib/api/days";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import type { CookBody, CookWriteResult, Day, Entry, Figures, Recipe } from "@hovimestari/types";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { CookSheet, type CookSheetProps } from "../CookSheet";
import { FakeCooks, serveCooks } from "./cookServer";
import { EGG, FETA, OIL, TOMATO, food, recipeOf, shakshuka } from "./recipeFixtures";
import { FakeRecipes, refusedAt, serveRecipes } from "./recipeServer";

// ---------------------------------------------------------------------------
// The "log as made" sheet on its own, with the real entry actions, against
// the fake days, recipe and batch servers. The app's today is Monday 16
// November 2026, the clock runs from noon that day, and dates and figures
// format as a British phone.
//
// The fake batch server computes a batch's figures with the shared
// functions the sheet uses, so "the figures shown equal the server's" here
// means the sheet reads the same lines and servings into them as the request
// carries. That the web and the real server agree is shown by the browser
// walk against the real backend, not by this suite. jsdom lays nothing out
// either: what holds a row's height here is the row keeping every line it
// showed and its row classes, and the heights themselves are measured in the
// browser.
// ---------------------------------------------------------------------------

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));
jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/cooks", () => ({ createCook: jest.fn() }));
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn().mockResolvedValue({ items: [] }) }));
jest.mock("@/lib/api/savedMeals", () => ({
  getSavedMeals: jest.fn().mockResolvedValue({ meals: [] }),
  createSavedMeal: jest.fn(),
  saveAndLog: jest.fn(),
  updateSavedMeal: jest.fn(),
  setSavedMealArchived: jest.fn(),
  deleteSavedMeal: jest.fn(),
}));
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
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
  searchFoods: jest.fn(),
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
const THURSDAY = "2026-11-19";
const NEXT_MONDAY = "2026-11-23";
const TODAY_STATE: TodayState = { today: TODAY, holding: false, confirm: "fresh", unconfirmed: false, retry: () => {} };
const SPINACH = food("Pinaatti", { energyKcal: 20.1, proteinG: 2.4, carbsG: 0.6, fatG: 0.4 });
const ALL = [EGG, TOMATO, FETA, OIL, SPINACH];
const summaries = ALL.map((f) => fineliFood(f.name, { id: f.id, per100g: f.per100g }));

let recipe: Recipe;
let days: FakeDays;
let recipes: FakeRecipes;
let cooks: FakeCooks;
let onClose: jest.Mock;
let onSaved: jest.Mock;

/** A plain entry of the recipe, as its day answers it. */
function serving(date: string, servings = 1, overrides: Partial<Entry> = {}): Entry {
  return recipeEntry("Shakshuka", servings, recipe.basis, {
    date,
    status: "planned",
    recipe: { id: recipe.id, archived: false, deleted: false },
    ...overrides,
  });
}

beforeEach(() => {
  clockFrom(`${TODAY}T12:00:00Z`);
  setTestLocale("en-GB");
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  jest.mocked(searchFoods).mockImplementation(async (q) => ({
    foods: summaries.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())),
    near: [],
  }));
  jest.mocked(getFavouriteFoods).mockResolvedValue({ foods: [] });
  jest.mocked(getOwnFoods).mockResolvedValue({ foods: [] });
  jest.mocked(getFood).mockImplementation(async (id) => detailOf(summaries.find((f) => f.id === id)!));
  recipe = shakshuka();
  recipes = serveRecipes(new FakeRecipes([recipe], ALL));
  onClose = jest.fn();
  onSaved = jest.fn();
  serveDays([]);
});
afterEach(() => jest.restoreAllMocks());

/** Puts `entries` on the fake days server and the batch server over it. */
function serveDays(entries: Entry[]): void {
  days = new FakeDays(entries);
  serve(days, { recipes: false });
  cooks = serveCooks(days, recipes);
}

function Host(props: Partial<CookSheetProps>): ReactElement {
  const actions = useEntryActions(null);
  return (
    <CookSheet
      open
      returnFocusTo={null}
      onClose={onClose}
      onSaved={onSaved}
      recipe={recipe}
      day={TODAY}
      actions={actions}
      {...props}
    />
  );
}

function sheetIn(props: Partial<CookSheetProps>, today: TodayState = TODAY_STATE): ReactElement {
  return (
    <QueryClientProvider client={registerTestQueryClient(createTestQueryClient())}>
      <TodayContext.Provider value={today}>
        <ToastProvider>
          <Host {...props} />
          <ToastRegion />
        </ToastProvider>
      </TodayContext.Provider>
    </QueryClientProvider>
  );
}

/** Renders the sheet and waits for the days it reads for the other planned servings. */
async function renderSheet(props: Partial<CookSheetProps> = {}, today?: TodayState): Promise<void> {
  render(sheetIn(props, today));
  await waitFor(() => expect(getDay).toHaveBeenCalledTimes(7));
  // The answers reach the sheet a task later.
  await act(() => new Promise((r) => setTimeout(r, 20)));
}

/** The sheet's dialog, read from the DOM, so it is found under the picker too. */
const sheet = () => document.querySelector("[data-cook-ingredients]")!.closest<HTMLElement>('[role="dialog"]')!;
const picker = () =>
  document.querySelector<HTMLElement>("[data-status-line]")!.closest<HTMLElement>('[role="dialog"]')!;
const input = (label: string) => within(sheet()).getByLabelText(label, { selector: "input" }) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(input(label), { target: { value } });
const settle = () => act(() => new Promise((r) => setTimeout(r, 400)));
const logButton = () => within(sheet()).getByRole("button", { name: "Log as made" });
const items = () => [...sheet().querySelectorAll<HTMLElement>("[data-ingredient-rows] li")];
/** Each line's text, its spaces as typed. */
const rows = () => items().map((li) => li.textContent!.replace(/ /g, " "));
const row = (name: RegExp) => within(sheet()).getByRole("button", { name });
const figureCells = () =>
  [...sheet().querySelectorAll("[data-recipe-figures] tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => td.textContent!.replace(/ /g, " ")),
  );
/** A table's cells for `perServing` and `whole`, as the card shows them. */
const cellsOf = (perServing: Figures, whole: Figures) => [
  [`${formatKcal(perServing.energyKcal)} kcal`, `${formatKcal(whole.energyKcal)} kcal`],
  [`${formatMacroGrams(perServing.proteinG)} g`, `${formatMacroGrams(whole.proteinG)} g`],
  [`${formatMacroGrams(perServing.carbsG)} g`, `${formatMacroGrams(whole.carbsG)} g`],
  [`${formatMacroGrams(perServing.fatG)} g`, `${formatMacroGrams(whole.fatG)} g`],
];
const servingsSection = () => sheet().querySelector<HTMLElement>("[data-cook-servings]")!;
const state = (within_: HTMLElement, name: "Eaten" | "Planned") => within(within_).getByRole("radio", { name });
const toastText = () => document.querySelector("[data-toast]")?.textContent ?? null;

/** Changes a line's amount through the picker. */
async function changeAmount(name: RegExp, amount: string): Promise<void> {
  fireEvent.click(row(name));
  fireEvent.change(await within(picker()).findByRole("textbox", { name: "Amount" }), { target: { value: amount } });
  await viewHoldPassed(picker);
  fireEvent.click(within(picker()).getByRole("button", { name: "Save" }));
  await act(async () => {});
}

/** Leaves a recipe's line out through the picker. */
async function leaveOut(name: RegExp): Promise<void> {
  fireEvent.click(row(name));
  const leave = await within(picker()).findByRole("button", { name: "Leave out" });
  await viewHoldPassed(picker);
  fireEvent.click(leave);
  await act(async () => {});
}

/** Adds a food through the picker and closes it. */
async function addIngredient(query: string, name: RegExp, amount: string): Promise<void> {
  fireEvent.click(within(sheet()).getByRole("button", { name: "Add ingredient" }));
  fireEvent.change(await within(picker()).findByLabelText("Search foods"), { target: { value: query } });
  await settle();
  fireEvent.click(await within(picker()).findByRole("button", { name }));
  await viewHoldPassed(picker);
  fireEvent.change(within(picker()).getByRole("textbox", { name: "Amount" }), { target: { value: amount } });
  fireEvent.click(within(picker()).getByRole("button", { name: "Add" }));
  await act(async () => {});
  fireEvent.click(within(picker()).getByRole("button", { name: "Done" }));
  await act(async () => {});
}

async function log(): Promise<void> {
  fireEvent.click(logButton());
  await act(async () => {});
}

describe("CookSheet", () => {
  describeFormSheetContract({
    endsInLine: true,
    name: /^log shakshuka as made$/i,
    panelClass: "md:max-w-xl",
    renderSheet: (p) => {
      // One entry for the test, however often the contract renders the sheet.
      const entry = days.entries[0] ?? serving(TODAY);
      days.entries = [entry];
      return sheetIn({ ...p, entry });
    },
    type: () => type("It gave", "3"),
    typedField: () => input("It gave"),
    fillValid: () => type("It gave", "3"),
    holdSave: () => {
      const held = deferred<CookWriteResult>();
      jest.mocked(createCook).mockReturnValue(held.promise);
      return {
        // Answered as the server would answer the body the press sent.
        resolve: () => held.resolve(cooks.create(jest.mocked(createCook).mock.calls.at(-1)![0])),
        reject: () => held.reject(refusedAt(500, "internal")),
      };
    },
    firstField: () => input("Made on"),
    saveName: /^log as made$/i,
    busyName: /^logging…$/i,
  });

  describe("opened from a planned entry today", () => {
    it("starts on the entry's day, the recipe's servings and lines, with the entry Eaten", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      expect(sheet()).toHaveAccessibleName("Log Shakshuka as made");
      expect(input("Made on")).toHaveValue(TODAY);
      expect(input("It gave")).toHaveValue("2");
      expect(input("It gave")).toHaveAccessibleDescription("servings The recipe makes 2.");
      expect(rows()).toEqual([
        "Kananmuna240 g",
        "Tomaattimurska400 g",
        "Feta60 g",
        "Oliiviöljy15 g",
        "SaltNot counted",
      ]);
      // The recipe's own figures, and under them the recipe's serving as a line.
      expect(figureCells()).toEqual(cellsOf(recipe.perServing, recipe.whole));
      // The card's headings are the recipe page's and the editor's: one rule in every host.
      expect(
        [...sheet().querySelectorAll('[data-recipe-figures] thead th[scope="col"]')].map((th) => th.textContent),
      ).toEqual(["Per serving", "Total"]);
      expect(sheet().querySelector("[data-recipe-serving]")).toHaveTextContent(
        "Recipe: 365 kcal · 21.8 g protein per serving",
      );
      const opening = servingsSection().querySelector<HTMLElement>("[data-cook-opening]")!;
      expect(opening).toHaveTextContent("Mon 16 Nov · 1 serving");
      expect(state(opening, "Eaten")).toBeChecked();
      // Nothing to add servings with yet, and no row of new servings.
      expect(servingsSection().querySelector("[data-cook-row]")).toBeNull();
      expect(logButton()).not.toHaveAttribute("aria-disabled");
    });

    it("has no heading and no list while no other serving of the recipe is planned in the week", async () => {
      const entry = serving(TODAY);
      // Eaten, of a batch, another recipe's, and past the six days: none is listed.
      serveDays([
        entry,
        serving(TOMORROW, 1, { status: "eaten" }),
        serving(TOMORROW, 1, { cook: { id: entry.id, date: TODAY, servings: 2, differs: false } }),
        serving(THURSDAY, 1, { recipe: { id: entry.id, archived: false, deleted: false } }),
        serving(NEXT_MONDAY),
      ]);
      await renderSheet({ entry });
      expect(servingsSection().querySelector("[data-cook-others]")).toBeNull();
      expect(within(servingsSection()).queryByRole("checkbox")).toBeNull();
      expect(servingsSection()).not.toHaveTextContent("Other planned servings");
    });

    it("lists the other planned servings of the recipe from its day to six days after, unticked, last in the section", async () => {
      const entry = serving(TODAY);
      const tuesday = serving(TOMORROW);
      const thursday = serving(THURSDAY, 1.5);
      serveDays([entry, thursday, tuesday, serving(NEXT_MONDAY)]);
      await renderSheet({ entry });
      const others = servingsSection().querySelector<HTMLElement>("[data-cook-others]")!;
      expect(others).toHaveAccessibleName("Other planned servings of Shakshuka");
      const boxes = within(others).getAllByRole("checkbox");
      expect(boxes.map((b) => b.closest("label")!.textContent)).toEqual([
        "Tue 17 Nov · 1 serving",
        "Thu 19 Nov · 1.5 servings",
      ]);
      for (const box of boxes) expect(box).not.toBeChecked();
      // After everything else the section holds, so the list arriving moves none of it.
      const add = within(servingsSection()).getByRole("button", { name: "Add servings on another day" });
      expect(add.compareDocumentPosition(others) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // Made on a week later, the window is that week's: Monday 23 November alone.
      fireEvent.change(input("Made on"), { target: { value: NEXT_MONDAY } });
      await waitFor(() =>
        expect(
          within(servingsSection())
            .getAllByRole("checkbox")
            .map((b) => b.closest("label")!.textContent),
        ).toEqual(["Mon 23 Nov · 1 serving"]),
      );
    });

    it("sends the walk as one request: feta changed, oil left out, spinach added, three servings, the next day ticked", async () => {
      const saturday = serving(TODAY);
      const sunday = serving(TOMORROW);
      serveDays([saturday, sunday]);
      const onLogged = jest.fn((announce: () => void) => announce());
      await renderSheet({ entry: saturday, onLogged });
      await changeAmount(/^Feta/, "100");
      await leaveOut(/^Oliiviöljy/);
      await addIngredient("pinaatti", /^Pinaatti/, "80");
      type("It gave", "3");
      fireEvent.click(within(sheet()).getByRole("checkbox", { name: "Tue 17 Nov · 1 serving" }));
      const shown = figureCells();
      await log();

      expect(createCook).toHaveBeenCalledTimes(1);
      const [body] = cooks.created;
      const uuid = expect.stringMatching(/^[0-9a-f-]{36}$/);
      const [egg, tomato, feta, , salt] = recipe.lines;
      expect(body).toEqual({
        id: uuid,
        recipeId: recipe.id,
        date: TODAY,
        servings: 3,
        lines: [
          {
            id: uuid,
            counted: true,
            foodId: EGG.id,
            amount: { grams: 240 },
            written: null,
            note: null,
            fromLineId: egg.id,
          },
          {
            id: uuid,
            counted: true,
            foodId: TOMATO.id,
            amount: { grams: 400 },
            written: null,
            note: null,
            fromLineId: tomato.id,
          },
          {
            id: uuid,
            counted: true,
            foodId: FETA.id,
            amount: { grams: 100 },
            written: null,
            note: null,
            fromLineId: feta.id,
          },
          { id: uuid, counted: false, name: "Salt", written: null, note: null, fromLineId: salt.id },
          {
            id: uuid,
            counted: true,
            foodId: SPINACH.id,
            amount: { grams: 80 },
            written: null,
            note: null,
            fromLineId: null,
          },
        ],
        attach: [saturday.id, sunday.id],
        add: [],
        // Today's entry is marked eaten in the same request. The ticked one keeps its state.
        attachStatus: [{ id: saturday.id, status: "eaten" }],
      });
      // No id of the batch is one of the recipe's line ids.
      expect(body.lines.map((l) => l.id)).not.toEqual(expect.arrayContaining(recipe.lines.map((l) => l.id)));

      // The figures on screen before the press are the answer's for the same lines.
      const cook = cooks.get(body.id);
      expect(shown).toEqual(cellsOf(cook.perServing, cook.whole));
      expect(shown).not.toEqual(cellsOf(recipe.perServing, recipe.whole));
      // And what the rows marked is what the answer says the batch changed.
      expect(cook.diff).toEqual({
        servings: { recipe: 2, cook: 3 },
        changed: [{ lineId: body.lines[2].id, fromLineId: feta.id, fields: ["amount"] }],
        added: [body.lines[4].id],
        leftOut: [recipe.lines[3].id],
      });
      expect(days.entries.map((e) => [e.date, e.status, e.cook?.differs])).toEqual([
        [TODAY, "eaten", true],
        [TOMORROW, "planned", true],
      ]);
      // The host closes the sheets, then the toast: no Undo on it.
      expect(onLogged).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledTimes(1);
      // It names the days, since the batch fed two.
      expect(toastText()).toBe("Logged Shakshuka as made, on 2 days.");
      expect(
        within(document.querySelector<HTMLElement>("[data-toast]")!).queryByRole("button", { name: "Undo" }),
      ).toBeNull();
    });

    it("sends no state for an entry that keeps the one it has", async () => {
      const entry = serving(TODAY, 1, { status: "eaten" });
      serveDays([entry]);
      await renderSheet({ entry });
      await log();
      expect(cooks.created[0].attachStatus).toEqual([]);
    });

    it("sends Planned for an eaten entry when Planned is chosen", async () => {
      const entry = serving(TODAY, 1, { status: "eaten" });
      serveDays([entry]);
      await renderSheet({ entry });
      expect(state(servingsSection(), "Eaten")).toBeChecked();
      fireEvent.click(state(servingsSection(), "Planned"));
      await log();
      expect(cooks.created[0].attachStatus).toEqual([{ id: entry.id, status: "planned" }]);
      expect(days.entries[0].status).toBe("planned");
    });

    it("sends no state for today's planned entry when Planned is chosen, since it has it", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      fireEvent.click(state(servingsSection(), "Planned"));
      await log();
      expect(cooks.created[0].attachStatus).toEqual([]);
      expect(days.entries[0].status).toBe("planned");
    });
  });

  describe("the lines", () => {
    it("marks a changed line with what the recipe has, an added line as added, and no line that is as written", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      const marks = () =>
        items().map((li) => li.querySelector("[data-line-mark]")?.textContent?.replace(/\u00a0/g, " ") ?? null);
      expect(marks()).toEqual([null, null, null, null, null]);
      await changeAmount(/^Feta/, "100");
      await addIngredient("pinaatti", /^Pinaatti/, "80");
      expect(marks()).toEqual([null, null, "Changed. Recipe: 60 g", null, null, "Added"]);
      // Back to the recipe's amount, the mark goes: the batch no longer differs there.
      await changeAmount(/^Feta/, "60");
      expect(marks()).toEqual([null, null, null, null, null, "Added"]);
    });

    it("keeps a left-out line in its place with every line it showed, struck through, and the rows around it as they were", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      const shape = () =>
        items().map((li) => ({
          lines: [...li.querySelectorAll("span.block")].map((s) => s.textContent),
          // The row's own box: its least height and its padding.
          box: (li.firstElementChild as HTMLElement).className.split(/\s+/).filter((c) => /^(min-h|py)-/.test(c)),
          // The slot at the row's end, the arrow's or Put back's: one width in both states, so the name
          // wraps the same. The widths themselves are measured in the browser.
          slot: (li.firstElementChild!.lastElementChild as HTMLElement).className
            .split(/\s+/)
            .filter((c) => /^(w|shrink)-/.test(c)),
        }));
      const before = shape();
      expect(before.map((r) => r.slot)).toEqual(before.map(() => ["w-17", "shrink-0"]));
      await leaveOut(/^Oliiviöljy/);
      // Same rows, same order, the same lines in each, and the same box classes.
      expect(shape()).toEqual(before);
      const oil = items()[3];
      expect(oil.querySelector("[data-left-out]")).not.toBeNull();
      expect(oil.querySelector("span.block")!.className.split(/\s+/)).toEqual(
        expect.arrayContaining(["line-through", "text-ink-muted"]),
      );
      // It is no longer a button that opens the line: Put back is its one control, named for the line.
      expect(within(oil).getAllByRole("button")).toHaveLength(1);
      const putBack = within(oil).getByRole("button", { name: "Put back Oliiviöljy" });
      expect(putBack).toHaveTextContent("Put back");
      expect(oil).toHaveTextContent("Left out.");
      expect(putBack).toHaveFocus();
      // Its figures left with it.
      expect(figureCells()).not.toEqual(cellsOf(recipe.perServing, recipe.whole));

      fireEvent.click(putBack);
      expect(shape()).toEqual(before);
      expect(items()[3].querySelector("[data-left-out]")).toBeNull();
      expect(row(/^Oliiviöljy/)).toHaveFocus();
      expect(figureCells()).toEqual(cellsOf(recipe.perServing, recipe.whole));
    });

    it("keeps the line of a changed row when the row is left out, and says what the recipe has", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      await changeAmount(/^Feta/, "100");
      const count = () => items()[2].querySelectorAll("span.block").length;
      const lines = count();
      await leaveOut(/^Feta/);
      expect(count()).toBe(lines);
      expect(items()[2].querySelector("[data-line-mark]")).toHaveTextContent("Left out. Recipe: 60 g");
    });

    it("keeps its note and its written amount on a line left out", async () => {
      recipe = recipeOf("Munakas", 1, [
        { food: EGG, grams: 110 },
        { food: FETA, grams: 30, note: "crumbled", written: { amount: 2, unit: "tbsp" } },
      ]);
      recipes = serveRecipes(new FakeRecipes([recipe], ALL));
      serveDays([]);
      await renderSheet();
      const lines = () => [...items()[1].querySelectorAll("span.block")].map((s) => s.textContent);
      const before = lines();
      expect(before).toHaveLength(3);
      await leaveOut(/^Feta/);
      expect(lines()).toEqual(before);
    });

    it("removes a line the batch added, which the recipe never had, and offers no Leave out for it", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      await addIngredient("pinaatti", /^Pinaatti/, "80");
      fireEvent.click(row(/^Pinaatti/));
      expect(within(picker()).queryByRole("button", { name: "Leave out" })).toBeNull();
      const remove = await within(picker()).findByRole("button", { name: "Remove ingredient" });
      await viewHoldPassed(picker);
      fireEvent.click(remove);
      await act(async () => {});
      expect(rows()).toHaveLength(5);
      expect(sheet()).not.toHaveTextContent("Pinaatti");
    });

    it("leaves out a line not counted from its own sheet", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      fireEvent.click(row(/^Salt/));
      fireEvent.click(await screen.findByRole("button", { name: "Leave out" }));
      await act(async () => {});
      expect(items()[4].querySelector("[data-left-out]")).not.toBeNull();
      await log();
      expect(cooks.created[0].lines.map((l) => l.counted)).toEqual([true, true, true, true]);
    });

    it("refuses a batch with every line left out, under the lines, and sends nothing", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      for (const name of [/^Kananmuna/, /^Tomaattimurska/, /^Feta/, /^Oliiviöljy/]) await leaveOut(name);
      fireEvent.click(row(/^Salt/));
      fireEvent.click(await screen.findByRole("button", { name: "Leave out" }));
      await log();
      expect(createCook).not.toHaveBeenCalled();
      const add = within(sheet()).getByRole("button", { name: "Add ingredient" });
      expect(add).toHaveAccessibleDescription("Add at least one ingredient.");
      expect(add).toHaveFocus();
    });
  });

  describe("the figures", () => {
    it("follow the servings and the lines as they are typed, and equal the answer for the same lines", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      type("It gave", "3");
      const three = figureCells();
      // The recipe's line under them does not follow the batch.
      expect(sheet().querySelector("[data-recipe-serving]")).toHaveTextContent("Recipe: 365 kcal · 21.8 g protein");
      await log();
      const cook = cooks.get(cooks.created[0].id);
      expect(three).toEqual(cellsOf(cook.perServing, cook.whole));
      expect(cook.perServing.energyKcal).toBeLessThan(recipe.perServing.energyKcal);
    });

    it("show empty cells, and keep the recipe's line, while the servings are no whole number from 1 to 100", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      for (const typed of ["", "0", "2.5", "101"]) {
        type("It gave", typed);
        expect(figureCells()).toEqual([
          ["", ""],
          ["", ""],
          ["", ""],
          ["", ""],
        ]);
        expect(sheet().querySelector("[data-recipe-serving]")).not.toBeNull();
      }
      await log();
      expect(createCook).not.toHaveBeenCalled();
      expect(input("It gave")).toHaveAccessibleDescription("servings Enter a whole number of servings from 1 to 100.");
      expect(input("It gave")).toHaveFocus();
    });
  });

  describe("opened with no entry, as from the recipe's page", () => {
    it("is made today with a first row of new servings above Add servings: today, 1 serving, Eaten", async () => {
      serveDays([]);
      await renderSheet();
      expect(input("Made on")).toHaveValue(TODAY);
      expect(servingsSection().querySelector("[data-cook-opening]")).toBeNull();
      const first = within(servingsSection()).getByRole("group", { name: "New servings 1" });
      expect(within(first).getByLabelText("Date")).toHaveValue(TODAY);
      expect(within(first).getByLabelText("Servings", { selector: "input" })).toHaveValue("1");
      expect(state(first, "Eaten")).toBeChecked();
      const add = within(servingsSection()).getByRole("button", { name: "Add servings on another day" });
      expect(first.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await log();
      expect(cooks.created[0]).toMatchObject({
        attach: [],
        attachStatus: [],
        add: [{ id: expect.any(String), date: TODAY, status: "eaten", servings: 1 }],
      });
      expect(days.entries.map((e) => [e.date, e.status, e.servings, e.cook?.differs])).toEqual([
        [TODAY, "eaten", 1, false],
      ]);
      // On its own it closes itself, and reports the save.
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("waits, and says what for, until a row has servings", async () => {
      serveDays([]);
      await renderSheet();
      const first = within(servingsSection()).getByRole("group", { name: "New servings 1" });
      const field = within(first).getByLabelText("Servings", { selector: "input" });
      for (const typed of ["", "abc", "0"]) {
        fireEvent.change(field, { target: { value: typed } });
        expect(logButton()).toHaveAttribute("aria-disabled", "true");
        expect(servingsSection()).toHaveTextContent("Enter servings on at least one day.");
        await log();
        expect(createCook).not.toHaveBeenCalled();
      }
      fireEvent.change(field, { target: { value: "1.5" } });
      expect(logButton()).not.toHaveAttribute("aria-disabled");
      expect(servingsSection()).not.toHaveTextContent("Enter servings on at least one day.");
      await log();
      expect(cooks.created[0].add).toEqual([expect.objectContaining({ servings: 1.5 })]);
    });

    it("starts the first row from what it is given, as from the log sheet's block", async () => {
      serveDays([]);
      await renderSheet({ day: TOMORROW, start: { servings: "1.5", status: "planned" } });
      expect(input("Made on")).toHaveValue(TOMORROW);
      const first = within(servingsSection()).getByRole("group", { name: "New servings 1" });
      expect(within(first).getByLabelText("Servings", { selector: "input" })).toHaveValue("1.5");
      expect(state(first, "Planned")).toBeChecked();
    });
  });

  describe("servings on other days", () => {
    it("adds a row under the button on the next free day, Eaten up to today and Planned only after it", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      const add = within(servingsSection()).getByRole("button", { name: "Add servings on another day" });
      fireEvent.click(add);
      const first = within(servingsSection()).getByRole("group", { name: "New servings 1" });
      // Under the button, which stays where it was pressed.
      expect(add.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(first).getByLabelText("Date")).toHaveValue(TOMORROW);
      expect(state(first, "Planned")).toBeChecked();
      expect(state(first, "Eaten")).toHaveAttribute("aria-disabled", "true");
      expect(within(first).getByLabelText("Date")).toHaveAccessibleDescription("Future days hold planned entries.");
      // A press on Eaten there changes nothing.
      fireEvent.click(state(first, "Eaten"));
      expect(state(first, "Planned")).toBeChecked();
      // A day up to today can be eaten, and is to start with.
      fireEvent.change(within(first).getByLabelText("Date"), { target: { value: "2026-11-15" } });
      expect(state(first, "Eaten")).toBeChecked();
      fireEvent.change(within(first).getByLabelText("Servings", { selector: "input" }), { target: { value: "2" } });
      fireEvent.click(add);
      const second = within(servingsSection()).getByRole("group", { name: "New servings 2" });
      // Today holds the opening serving, and the first row moved away from tomorrow.
      expect(within(second).getByLabelText("Date")).toHaveValue(TOMORROW);
      fireEvent.change(within(second).getByLabelText("Date"), { target: { value: THURSDAY } });
      await log();
      expect(cooks.created[0]).toMatchObject({
        attach: [entry.id],
        add: [
          { date: "2026-11-15", status: "eaten", servings: 2 },
          { date: THURSDAY, status: "planned", servings: 1 },
        ],
      });
    });

    it("removes a row and puts focus on Add servings, and refuses a row with no servings under its field", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      const add = within(servingsSection()).getByRole("button", { name: "Add servings on another day" });
      fireEvent.click(add);
      fireEvent.click(add);
      const second = within(servingsSection()).getByRole("group", { name: "New servings 2" });
      const field = within(second).getByLabelText("Servings", { selector: "input" });
      fireEvent.change(field, { target: { value: "" } });
      await log();
      expect(createCook).not.toHaveBeenCalled();
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveFocus();
      fireEvent.click(within(second).getByRole("button", { name: "Remove these servings" }));
      expect(within(servingsSection()).queryByRole("group", { name: "New servings 2" })).toBeNull();
      expect(add).toHaveFocus();
      await log();
      expect(cooks.created[0].add).toHaveLength(1);
    });
  });

  describe("opened from a planned entry on a future day", () => {
    it("is made on that day, with the entry Planned only and the line that says why", async () => {
      const entry = serving(THURSDAY, 2);
      serveDays([entry]);
      await renderSheet({ entry });
      expect(input("Made on")).toHaveValue(THURSDAY);
      const opening = servingsSection().querySelector<HTMLElement>("[data-cook-opening]")!;
      expect(opening).toHaveTextContent("Thu 19 Nov · 2 servings");
      expect(state(opening, "Planned")).toBeChecked();
      expect(state(opening, "Eaten")).toHaveAttribute("aria-disabled", "true");
      expect(within(opening).getByRole("radiogroup")).toHaveAccessibleDescription("Future days hold planned entries.");
      fireEvent.click(state(opening, "Eaten"));
      await log();
      // Eaten on a future day is never sent.
      expect(cooks.created[0]).toMatchObject({ date: THURSDAY, attach: [entry.id], attachStatus: [], add: [] });
      expect(days.entries[0].status).toBe("planned");
    });
  });

  describe("refusals", () => {
    it("shows a refusal that names a line under that line, counted among the lines sent", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      await leaveOut(/^Tomaattimurska/);
      // The feta is the third row and the second line sent: the server's index is 1.
      cooks.refuseNext = refusedAt(404, "food_not_found", 1);
      await log();
      const feta = row(/^Feta/);
      expect(feta).toHaveAttribute("aria-invalid", "true");
      expect(feta).toHaveAccessibleDescription(/This food is no longer/);
      expect(feta).toHaveFocus();
      expect(row(/^Kananmuna/)).not.toHaveAttribute("aria-invalid");
      expect(sheet().querySelector("[data-sheet-footer]")).not.toHaveTextContent("This food");
      // The sheet stays, with what was typed, and the next press sends the same batch id.
      expect(onClose).not.toHaveBeenCalled();
      await log();
      expect(cooks.created.map((b) => b.id)).toEqual([cooks.created[0].id, cooks.created[0].id]);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("shows a serving that changed elsewhere in the footer, by the catalog's line for its code", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      // Another device made it a batch's serving meanwhile.
      days.entries[0].cook = { id: entry.id, date: TODAY, servings: 2, differs: false };
      await log();
      expect(sheet().querySelector("[data-sheet-footer]")).toHaveTextContent(
        "One of these servings can no longer be added to this batch. Close this and open it again.",
      );
      expect(sheet()).not.toHaveTextContent("Server text.");
      expect(onClose).not.toHaveBeenCalled();
    });

    it("shows a serving past what an entry holds under the figures, with focus on it", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      cooks.refuseNext = refusedAt(400, "recipe_serving_too_large");
      await log();
      const line = sheet().querySelector("[data-recipe-figures] p")!;
      expect(line).toHaveTextContent("One serving comes to more than 10000 kcal");
      expect(line).toHaveFocus();
      // It goes when the servings change, since one serving's size follows them.
      type("It gave", "4");
      expect(sheet().querySelector("[data-recipe-serving]")).not.toBeNull();
    });

    it("says it is offline in the footer on Log as made, and sends nothing", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      await renderSheet({ entry });
      await log();
      expect(createCook).not.toHaveBeenCalled();
      expect(sheet().querySelector("[data-sheet-footer]")).toHaveTextContent(
        "You are offline. Changes need a connection.",
      );
      onLine.mockRestore();
    });

    it("waits while the app asks the server for today, and sends nothing", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry }, { ...TODAY_STATE, holding: true });
      expect(logButton()).toHaveAttribute("aria-disabled", "true");
      await log();
      expect(createCook).not.toHaveBeenCalled();
    });
  });

  it("sends one request for two presses on Log as made", async () => {
    const entry = serving(TODAY);
    serveDays([entry]);
    await renderSheet({ entry });
    const held = deferred<CookWriteResult>();
    jest.mocked(createCook).mockImplementation((body) => {
      cooks.created.push(body);
      return held.promise;
    });
    const button = logButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => {});
    fireEvent.click(button);
    await act(async () => {});
    expect(createCook).toHaveBeenCalledTimes(1);
    expect(within(sheet()).getByRole("button", { name: "Logging…" })).toHaveAttribute("aria-disabled", "true");
    cooks.created.pop();
    await act(async () => held.resolve(cooks.create(jest.mocked(createCook).mock.calls[0][0])));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reads a recipe of other lines the same way: a line by a portion keeps its count, and a note is kept", async () => {
    recipe = recipeOf("Munakas", 1, [
      {
        food: EGG,
        grams: 110,
        portion: { id: "00000000-0000-4000-8000-0000000000aa", unit: "KPL_M", name: null, count: 2 },
      },
      { food: FETA, grams: 30, note: "crumbled", written: { amount: 2, unit: "tbsp" } },
    ]);
    recipes = serveRecipes(new FakeRecipes([recipe], ALL));
    recipes.portions.set("00000000-0000-4000-8000-0000000000aa", { foodId: EGG.id, grams: 55, unit: "KPL_M" });
    serveDays([]);
    await renderSheet();
    await log();
    expect(cooks.created[0].lines).toEqual([
      expect.objectContaining({ amount: { portionId: "00000000-0000-4000-8000-0000000000aa", count: 2 } }),
      expect.objectContaining({ amount: { grams: 30 }, note: "crumbled", written: { amount: 2, unit: "tbsp" } }),
    ]);
    // As written, the server says the batch does not differ.
    expect(cooks.get(cooks.created[0].id).diff).toEqual({ servings: null, changed: [], added: [], leftOut: [] });
  });

  describe("a press after an answer that never came", () => {
    /** The first request lands on the server and its answer is lost. */
    function loseFirstAnswer(): void {
      jest.mocked(createCook).mockImplementationOnce(async (body) => {
        cooks.create(body);
        throw refusedAt(500, "internal");
      });
    }
    const footer = () => sheet().querySelector("[data-sheet-footer]")!;
    const FIRST_SENT = "This batch was already logged as it was first sent. Press Cancel to see it on the day.";

    it("does not say a changed batch was logged: the sheet stays and says the first one was", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      loseFirstAnswer();
      await log();
      expect(onClose).not.toHaveBeenCalled();
      type("It gave", "4");
      await log();
      // The second request carried 4 and the server kept the 2 it took first.
      expect(cooks.created.map((b) => b.servings)).toEqual([2, 4]);
      expect(cooks.get(cooks.created[0].id).servings).toBe(2);
      expect(onClose).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
      expect(toastText()).toBeNull();
      expect(footer()).toHaveTextContent(FIRST_SENT);
      expect(input("It gave")).toHaveValue("4");
    });

    it.each([
      ["a line's amount", async () => changeAmount(/^Feta/, "100")],
      ["a line left out", async () => leaveOut(/^Oliiviöljy/)],
      ["the day it was made", async () => type("Made on", "2026-11-15")],
      [
        "a row of new servings",
        async () => {
          fireEvent.click(within(servingsSection()).getByRole("button", { name: "Add servings on another day" }));
        },
      ],
    ])("tells a resend that changed %s from the batch first sent", async (_what, edit) => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      loseFirstAnswer();
      await log();
      await edit();
      await log();
      expect(createCook).toHaveBeenCalledTimes(2);
      expect(onClose).not.toHaveBeenCalled();
      expect(toastText()).toBeNull();
      expect(footer()).toHaveTextContent(FIRST_SENT);
    });

    it("tells a resend that took a row of new servings away from the batch first sent", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      fireEvent.click(within(servingsSection()).getByRole("button", { name: "Add servings on another day" }));
      loseFirstAnswer();
      await log();
      fireEvent.click(within(servingsSection()).getByRole("button", { name: "Remove these servings" }));
      await log();
      expect(cooks.created.map((b) => b.add.length)).toEqual([1, 0]);
      expect(onClose).not.toHaveBeenCalled();
      expect(footer()).toHaveTextContent(FIRST_SENT);
    });

    it("tells a resend that put the opening entry's state back from the batch first sent", async () => {
      // The first press sent Planned for an eaten entry, and it was stored. Eaten again sends no mark at all.
      const entry = serving(TODAY, 1, { status: "eaten" });
      serveDays([entry]);
      await renderSheet({ entry });
      fireEvent.click(state(servingsSection(), "Planned"));
      loseFirstAnswer();
      await log();
      fireEvent.click(state(servingsSection(), "Eaten"));
      await log();
      expect(cooks.created.map((b) => b.attachStatus.length)).toEqual([1, 0]);
      expect(onClose).not.toHaveBeenCalled();
      expect(toastText()).toBeNull();
      expect(footer()).toHaveTextContent(FIRST_SENT);
    });

    it("closes as logged when the same batch is sent again", async () => {
      const entry = serving(TODAY);
      const tuesday = serving(TOMORROW);
      serveDays([entry, tuesday]);
      await renderSheet({ entry });
      await changeAmount(/^Feta/, "100");
      fireEvent.click(within(sheet()).getByRole("checkbox", { name: "Tue 17 Nov · 1 serving" }));
      fireEvent.click(within(servingsSection()).getByRole("button", { name: "Add servings on another day" }));
      loseFirstAnswer();
      await log();
      expect(onClose).not.toHaveBeenCalled();
      await log();
      expect(cooks.created).toHaveLength(2);
      expect(cooks.created[1]).toEqual(cooks.created[0]);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(footer()).not.toHaveTextContent(FIRST_SENT);
    });

    it("closes as logged for the same lines by a portion, with a note and an amount as written", async () => {
      recipe = recipeOf("Munakas", 1, [
        {
          food: EGG,
          grams: 110,
          portion: { id: "00000000-0000-4000-8000-0000000000aa", unit: "KPL_M", name: null, count: 2 },
        },
        { food: FETA, grams: 30, note: "crumbled", written: { amount: 2, unit: "tbsp" } },
        { name: "Salt" },
      ]);
      recipes = serveRecipes(new FakeRecipes([recipe], ALL));
      recipes.portions.set("00000000-0000-4000-8000-0000000000aa", { foodId: EGG.id, grams: 55, unit: "KPL_M" });
      serveDays([]);
      await renderSheet();
      loseFirstAnswer();
      await log();
      expect(onClose).not.toHaveBeenCalled();
      await log();
      expect(createCook).toHaveBeenCalledTimes(2);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("reads each day a serving is on again, a ticked one's too, since the batch may have landed", async () => {
      const entry = serving(TODAY);
      const thursday = serving(THURSDAY);
      serveDays([entry, thursday]);
      await renderSheet({ entry });
      fireEvent.click(within(sheet()).getByRole("checkbox", { name: "Thu 19 Nov · 1 serving" }));
      loseFirstAnswer();
      const before = jest.mocked(getDay).mock.calls.length;
      await log();
      await waitFor(() =>
        expect(
          jest
            .mocked(getDay)
            .mock.calls.slice(before)
            .map(([date]) => date)
            .sort(),
        ).toEqual([TODAY, THURSDAY]),
      );
    });
  });

  describe("ids another account holds", () => {
    const IDS = {
      cook_id_taken: (b: CookBody) => [b.id],
      ingredient_id_taken: (b: CookBody) => b.lines.map((l) => l.id),
      entry_id_taken: (b: CookBody) => b.add.map((a) => a.id),
    };
    const codes = Object.keys(IDS) as (keyof typeof IDS)[];

    it.each(codes)("sends new ids of that kind on the press after %s, and says to try again", async (code) => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      fireEvent.click(within(servingsSection()).getByRole("button", { name: "Add servings on another day" }));
      cooks.refuseNext = refusedAt(409, code);
      await log();
      expect(onClose).not.toHaveBeenCalled();
      expect(sheet().querySelector("[data-sheet-footer]")).toHaveTextContent("This could not be logged. Try again.");
      await log();
      const [first, second] = cooks.created;
      for (const kind of codes) {
        if (kind !== code) expect(IDS[kind](second)).toEqual(IDS[kind](first));
        else for (const id of IDS[kind](first)) expect(IDS[kind](second)).not.toContain(id);
      }
      expect(second.lines).toHaveLength(first.lines.length);
      expect(second.add).toHaveLength(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("the other planned servings while their days are read again", () => {
    it("keeps the list and its ticks, and holds Log as made until the new days have answered", async () => {
      const entry = serving(TODAY);
      const thursday = serving(THURSDAY);
      serveDays([entry, thursday]);
      await renderSheet({ entry });
      const tick = () => within(sheet()).getByRole("checkbox", { name: "Thu 19 Nov · 1 serving" });
      fireEvent.click(tick());
      // Made on moves a day: the window's last day, next Monday, is read and does not answer yet.
      const held = deferred<Day>();
      const answer = jest.mocked(getDay).getMockImplementation()!;
      jest.mocked(getDay).mockImplementation((date, req) => (date === NEXT_MONDAY ? held.promise : answer(date, req)));
      type("Made on", TOMORROW);
      await act(async () => {});
      expect(tick()).toBeChecked();
      expect(logButton()).toHaveAttribute("aria-disabled", "true");
      await log();
      expect(createCook).not.toHaveBeenCalled();
      await act(async () => held.resolve(days.day(NEXT_MONDAY)));
      // The answer reaches the sheet a task later.
      await act(() => new Promise((r) => setTimeout(r, 20)));
      expect(tick()).toBeChecked();
      expect(logButton()).not.toHaveAttribute("aria-disabled");
      await log();
      expect(cooks.created[0].attach).toEqual([entry.id, thursday.id]);
    });

    it("does not hold Log as made for days read again while nothing is ticked", async () => {
      const entry = serving(TODAY);
      serveDays([entry, serving(THURSDAY)]);
      await renderSheet({ entry });
      const held = deferred<Day>();
      const answer = jest.mocked(getDay).getMockImplementation()!;
      jest.mocked(getDay).mockImplementation((date, req) => (date === NEXT_MONDAY ? held.promise : answer(date, req)));
      type("Made on", TOMORROW);
      await act(async () => {});
      expect(logButton()).not.toHaveAttribute("aria-disabled");
      await log();
      expect(cooks.created[0].attach).toEqual([entry.id]);
    });
  });

  describe("with no entry, the servings a batch needs", () => {
    const first = () => within(servingsSection()).queryByRole("group", { name: "New servings 1" });
    const planned = () => within(sheet()).getByRole("checkbox", { name: /1 serving$/ });

    it("logs onto a ticked planned serving alone once the first row is removed", async () => {
      const today = serving(TODAY);
      serveDays([today]);
      await renderSheet();
      fireEvent.click(planned());
      fireEvent.click(within(first()!).getByRole("button", { name: "Remove these servings" }));
      expect(first()).toBeNull();
      expect(within(servingsSection()).getByRole("button", { name: "Add servings on another day" })).toHaveFocus();
      expect(logButton()).not.toHaveAttribute("aria-disabled");
      await log();
      expect(cooks.created[0]).toMatchObject({ attach: [today.id], add: [], attachStatus: [] });
      expect(days.entries.map((e) => [e.date, e.status, e.cook?.id])).toEqual([
        [TODAY, "planned", cooks.created[0].id],
      ]);
    });

    it("refuses a row with a date and no servings under that row, a serving ticked or not", async () => {
      serveDays([serving(TODAY)]);
      await renderSheet();
      fireEvent.click(planned());
      const field = within(first()!).getByLabelText("Servings", { selector: "input" });
      fireEvent.change(field, { target: { value: "" } });
      expect(logButton()).not.toHaveAttribute("aria-disabled");
      await log();
      expect(createCook).not.toHaveBeenCalled();
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveFocus();
    });

    it("waits with neither a row nor a tick, says what for, and logs a row added after", async () => {
      serveDays([serving(TODAY)]);
      await renderSheet();
      fireEvent.click(within(first()!).getByRole("button", { name: "Remove these servings" }));
      expect(logButton()).toHaveAttribute("aria-disabled", "true");
      expect(servingsSection()).toHaveTextContent("Add servings on a day, or tick a planned serving.");
      await log();
      expect(createCook).not.toHaveBeenCalled();
      fireEvent.click(within(servingsSection()).getByRole("button", { name: "Add servings on another day" }));
      expect(logButton()).not.toHaveAttribute("aria-disabled");
      await log();
      expect(cooks.created[0]).toMatchObject({ attach: [], add: [{ servings: 1 }] });
    });

    it("keeps a row added later under the button when the first row goes", async () => {
      serveDays([]);
      await renderSheet();
      const add = within(servingsSection()).getByRole("button", { name: "Add servings on another day" });
      fireEvent.click(add);
      fireEvent.click(within(first()!).getByRole("button", { name: "Remove these servings" }));
      const left = within(servingsSection()).getByRole("group", { name: "New servings 1" });
      expect(add.compareDocumentPosition(left) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe("the most servings one batch takes", () => {
    const add = () => within(servingsSection()).getByRole("button", { name: "Add servings on another day" });
    const LIMIT = "A batch takes 20 servings at most.";

    it("adds rows up to 20 servings with the opening one, then says why it adds no more", async () => {
      const entry = serving(TODAY);
      serveDays([entry]);
      await renderSheet({ entry });
      for (let i = 0; i < 18; i += 1) fireEvent.click(add());
      expect(add()).not.toHaveAttribute("aria-disabled");
      expect(servingsSection()).not.toHaveTextContent(LIMIT);
      fireEvent.click(add());
      expect(within(servingsSection()).getAllByRole("group", { name: /^New servings/ })).toHaveLength(19);
      expect(add()).toHaveAttribute("aria-disabled", "true");
      expect(servingsSection()).toHaveTextContent(LIMIT);
      fireEvent.click(add());
      expect(within(servingsSection()).getAllByRole("group", { name: /^New servings/ })).toHaveLength(19);
      await log();
      expect(cooks.created[0].attach.length + cooks.created[0].add.length).toBe(20);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("takes no tick past 20, and a tick taken off makes room for a row", async () => {
      const entry = serving(TODAY);
      const tuesday = serving(TOMORROW);
      const thursday = serving(THURSDAY);
      serveDays([entry, tuesday, thursday]);
      await renderSheet({ entry });
      const tue = () => within(sheet()).getByRole("checkbox", { name: "Tue 17 Nov · 1 serving" });
      const thu = () => within(sheet()).getByRole("checkbox", { name: "Thu 19 Nov · 1 serving" });
      fireEvent.click(tue());
      for (let i = 0; i < 18; i += 1) fireEvent.click(add());
      expect(servingsSection()).toHaveTextContent(LIMIT);
      fireEvent.click(thu());
      expect(thu()).not.toBeChecked();
      await log();
      expect(sheet()).not.toHaveTextContent("Something went wrong");
      expect(cooks.created[0].attach).toEqual([entry.id, tuesday.id]);
      expect(cooks.created[0].add).toHaveLength(18);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("the day a new row starts on", () => {
    const add = () => within(servingsSection()).getByRole("button", { name: "Add servings on another day" });
    const dateOf = (n: number) =>
      within(within(servingsSection()).getByRole("group", { name: `New servings ${n}` })).getByLabelText("Date");

    it("is the first day from Made on with no serving of the recipe on the sheet, listed, ticked or added", async () => {
      const entry = serving(TODAY);
      serveDays([entry, serving(TOMORROW), serving(THURSDAY)]);
      await renderSheet({ entry });
      fireEvent.click(within(sheet()).getByRole("checkbox", { name: "Thu 19 Nov · 1 serving" }));
      // Today holds the opening serving, Tuesday a listed one: Wednesday is the first free day.
      fireEvent.click(add());
      expect(dateOf(1)).toHaveValue("2026-11-18");
      // Wednesday is now a row's, Thursday a ticked one's: Friday.
      fireEvent.click(add());
      expect(dateOf(2)).toHaveValue("2026-11-20");
    });

    it("is the day the batch was made when nothing is on it", async () => {
      serveDays([]);
      await renderSheet();
      fireEvent.click(
        within(within(servingsSection()).getByRole("group", { name: "New servings 1" })).getByRole("button", {
          name: "Remove these servings",
        }),
      );
      expect(servingsSection()).toHaveTextContent("Add servings on at least one day.");
      fireEvent.click(add());
      expect(dateOf(1)).toHaveValue(TODAY);
    });
  });
});
