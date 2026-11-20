import { fakeAuth } from "@/__tests__/helpers/auth";
import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import { useAuth } from "@/contexts/AuthContext";
import { getDay, getDaySummaries } from "@/lib/api/days";
import { copyEntries, patchEntry, removeEntry, restoreEntry, setEntriesStatus } from "@/lib/api/entries";
import { getFood } from "@/lib/api/foods";
import { getTargets } from "@/lib/api/targets";
import { formatGrams, formatKcal } from "@/lib/foodFormat";
import type { Entry } from "@hovimestari/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { FakeDays, liveToast, renderDay, rowNames, rowOf, serve } from "./harness";
import { TODAY, dayOf, estimateEntry, foodEntry, mealEntry, recipeEntry } from "./support";

// ---------------------------------------------------------------------------
// A recipe entry on the Day tab, as a connected assistant puts one on a day:
// its row among the other kinds, and every action an entry has, each through
// the same entry routes as the other kinds (the fake in fakeDays.ts). After
// each action the day's two readings are the server's own for what it holds.
// The app's today is Monday 16 November 2026, the clock runs from noon that
// day, and figures format as a British phone.
// ---------------------------------------------------------------------------

jest.mock("@/contexts/AuthContext");
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
jest.mock("@/lib/api/entries", () => ({
  addEntry: jest.fn(),
  setEntriesStatus: jest.fn(),
  patchEntry: jest.fn(),
  removeEntry: jest.fn(),
  restoreEntry: jest.fn(),
  copyEntries: jest.fn(),
  removeEntries: jest.fn(),
}));
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/foods", () => ({
  getFood: jest.fn(),
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
}));
let searchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/",
}));

const TOMORROW = "2026-11-17";
/** One serving of shakshuka, as the recipe computes it. */
const SHAKSHUKA = { energyKcal: 243.3, proteinG: 14.5, carbsG: 12.1, fatG: 15.2 };
const LUNCH = { energyKcal: 640, proteinG: 38, carbsG: 70, fatG: 22 };

beforeEach(() => {
  clockFrom(`${TODAY}T12:00:00Z`);
  setTestLocale("en-GB");
  searchParams = new URLSearchParams();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, getDaySummaries, getTargets, getFood, setEntriesStatus, patchEntry]) {
    jest.mocked(fn).mockReset();
  }
  for (const fn of [removeEntry, restoreEntry, copyEntries]) jest.mocked(fn).mockReset();
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
});
afterEach(() => jest.restoreAllMocks());

/** Today's day: quark eaten, a delivered lunch eaten, and shakshuka planned at 1.5 servings. */
function today(shakshuka: Partial<Entry> = {}): Entry[] {
  return dayOf([
    foodEntry("Quark", 250),
    mealEntry("Lunch", 1, LUNCH),
    recipeEntry("Shakshuka", 1.5, SHAKSHUKA, { status: "planned", ...shakshuka }),
  ]).entries;
}

const shakshukaOf = (server: FakeDays) => server.entries.find((e) => e.name === "Shakshuka" && e.date === TODAY);
const mainButton = (name: string) => within(rowOf(name)).getByRole("button", { name: new RegExp(`^${name}`) });

/** The amount line and the two figures a row shows. */
function rowShows(name: string): string[] {
  const button = mainButton(name);
  const meta = button.querySelector(".line-clamp-2")!.nextElementSibling!.textContent;
  // What each figure line shows: the words read aloud only are left out.
  const figures = [...button.querySelectorAll(".font-mono > span")].map((line) => {
    const copy = line.cloneNode(true) as Element;
    for (const spoken of copy.querySelectorAll(".sr-only")) spoken.remove();
    return copy.textContent;
  });
  return [meta ?? "", ...figures];
}

/** The energy and protein figures of each reading on screen, eaten first. */
function readingsShown(): string[] {
  return ["energy", "protein"].flatMap((macro) =>
    [...document.querySelectorAll(`[data-summary-macro="${macro}"] [data-reading] dd > span:first-child`)].map(
      (s) => s.textContent ?? "",
    ),
  );
}

/** The same figures from the server's own summary of the day it holds now. */
function readingsHeld(server: FakeDays, date = TODAY): string[] {
  const day = server.day(date);
  return [
    `${formatKcal(day.eaten.figures.energyKcal)} kcal`,
    `${formatKcal(day.withPlan.figures.energyKcal)} kcal`,
    `${formatGrams(day.eaten.figures.proteinG)} g`,
    `${formatGrams(day.withPlan.figures.proteinG)} g`,
  ];
}

async function openSheet(name: string): Promise<HTMLElement> {
  fireEvent.click(mainButton(name));
  return screen.findByRole("dialog", { name });
}

async function start(entries: Entry[] = today()): Promise<FakeDays> {
  const server = new FakeDays(entries);
  serve(server);
  renderDay();
  await screen.findByText("Shakshuka");
  await waitFor(() => expect(readingsShown()).toEqual(readingsHeld(server)));
  return server;
}

const pressUndo = () => fireEvent.click(within(liveToast()).getByRole("button", { name: "Undo" }), { detail: 1 });

describe("DayTab, a recipe entry", () => {
  it("shows its row among a food, a saved meal and an estimate: the servings, then its own figures", async () => {
    const entries = dayOf([
      foodEntry("Quark", 250),
      mealEntry("Lunch", 1, LUNCH),
      recipeEntry("Shakshuka", 1.5, SHAKSHUKA, { status: "planned" }),
      recipeEntry("Shakshuka for two", 1, SHAKSHUKA, { status: "planned" }),
      estimateEntry("Cafe bun", { energyKcal: 300, proteinG: 6, carbsG: 40, fatG: 12 }),
    ]).entries;
    serve(new FakeDays(entries));
    renderDay();
    await screen.findByText("Shakshuka");
    expect(rowNames()).toEqual(["Quark", "Lunch", "Shakshuka", "Shakshuka for two", "Cafe bun"]);
    const shakshuka = entries[2];
    expect(rowShows("Shakshuka")).toEqual([
      "1.5 servings",
      `${formatKcal(shakshuka.figures.energyKcal)} kcal`,
      `${formatGrams(shakshuka.figures.proteinG)} g`,
    ]);
    expect(rowShows("Shakshuka for two")[0]).toBe("1 serving");
    // Read aloud as every row: its name, its amount, then its figures with protein named.
    expect(mainButton("Shakshuka")).toHaveAccessibleName(
      `Shakshuka 1.5 servings ${formatKcal(shakshuka.figures.energyKcal)} kcal ${formatGrams(shakshuka.figures.proteinG)} g protein`,
    );
    // A recipe entry is no estimate.
    expect(rowOf("Shakshuka")).not.toHaveTextContent("≈");
  });

  it("marks it eaten from its row, and the eaten reading takes its figures", async () => {
    const server = await start();
    const before = readingsShown();
    fireEvent.click(within(rowOf("Shakshuka")).getByRole("button", { name: "Mark Shakshuka eaten" }), { detail: 1 });
    await waitFor(() => expect(within(rowOf("Shakshuka")).getByRole("img", { name: "Eaten" })).toBeInTheDocument());
    expect(jest.mocked(setEntriesStatus)).toHaveBeenCalledWith([shakshukaOf(server)!.id], "eaten");
    await waitFor(() => expect(readingsShown()).toEqual(readingsHeld(server)));
    // Eaten took the shakshuka's figures. With plan held them already, and still does.
    expect(readingsShown()[0]).not.toBe(before[0]);
    expect(readingsShown()[1]).toBe(before[1]);
  });

  it("marks it planned again in its sheet, and the eaten reading lets its figures go", async () => {
    const server = await start(today({ status: "eaten" }));
    const before = readingsShown();
    const sheet = await openSheet("Shakshuka");
    fireEvent.click(within(sheet).getByRole("radio", { name: "Planned" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("Marked Shakshuka planned."));
    expect(jest.mocked(patchEntry)).toHaveBeenCalledWith(shakshukaOf(server)!.id, { status: "planned" });
    expect(shakshukaOf(server)!.status).toBe("planned");
    await waitFor(() => expect(readingsShown()).toEqual(readingsHeld(server)));
    expect(readingsShown()[0]).not.toBe(before[0]);
    expect(readingsShown()[1]).toBe(before[1]);
  });

  it("changes its servings in its sheet: the row and the plan follow at once, and Undo puts 1.5 back", async () => {
    const server = await start();
    const sheet = await openSheet("Shakshuka");
    fireEvent.change(within(sheet).getByLabelText("Servings", { selector: "input" }), { target: { value: "2" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(liveToast()).toHaveTextContent("Saved Shakshuka."));
    expect(jest.mocked(patchEntry)).toHaveBeenCalledWith(shakshukaOf(server)!.id, { servings: 2 });
    await waitFor(() => expect(rowShows("Shakshuka")).toEqual(["2 servings", "487 kcal", "29 g"]));
    expect(readingsShown()).toEqual(readingsHeld(server));
    pressUndo();
    await waitFor(() => expect(rowShows("Shakshuka")[0]).toBe("1.5 servings"));
    expect(jest.mocked(patchEntry)).toHaveBeenLastCalledWith(shakshukaOf(server)!.id, { servings: 1.5 });
    expect(rowShows("Shakshuka")).toEqual([
      "1.5 servings",
      `${formatKcal(today()[2].figures.energyKcal)} kcal`,
      `${formatGrams(today()[2].figures.proteinG)} g`,
    ]);
    await waitFor(() => expect(readingsShown()).toEqual(readingsHeld(server)));
  });

  it("moves to tomorrow in its sheet with its servings and figures, and Undo brings it back", async () => {
    const server = await start();
    const figures = shakshukaOf(server)!.figures;
    const sheet = await openSheet("Shakshuka");
    fireEvent.change(within(sheet).getByLabelText("Date"), { target: { value: TOMORROW } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rowNames()).toEqual(["Quark", "Lunch"]));
    const moved = server.entries.find((e) => e.name === "Shakshuka")!;
    expect(moved).toMatchObject({ date: TOMORROW, status: "planned", servings: 1.5, figures });
    expect(jest.mocked(patchEntry)).toHaveBeenCalledWith(moved.id, { date: TOMORROW });
    await waitFor(() => expect(readingsShown()).toEqual(readingsHeld(server)));
    pressUndo();
    await waitFor(() => expect(rowNames()).toEqual(["Quark", "Lunch", "Shakshuka"]));
    expect(rowShows("Shakshuka")[0]).toBe("1.5 servings");
    await waitFor(() => expect(readingsShown()).toEqual(readingsHeld(server)));
  });

  it("is removed in its sheet, and Undo restores it at its place with its servings", async () => {
    const server = await start();
    const id = shakshukaOf(server)!.id;
    const sheet = await openSheet("Shakshuka");
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove entry" }));
    await waitFor(() => expect(rowNames()).toEqual(["Quark", "Lunch"]));
    expect(jest.mocked(removeEntry)).toHaveBeenCalledWith(id);
    await waitFor(() => expect(readingsShown()).toEqual(readingsHeld(server)));
    pressUndo();
    await waitFor(() => expect(rowNames()).toEqual(["Quark", "Lunch", "Shakshuka"]));
    expect(jest.mocked(restoreEntry)).toHaveBeenCalledWith(id);
    expect(rowShows("Shakshuka")[0]).toBe("1.5 servings");
    await waitFor(() => expect(readingsShown()).toEqual(readingsHeld(server)));
  });

  it("shows its servings in the copy sheet, and its copy keeps them, its recipe and its figures", async () => {
    const server = await start();
    const source = shakshukaOf(server)!;
    fireEvent.click(
      within(document.querySelector<HTMLElement>("[data-entries-head]")!).getByRole("button", { name: "Copy" }),
    );
    const sheet = await waitFor(() => {
      const open = document.querySelector<HTMLElement>('[role="dialog"][data-open]');
      expect(open).toHaveAccessibleName("Copy entries");
      return open!;
    });
    const row = sheet.querySelector<HTMLElement>(`[data-copy-entry="${source.id}"]`)!;
    expect(row).toHaveTextContent("1.5 servings");
    expect(row.textContent).toContain(`${formatKcal(source.figures.energyKcal)} kcal`);
    fireEvent.change(within(sheet).getByLabelText("To"), { target: { value: TOMORROW } });
    fireEvent.click(within(sheet).getByRole("button", { name: /^copy$/i }));
    await waitFor(() => expect(server.entries.filter((e) => e.date === TOMORROW)).toHaveLength(3));
    const copy = server.entries.find((e) => e.date === TOMORROW && e.name === "Shakshuka")!;
    expect(copy).toMatchObject({
      kind: "recipe",
      status: "planned",
      servings: 1.5,
      recipe: source.recipe,
      basis: source.basis,
      figures: source.figures,
    });
    expect(copy.id).not.toBe(source.id);
  });

  it("keeps a deleted recipe's entry as it was in its row, and says in its sheet that the recipe was deleted", async () => {
    const deleted = today({ recipe: { id: "00000000-0000-4000-9000-0000000000aa", archived: false, deleted: true } });
    const server = await start(deleted);
    expect(rowShows("Shakshuka")).toEqual([
      "1.5 servings",
      `${formatKcal(deleted[2].figures.energyKcal)} kcal`,
      `${formatGrams(deleted[2].figures.proteinG)} g`,
    ]);
    const sheet = await openSheet("Shakshuka");
    expect(within(sheet).getByText("This recipe was deleted.")).toBeInTheDocument();
    // Its servings still change: the entry holds its own basis.
    fireEvent.change(within(sheet).getByLabelText("Servings", { selector: "input" }), { target: { value: "1" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rowShows("Shakshuka")[0]).toBe("1 serving"));
    expect(shakshukaOf(server)!.servings).toBe(1);
  });
});
