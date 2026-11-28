import { fakeAuth } from "@/__tests__/helpers/auth";
import { tap, tapClick } from "@/__tests__/helpers/tap";
import { renderDay } from "@/components/day/__tests__/harness";
import { detailOf } from "@/components/foods/__tests__/support";
import { useAuth } from "@/contexts/AuthContext";
import { ARM_DELAY_MS } from "@/hooks/usePressGuard";
import { getDay } from "@/lib/api/days";
import { addEntry } from "@/lib/api/entries";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { getRecipes } from "@/lib/api/recipes";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { favouritesOf, openLogSheet, ownFoods, recipeLogWorld, type RecipeWorld } from "./logHarness";

// The second tap of a double tap on a row of the log sheet's lists lands in
// the view the first tap opened, under the same finger. For the half second
// after a row opens a food, a saved meal or a recipe, the view's body and
// footer take no press: Log, Eaten or planned, About the data and Copy to my
// foods do nothing. The amount field focuses at once. After the half second
// every press works the first time. The real Day tab against the fake
// server of components/day/__tests__/harness.tsx, on a fake clock from the
// row's tap on.

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
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

jest.setTimeout(15_000);

let world: RecipeWorld;
beforeEach(() => {
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, addEntry, getRecents, getRecipes, getFavouriteFoods, getOwnFoods, getFood, searchFoods]) {
    jest.mocked(fn).mockReset();
  }
  world = recipeLogWorld();
  jest.mocked(getFavouriteFoods).mockResolvedValue(favouritesOf(world));
  jest.mocked(getOwnFoods).mockResolvedValue(ownFoods());
  jest.mocked(searchFoods).mockResolvedValue({ foods: [], near: [] });
  jest.mocked(getFood).mockImplementation(async (id) => {
    const food = [world.quark, world.banana, world.oats].find((f) => f.id === id);
    return food ? detailOf(food) : new Promise(() => {});
  });
});
afterEach(() => jest.useRealTimers());

const dialog = () => screen.getByRole("dialog");
const region = (name: string) => within(dialog()).getByRole("region", { name });
const logButton = () => within(dialog()).getByRole("button", { name: /^(Log|Add to plan|Logging…)$/ });
const amount = () => within(dialog()).getByRole("textbox", { name: /^(Amount|Meals|Servings)$/ }) as HTMLInputElement;
const state = (name: "Eaten" | "Planned") => within(dialog()).getByRole("radio", { name });
const inView = () => within(dialog()).queryByRole("button", { name: "Back" }) !== null;
/** Moves the fake clock, and lets the reads and renders it releases land. */
const wait = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

/**
 * Opens the log sheet, with its lists at rest, and puts the clock on fake
 * time. Then the first tap of a double tap on the row of `name` in `list`,
 * and 20 ms for the view's detail to land, as the cache would give it.
 */
async function firstTap(list: string, name: RegExp): Promise<void> {
  renderDay();
  await openLogSheet();
  await waitFor(() => expect(dialog().querySelector('[data-lists-guard]:not([data-lists-guard="armed"])')).toBeNull());
  jest.useFakeTimers();
  tap(within(region(list)).getByRole("button", { name }));
  expect(inView()).toBe(true);
  await wait(20);
}

describe("The log sheet's views, in the half second after a row opens them", () => {
  it("logs nothing on a second tap on Log for a food with a last amount, and keeps the view open", async () => {
    await firstTap("Recent", /^Quark/);
    expect(amount().value).toBe("250");
    expect(tap(logButton()).defaultPrevented).toBe(true);
    await wait(0);
    expect(addEntry).not.toHaveBeenCalled();
    expect(inView()).toBe(true);
    // After the half second, the first press on Log logs.
    await wait(ARM_DELAY_MS);
    tap(logButton());
    await wait(0);
    expect(addEntry).toHaveBeenCalledTimes(1);
  });

  it("leaves Eaten chosen on a second tap on Planned, and takes the tap after the half second", async () => {
    await firstTap("Recent", /^Quark/);
    expect(state("Eaten")).toBeChecked();
    tap(state("Planned"));
    expect(state("Eaten")).toBeChecked();
    expect(state("Planned")).not.toBeChecked();
    await wait(ARM_DELAY_MS);
    tap(state("Planned"));
    expect(state("Planned")).toBeChecked();
  });

  it("goes nowhere on a second tap on About the data, which leaves for Settings after the half second", async () => {
    await firstTap("Recent", /^Quark/);
    const about = within(dialog()).getByRole("link", { name: "About the data" });
    expect(tap(about).defaultPrevented).toBe(true);
    await wait(0);
    // The link closes the sheet as it is followed: still open, so it was not.
    expect(inView()).toBe(true);
    await wait(ARM_DELAY_MS);
    tap(about);
    await wait(0);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("opens no form on a second tap on Copy to my foods, and opens it after the half second", async () => {
    await firstTap("Recent", /^Quark/);
    const copy = within(dialog()).getByRole("button", { name: "Copy to my foods" });
    // The detail lands well inside the half second, as from the cache: the button is ready.
    for (let ms = 20; ms < 200 && copy.hasAttribute("aria-disabled"); ms += 10) await wait(10);
    expect(copy).not.toHaveAttribute("aria-disabled");
    tap(copy);
    await wait(0);
    expect(screen.queryByRole("dialog", { name: "New food" })).toBeNull();
    await wait(ARM_DELAY_MS);
    tap(copy);
    await wait(0);
    expect(screen.getByRole("dialog", { name: "New food" })).toBeInTheDocument();
  });

  it("logs nothing on a second tap on Log for a saved meal or a recipe", async () => {
    await firstTap("Recent", /^Shake/);
    expect(amount().value).toBe("1");
    tap(logButton());
    await wait(0);
    expect(addEntry).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Back" }));
    await wait(ARM_DELAY_MS);
    tap(within(region("Recent")).getByRole("button", { name: /^Shakshuka/ }));
    expect(amount().value).toBe("1.5");
    tap(logButton());
    await wait(0);
    expect(addEntry).not.toHaveBeenCalled();
    await wait(ARM_DELAY_MS);
    tap(logButton());
    await wait(0);
    expect(addEntry).toHaveBeenCalledTimes(1);
  });

  it("drops a press that starts inside the half second and ends after it, and takes a tap after it", async () => {
    await firstTap("Recent", /^Quark/);
    await wait(400 - 20);
    fireEvent.pointerDown(logButton());
    await wait(200);
    fireEvent.pointerUp(logButton());
    expect(tapClick(logButton()).defaultPrevented).toBe(true);
    await wait(0);
    expect(addEntry).not.toHaveBeenCalled();
    // A new tap, at 600 ms.
    tap(logButton());
    await wait(0);
    expect(addEntry).toHaveBeenCalledTimes(1);
  });

  it("logs once on Enter on the focused Log after the half second, after a tap on it inside", async () => {
    await firstTap("Recent", /^Quark/);
    tap(logButton());
    await wait(ARM_DELAY_MS);
    logButton().focus();
    // Enter on a focused button clicks it with no pointer of its own: `detail` 0.
    fireEvent.click(logButton());
    await wait(0);
    expect(addEntry).toHaveBeenCalledTimes(1);
  });

  it("focuses the amount on a tap inside the half second, and takes what is typed", async () => {
    await firstTap("Recent", /^Banana/);
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    await user.pointer({ keys: "[TouchA]", target: amount() });
    expect(amount()).toHaveFocus();
    await user.clear(amount());
    await user.keyboard("3");
    expect(amount().value).toBe("3");
  });
});
