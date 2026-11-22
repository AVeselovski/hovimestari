import { fakeAuth } from "@/__tests__/helpers/auth";
import { queryWrapper } from "@/__tests__/helpers/queryClient";
import { FakeDays, recordToasts, seededClient, serve } from "@/components/day/__tests__/harness";
import { TODAY } from "@/components/day/__tests__/support";
import { TodayProvider } from "@/components/targets/TodayProvider";
import { ToastProvider, ToastRegion } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import type { AddRequest } from "@/hooks/entryActions";
import { TodayContext } from "@/hooks/useToday";
import { addEntry } from "@/lib/api/entries";
import { formatKcal } from "@/lib/foodFormat";
import { formatDayShort } from "@/lib/localDate";
import { addDays, entryFigures, type Recipe } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RecipeLogSheet } from "../RecipeLogSheet";
import { RecipePage } from "../RecipePage";
import { shakshuka } from "./recipeFixtures";
import { FakeRecipes, serveRecipes } from "./recipeServer";
import { pinClock } from "./recipesHarness";

// A recipe put on a day from its page: Planned only on a future date, one
// serving's figures equal to the page's per serving, the entry the add
// sends, and the toast that names the day.

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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
let shak: Recipe;
let days: FakeDays;

beforeEach(() => {
  clock = pinClock();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  shak = shakshuka();
  days = new FakeDays([]);
  days.recipes.set(shak.id, { name: shak.name, basis: shak.basis, archived: false });
  serve(days);
  serveRecipes(new FakeRecipes([shak]));
});
afterEach(() => clock.mockRestore());

const sheet = () => screen.getByRole("dialog", { name: "Log Shakshuka" });
const cells = (root: Element) =>
  [...root.querySelectorAll("[data-log-figures] dd")].map((dd) => dd.textContent!.replace(/\s+/g, ""));

function renderAlone(add = jest.fn(), onClose = jest.fn()) {
  render(
    <TodayContext.Provider
      value={{ today: TODAY, holding: false, confirm: "fresh", unconfirmed: false, retry: () => {} }}
    >
      <RecipeLogSheet open returnFocusTo={null} onClose={onClose} recipe={shak} actions={{ add, holding: false }} />
    </TodayContext.Provider>,
  );
  return add;
}

describe("RecipeLogSheet", () => {
  it("logs one serving eaten today to start with, its figures one serving's", () => {
    renderAlone();
    expect((within(sheet()).getByLabelText("Servings") as HTMLInputElement).value).toBe("1");
    expect((within(sheet()).getByLabelText("Date") as HTMLInputElement).value).toBe(TODAY);
    expect(within(sheet()).getByRole("radio", { name: "Eaten" })).toHaveAttribute("aria-checked", "true");
    // The page's "Per serving": 365 kcal and 21.8 g.
    expect(cells(sheet())).toEqual(["365kcal", "21.8g", "9.9g", "25.7g"]);
    expect(within(sheet()).getByRole("button", { name: "Log" })).toBeInTheDocument();
  });

  it("opens on the servings last eaten, and a sheet left as it opened is not changed", () => {
    shak = { ...shak, lastServings: 1.5 };
    const onClose = jest.fn();
    renderAlone(jest.fn(), onClose);
    expect((within(sheet()).getByLabelText("Servings") as HTMLInputElement).value).toBe("1.5");
    const expected = entryFigures(shak.basis, { per: "serving", count: 1.5 });
    expect(cells(sheet())[0]).toBe(`${formatKcal(expected.energyKcal)}kcal`);
    // 1.5 is where it started, so nothing counts as typed yet: Escape closes it.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers Planned only on a future date, and sends a planned recipe entry", async () => {
    const add = renderAlone(jest.fn().mockResolvedValue({ outcome: "created", announce: jest.fn() }));
    const saturday = addDays(TODAY, 5);
    fireEvent.change(within(sheet()).getByLabelText("Date"), { target: { value: saturday } });
    expect(within(sheet()).getByRole("radio", { name: "Eaten" })).toHaveAttribute("aria-disabled", "true");
    expect(within(sheet()).getByRole("radio", { name: "Planned" })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(within(sheet()).getByLabelText("Servings"), { target: { value: "1,5" } });
    expect(cells(sheet())[0]).toBe("548kcal");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Add to plan" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    const request: AddRequest = add.mock.calls[0][0];
    expect(request.body).toEqual({
      kind: "recipe",
      id: expect.any(String),
      date: saturday,
      status: "planned",
      recipeId: shak.id,
      servings: 1.5,
    });
    expect(request.namesDay).toBe(true);
  });

  it("puts the serving on the day from the recipe's page, with a toast that names the day", async () => {
    const shown = recordToasts();
    render(
      <TodayProvider>
        <ToastProvider>
          <RecipePage id={shak.id} />
          <ToastRegion />
        </ToastProvider>
      </TodayProvider>,
      { wrapper: queryWrapper(seededClient()) },
    );
    const log = await screen.findByRole("button", { name: "Log" });
    await waitFor(() => expect(screen.getByText("Serves 2")).toBeInTheDocument());
    fireEvent.click(log);
    const saturday = addDays(TODAY, 5);
    fireEvent.change(within(sheet()).getByLabelText("Date"), { target: { value: saturday } });
    // The add waits while the app asks the server for today, and the button says so.
    const add = within(sheet()).getByRole("button", { name: "Add to plan" });
    await waitFor(() => expect(add).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(add);
    await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(shown.shown).toContain(
        `Added Shakshuka to the plan for ${formatDayShort(saturday, undefined, TODAY)}.Undo`,
      ),
    );
    shown.stop();
    expect(days.entries.map((e) => [e.date, e.kind, e.servings, e.figures.energyKcal])).toEqual([
      [saturday, "recipe", 1, 365],
    ]);
    await act(async () => {});
  });
});
