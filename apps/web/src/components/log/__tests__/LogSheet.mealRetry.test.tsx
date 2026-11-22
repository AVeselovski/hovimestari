import { fakeAuth } from "@/__tests__/helpers/auth";
import { renderDay, rowNames } from "@/components/day/__tests__/harness";
import { uuid } from "@/components/foods/__tests__/support";
import { useAuth } from "@/contexts/AuthContext";
import { getDay } from "@/lib/api/days";
import { addEntry, removeEntry } from "@/lib/api/entries";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import {
  createSavedMeal,
  deleteSavedMeal,
  getSavedMeals,
  saveAndLog,
  setSavedMealArchived,
  updateSavedMeal,
} from "@/lib/api/savedMeals";
import type { SavedMeal } from "@hovimestari/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { favouritesOf, logWorld, openLogSheet, ownFoods, statusLine } from "./logHarness";

// A new saved meal pressed again after a send that could not confirm, with
// the form changed in between (components/log/mealSends.ts). The real Day
// tab against the fake server of components/day/__tests__/harness.tsx, which
// answers a repeated id with what it saved the first time, as
// apps/backend/src/services/writes/savedMeals.ts does: a create replays the
// meal and ignores the body, an entry keeps the figures it was added with,
// and a PUT of a meal that never landed answers 404 saved_meal_not_found.

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn() }));
jest.mock("@/lib/api/recipes", () => ({ getRecipes: jest.fn().mockResolvedValue({ recipes: [] }) }));
jest.mock("@/lib/api/savedMeals", () => ({
  getSavedMeals: jest.fn().mockResolvedValue({ meals: [] }),
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

const MOCKS = [
  getDay,
  addEntry,
  removeEntry,
  getRecents,
  getFavouriteFoods,
  getOwnFoods,
  getFood,
  searchFoods,
  getSavedMeals,
  createSavedMeal,
  saveAndLog,
  updateSavedMeal,
  setSavedMealArchived,
  deleteSavedMeal,
];

function savedMeal(name: string, source: string | null, overrides: Partial<SavedMeal> = {}): SavedMeal {
  return {
    id: uuid(),
    name,
    source,
    figures: { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 },
    archived: false,
    lastCount: null,
    ...overrides,
  };
}

let world: ReturnType<typeof logWorld>;
let bowl: SavedMeal;
let soup: SavedMeal;
beforeEach(() => {
  searchParams = new URLSearchParams();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of MOCKS) jest.mocked(fn).mockReset();
  world = logWorld();
  // Three active meals from two sources (and the shake from Home): Chicken bowl, Salmon soup, Shake.
  bowl = savedMeal("Chicken bowl", "Wolt", { lastCount: 2 });
  soup = savedMeal("Salmon soup", "Foodora");
  for (const meal of [bowl, soup]) world.server.meals.set(meal.id, meal);
  jest.mocked(getFavouriteFoods).mockResolvedValue(favouritesOf(world));
  jest.mocked(getOwnFoods).mockResolvedValue(ownFoods());
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
  jest.mocked(searchFoods).mockResolvedValue({ foods: [] });
});

const dialog = (name: string | RegExp = "Log food") => screen.getByRole("dialog", { name });
const sheet = () =>
  screen
    .getAllByRole("dialog")
    .find((d) => d.getAttribute("aria-label") === "Log food" || d.querySelector("[data-status-line]"))!;
const region = (name: string) => within(sheet()).getByRole("region", { name });
const rowsOf = (name: string) =>
  within(region(name))
    .queryAllByRole("listitem")
    .map((li) => li.querySelector("button")!.textContent ?? "");
const field = (label: string) =>
  within(screen.getAllByRole("dialog").at(-1)!).getByLabelText(label, { selector: "input" }) as HTMLInputElement;
const mealCalls = (archived: boolean) => jest.mocked(getSavedMeals).mock.calls.filter(([a]) => a === archived).length;

const timeout = (): Error => Object.assign(new Error("timeout"), { isAxiosError: true, code: "ECONNABORTED" });

/** Opens New saved meal from the log sheet and fills it: Bowl, 700 kcal, 45, 70 and 25 g. */
async function newMeal(): Promise<HTMLElement> {
  renderDay();
  await openLogSheet();
  fireEvent.click(within(sheet()).getByRole("button", { name: "New saved meal" }));
  const stacked = await screen.findByRole("dialog", { name: "New saved meal" });
  for (const [label, value] of [
    ["Name", "Bowl"],
    ["Calories", "700"],
    ["Protein", "45"],
    ["Carbohydrates", "70"],
    ["Fat", "25"],
  ]) {
    fireEvent.change(field(label), { target: { value } });
  }
  return stacked;
}

const press = (name: string) => fireEvent.click(within(dialog("New saved meal")).getByRole("button", { name }));
const notConfirmed = () =>
  within(dialog("New saved meal")).findByText("Could not confirm. Check your connection and try again.");
const bowls = () => [...world.server.meals.values()].filter((m) => m.name.startsWith("Bowl"));
const bowlEntries = () => world.server.entries.filter((e) => e.kind === "saved_meal");

/** The first create lands, and its answer is lost. */
function createLandsUnanswered(): void {
  jest.mocked(createSavedMeal).mockImplementationOnce(async (body) => {
    world.server.createMeal(body);
    throw timeout();
  });
}

/** The first Save and log lands, meal and entry, and its answer is lost. */
function saveAndLogLandsUnanswered(): void {
  jest.mocked(saveAndLog).mockImplementationOnce(async (body) => {
    world.server.saveAndLog(body);
    throw timeout();
  });
}

describe("A new saved meal pressed again after a send that could not confirm", () => {
  it("Save meal, then Calories changed, then Save meal: the one meal holds the new value", async () => {
    createLandsUnanswered();
    await newMeal();
    press("Save meal");
    await notConfirmed();
    fireEvent.change(field("Calories"), { target: { value: "750" } });
    press("Save meal");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New saved meal" })).toBeNull());
    expect(updateSavedMeal).toHaveBeenCalledTimes(1);
    expect(bowls()).toHaveLength(1);
    expect(bowls()[0].figures.energyKcal).toBe(750);
    expect(statusLine()).toHaveTextContent("Saved Bowl.");
    expect(bowlEntries()).toEqual([]);
  });

  it("Save meal, then Calories changed, then Save and log: one meal and one entry, both with the new value", async () => {
    createLandsUnanswered();
    await newMeal();
    press("Save meal");
    await notConfirmed();
    fireEvent.change(field("Calories"), { target: { value: "750" } });
    press("Save and log");
    await screen.findByText("Saved Bowl and logged 1 meal.");
    expect(bowls()).toHaveLength(1);
    expect(bowls()[0].figures.energyKcal).toBe(750);
    expect(bowlEntries()).toHaveLength(1);
    expect(bowlEntries()[0].basis.energyKcal).toBe(750);
    expect(rowNames()).toEqual(["Oats", "Bowl"]);
  });

  it("Save meal that never landed, then Calories changed, then Save and log: the PUT finds nothing and the save goes on as before", async () => {
    jest.mocked(createSavedMeal).mockRejectedValueOnce(timeout());
    await newMeal();
    press("Save meal");
    await notConfirmed();
    fireEvent.change(field("Calories"), { target: { value: "750" } });
    press("Save and log");
    await screen.findByText("Saved Bowl and logged 1 meal.");
    expect(updateSavedMeal).toHaveBeenCalledTimes(1);
    await expect(jest.mocked(updateSavedMeal).mock.results[0].value).rejects.toMatchObject({
      response: { status: 404, data: { code: "saved_meal_not_found" } },
    });
    expect(removeEntry).not.toHaveBeenCalled();
    expect(bowls().map((m) => m.figures.energyKcal)).toEqual([750]);
    expect(bowlEntries().map((e) => e.basis.energyKcal)).toEqual([750]);
  });

  it("Save and log that landed, then Calories changed, then Save and log: the old entry goes, one entry with the new value, and the toast says logged", async () => {
    saveAndLogLandsUnanswered();
    await newMeal();
    press("Save and log");
    await notConfirmed();
    const first = jest.mocked(saveAndLog).mock.calls[0][0];
    expect(bowlEntries().map((e) => e.basis.energyKcal)).toEqual([700]);
    fireEvent.change(field("Calories"), { target: { value: "750" } });
    press("Save and log");
    await screen.findByText("Saved Bowl and logged 1 meal.");
    expect(removeEntry).toHaveBeenCalledWith(first.entry.id);
    const second = jest.mocked(saveAndLog).mock.calls[1][0];
    expect(second.meal.id).toBe(first.meal.id);
    expect(second.entry.id).not.toBe(first.entry.id);
    expect(bowls().map((m) => m.figures.energyKcal)).toEqual([750]);
    expect(bowlEntries().map((e) => [e.id, e.basis.energyKcal])).toEqual([[second.entry.id, 750]]);
    expect(rowNames()).toEqual(["Oats", "Bowl"]);
    // Its Undo removes the entry this press added.
    fireEvent.click(screen.getByRole("button", { name: "Remove from day" }));
    await waitFor(() => expect(rowNames()).toEqual(["Oats"]));
  });

  it("Save and log that landed, then Planned chosen, then Save and add to plan: the eaten entry goes and a planned one is added", async () => {
    saveAndLogLandsUnanswered();
    await newMeal();
    press("Save and log");
    await notConfirmed();
    fireEvent.click(within(dialog("New saved meal")).getByRole("radio", { name: "Planned" }));
    press("Save and add to plan");
    await screen.findByText("Saved Bowl and added it to the plan.");
    expect(updateSavedMeal).not.toHaveBeenCalled();
    expect(bowlEntries().map((e) => e.status)).toEqual(["planned"]);
  });

  it("Save and log that never reached the server, then Planned chosen, then Save and add to plan: the removal finds nothing and the press keeps the entry's id", async () => {
    jest.mocked(saveAndLog).mockRejectedValueOnce(timeout());
    await newMeal();
    press("Save and log");
    await notConfirmed();
    const first = jest.mocked(saveAndLog).mock.calls[0][0];
    fireEvent.click(within(dialog("New saved meal")).getByRole("radio", { name: "Planned" }));
    press("Save and add to plan");
    await screen.findByText("Saved Bowl and added it to the plan.");
    expect(removeEntry).toHaveBeenCalledWith(first.entry.id);
    await expect(jest.mocked(removeEntry).mock.results[0].value).rejects.toMatchObject({
      response: { status: 404 },
    });
    const second = jest.mocked(saveAndLog).mock.calls[1][0];
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.entry.status).toBe("planned");
    expect(bowlEntries().map((e) => [e.id, e.status])).toEqual([[first.entry.id, "planned"]]);
  });

  it("Save and log held in transit, then Planned chosen and pressed again, then the first request arrives: it replays, one entry", async () => {
    jest.mocked(saveAndLog).mockRejectedValueOnce(timeout());
    await newMeal();
    press("Save and log");
    await notConfirmed();
    const first = jest.mocked(saveAndLog).mock.calls[0][0];
    fireEvent.click(within(dialog("New saved meal")).getByRole("radio", { name: "Planned" }));
    press("Save and add to plan");
    await screen.findByText("Saved Bowl and added it to the plan.");
    // The first request reaches the server only now, after the second.
    expect(world.server.saveAndLog(first).outcome).toBe("replayed");
    expect(bowls()).toHaveLength(1);
    expect(bowlEntries().map((e) => e.status)).toEqual(["planned"]);
  });

  it("Save and log that landed, then Save meal: the entry goes, the meal stays saved, and nothing is logged", async () => {
    saveAndLogLandsUnanswered();
    await newMeal();
    press("Save and log");
    await notConfirmed();
    press("Save meal");
    await waitFor(() => expect(removeEntry).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New saved meal" })).toBeNull());
    expect(bowls()).toHaveLength(1);
    expect(bowlEntries()).toEqual([]);
    expect(statusLine()).toHaveTextContent("Saved Bowl.");
    // The Day tab under the open log sheet, read by its rows' ids: the entry has left it.
    const rowIds = () =>
      [...document.querySelectorAll<HTMLElement>("li[data-entry-id]")].map((li) => li.dataset.entryId);
    await waitFor(() => expect(rowIds()).toEqual(world.server.entries.map((e) => e.id)));
    expect(rowIds()).toHaveLength(1);
  });

  it("Save and log that landed, then only the name changed: the meal is renamed and its entry kept, which the toast says", async () => {
    saveAndLogLandsUnanswered();
    await newMeal();
    press("Save and log");
    await notConfirmed();
    fireEvent.change(field("Name"), { target: { value: "Bowl deluxe" } });
    press("Save and log");
    await screen.findByText("Already logged Bowl deluxe.");
    expect(updateSavedMeal).toHaveBeenCalledTimes(1);
    expect(removeEntry).not.toHaveBeenCalled();
    expect(bowls().map((m) => m.name)).toEqual(["Bowl deluxe"]);
    expect(bowlEntries()).toHaveLength(1);
  });

  it("Save and log pressed again with nothing changed sends the same request, and the replay says so", async () => {
    saveAndLogLandsUnanswered();
    await newMeal();
    press("Save and log");
    await notConfirmed();
    press("Save and log");
    await screen.findByText("Already logged Bowl.");
    expect(updateSavedMeal).not.toHaveBeenCalled();
    expect(removeEntry).not.toHaveBeenCalled();
    expect(bowlEntries()).toHaveLength(1);
  });

  it("reads the saved meals again after a save that could not confirm, so a landed meal shows once the sheet is cancelled", async () => {
    createLandsUnanswered();
    await newMeal();
    const reads = mealCalls(false);
    press("Save meal");
    await notConfirmed();
    await waitFor(() => expect(mealCalls(false)).toBeGreaterThan(reads));
    fireEvent.click(within(dialog("New saved meal")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(rowsOf("Saved meals").some((t) => t.startsWith("Bowl"))).toBe(true));
  });
});

describe("The log sheet's one status line", () => {
  it("says the latest thing: a meal saved after a '+' that failed says Saved", async () => {
    jest.mocked(addEntry).mockRejectedValueOnce(timeout());
    renderDay();
    await openLogSheet();
    fireEvent.click(within(region("Recent")).getByRole("button", { name: /^Log Quark again/ }));
    await waitFor(() => expect(statusLine()).toHaveTextContent("Could not confirm. Try again."));
    fireEvent.click(within(sheet()).getByRole("button", { name: "New saved meal" }));
    await screen.findByRole("dialog", { name: "New saved meal" });
    for (const [label, value] of [
      ["Name", "Bowl"],
      ["Calories", "700"],
      ["Protein", "45"],
      ["Carbohydrates", "70"],
      ["Fat", "25"],
    ]) {
      fireEvent.change(field(label), { target: { value } });
    }
    press("Save meal");
    await waitFor(() => expect(statusLine()).toHaveTextContent("Saved Bowl."));
  });
});
