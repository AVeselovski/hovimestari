import { stubPhone } from "@/__tests__/formSheet";
import { fakeAuth } from "@/__tests__/helpers/auth";
import { controlSheetAnimations, swipeSheetDown } from "@/__tests__/sheet";
import { renderDay, rowNames } from "@/components/day/__tests__/harness";
import { QUARK } from "@/components/day/__tests__/support";
import { detailOf } from "@/components/foods/__tests__/support";
import { useAuth } from "@/contexts/AuthContext";
import { ARM_DELAY_MS } from "@/hooks/useArmedAtRest";
import { getDay } from "@/lib/api/days";
import { addEntry } from "@/lib/api/entries";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods, setFavourite } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import { addDays } from "@/lib/localDate";
import { entryFigures, type AddEntryBody } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { TODAY, favouritesOf, logWorld, loosely, openLogSheet, ownFoods, plus, timeout } from "./logHarness";

// The log sheet's food and meal views: the log block, Log in the footer, and
// what the views keep while a log runs or fails. The real Day tab against
// the fake server of components/day/__tests__/harness.tsx.

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn() }));
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

let world: ReturnType<typeof logWorld>;
beforeEach(() => {
  searchParams = new URLSearchParams();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, addEntry, getRecents, getFavouriteFoods, getOwnFoods, getFood, searchFoods, setFavourite]) {
    jest.mocked(fn).mockReset();
  }
  world = logWorld();
  jest.mocked(getFavouriteFoods).mockResolvedValue(favouritesOf(world));
  jest.mocked(getOwnFoods).mockResolvedValue(ownFoods());
  jest.mocked(setFavourite).mockResolvedValue(undefined);
  jest.mocked(getFood).mockImplementation(async (id) => {
    const food = [world.quark, world.banana, world.oats].find((f) => f.id === id);
    if (!food) return new Promise(() => {});
    const portions =
      food === world.banana ? [{ id: world.pieceId, unit: null, name: "Piece", grams: 55, isOwn: true }] : [];
    return detailOf(food, { portions, lastAmount: null });
  });
});

const sent = (): AddEntryBody[] => jest.mocked(addEntry).mock.calls.map(([body]) => body);
const dialog = () => screen.getByRole("dialog");
const amount = () => within(dialog()).getByRole("textbox", { name: /^(Amount|Meals)$/ }) as HTMLInputElement;
const logButton = () => within(dialog()).getByRole("button", { name: /^(Log|Add to plan|Logging…)$/ });
const figure = (macro: string) =>
  dialog().querySelector<HTMLElement>(`[data-log-figures] [data-macro="${macro}"] dd`)!.textContent;

async function openRow(list: string, name: string): Promise<void> {
  const region = within(dialog()).getByRole("region", { name: list });
  fireEvent.click(within(region).getByRole("button", { name: new RegExp(`^${name}`) }));
  await within(dialog()).findByRole("button", { name: "Back" });
}

describe("The log sheet's food view", () => {
  it("opens on the last amount, shows the figures entryFigures gives, and logs that amount with Log", async () => {
    renderDay();
    await openLogSheet();
    await openRow("Recent", "Quark");
    expect(amount().value).toBe("250");
    const expected = entryFigures(QUARK, { per: "100g", grams: 250 });
    expect(figure("energy")).toBe(`${formatKcal(expected.energyKcal)}kcal`);
    expect(figure("protein")).toBe(`${formatMacroGrams(expected.proteinG)}g`);
    fireEvent.change(amount(), { target: { value: "300" } });
    expect(figure("energy")).toBe(`${formatKcal(entryFigures(QUARK, { per: "100g", grams: 300 }).energyKcal)}kcal`);
    fireEvent.click(logButton());
    await screen.findByText("Logged Quark, 300 g.");
    expect(sent()).toEqual([
      expect.objectContaining({
        kind: "food",
        foodId: world.quark.id,
        amount: { grams: 300 },
        date: TODAY,
        status: "eaten",
      }),
    ]);
    expect(rowNames()).toEqual(["Oats", "Quark"]);
  });

  it("opens a food never logged with an empty amount, and Log waits", async () => {
    renderDay();
    await openLogSheet();
    await openRow("Your foods", "Rye bread");
    expect(amount().value).toBe("");
    expect(within(dialog()).getByText("Enter an amount to see its figures.")).toBeInTheDocument();
    expect(logButton()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(logButton());
    await act(async () => {});
    expect(addEntry).not.toHaveBeenCalled();
  });

  it("fills a search result's amount from its detail when that answers, while nothing is typed", async () => {
    jest.mocked(searchFoods).mockResolvedValue({ foods: [world.quark] });
    let answer!: (value: ReturnType<typeof detailOf>) => void;
    jest.mocked(getFood).mockImplementationOnce(() => new Promise((r) => (answer = r)));
    renderDay();
    await openLogSheet();
    fireEvent.change(screen.getByLabelText("Search foods and meals"), { target: { value: "quark" } });
    await waitFor(() => expect(dialog().querySelector("[data-list=results]")).not.toBeNull());
    fireEvent.click(
      within(dialog().querySelector<HTMLElement>("[data-list=results]")!).getByRole("button", { name: /^Quark/ }),
    );
    await screen.findByRole("button", { name: "Back" });
    expect(amount().value).toBe("");
    await act(async () => answer(detailOf(world.quark, { lastAmount: { grams: 180, portion: null } })));
    // The query notifies on a timer, which a loaded machine may not have run yet.
    await waitFor(() => expect(amount().value).toBe("180"));
  });

  it("forces Planned on a future day and names the footer Add to plan", async () => {
    searchParams = new URLSearchParams(`date=${addDays(TODAY, 2)}`);
    renderDay();
    await openLogSheet(/^Add to plan$/);
    await openRow("Recent", "Quark");
    expect(within(dialog()).getByRole("radio", { name: "Planned" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog()).getByRole("radio", { name: "Eaten" })).toHaveAttribute("aria-disabled", "true");
    expect(logButton()).toHaveTextContent("Add to plan");
    fireEvent.click(logButton());
    await screen.findByText("Added Quark to the plan.");
    expect(sent()[0]).toMatchObject({ status: "planned", date: addDays(TODAY, 2) });
  });

  it("logs as Planned when Planned is chosen on today, and the footer says so", async () => {
    renderDay();
    await openLogSheet();
    await openRow("Recent", "Quark");
    fireEvent.click(within(dialog()).getByRole("radio", { name: "Planned" }));
    expect(logButton()).toHaveTextContent("Add to plan");
    fireEvent.click(logButton());
    await screen.findByText("Added Quark to the plan.");
    expect(sent()[0]).toMatchObject({ status: "planned", date: TODAY });
  });

  it("with a changed amount refuses a swipe and springs back, and Back still leaves", async () => {
    renderDay();
    await openLogSheet();
    await openRow("Recent", "Quark");
    fireEvent.change(amount(), { target: { value: "200" } });
    swipeSheetDown(dialog());
    await act(async () => {});
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(amount().value).toBe("200");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Back" }));
    expect(await within(dialog()).findByRole("region", { name: "Recent" })).toBeInTheDocument();
  });

  it("keeps the view and its amount after a timeout, says so above Log, and Log resends the same id", async () => {
    jest.mocked(addEntry).mockRejectedValueOnce(timeout());
    renderDay();
    await openLogSheet();
    await openRow("Recent", "Quark");
    fireEvent.click(logButton());
    await within(dialog()).findByText("Could not confirm. Check your connection and try again.");
    expect(amount().value).toBe("250");
    fireEvent.click(logButton());
    await screen.findByText("Logged Quark, 250 g.");
    expect(sent()[1].id).toBe(sent()[0].id);
  });

  it("sends a new id with the next Log after entry_id_taken, which the same id can never get past", async () => {
    jest
      .mocked(addEntry)
      .mockRejectedValueOnce(
        Object.assign(new Error("409"), {
          isAxiosError: true,
          response: { status: 409, data: { code: "entry_id_taken" } },
        }),
      );
    renderDay();
    await openLogSheet();
    await openRow("Recent", "Quark");
    fireEvent.click(logButton());
    await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(logButton()).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(logButton());
    await screen.findByText("Logged Quark, 250 g.");
    expect(sent()[1].id).not.toBe(sent()[0].id);
  });

  it("falls back to grams when the portion is gone, and says why above Log", async () => {
    world.server.portionGrams.delete(world.pieceId);
    renderDay();
    await openLogSheet();
    await openRow("Recent", "Banana");
    expect(within(dialog()).getByRole("radio", { name: loosely("Piece · 55 g") })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(amount().value).toBe("2");
    fireEvent.click(logButton());
    await within(dialog()).findByText("This portion is no longer available.");
    expect(within(dialog()).getByRole("radio", { name: "g" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog()).queryByRole("radio", { name: loosely("Piece · 55 g") })).toBeNull();
    expect(amount().value).toBe("110");
  });

  it("flips a favourite's star in the recent items in place, and no row moves", async () => {
    renderDay();
    await openLogSheet();
    const recentRows = () =>
      within(within(dialog()).getByRole("region", { name: "Recent" }))
        .getAllByRole("listitem")
        .map((li) => li.querySelector("button")!.textContent);
    const before = recentRows();
    await openRow("Recent", "Quark");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Favourite" }));
    await waitFor(() => expect(setFavourite).toHaveBeenCalledWith(world.quark.id, true));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Back" }));
    await within(dialog()).findByRole("region", { name: "Recent" });
    const after = recentRows();
    expect(after.map((t) => t?.replace("Favourite", ""))).toEqual(before);
    expect(after[0]).toContain("Favourite");
  });
});

describe("The log sheet's meal view", () => {
  it("shows the figures for the count: 2.5 meals of 60 kcal and 8 g are 150 kcal and 20 g", async () => {
    renderDay();
    await openLogSheet();
    const region = within(dialog()).getByRole("region", { name: "Recent" });
    fireEvent.click(within(region).getByRole("button", { name: /^Shake/ }));
    await within(dialog()).findByRole("button", { name: "Back" });
    expect(amount().value).toBe("1");
    expect(within(dialog()).getByText("From Home")).toBeInTheDocument();
    fireEvent.change(amount(), { target: { value: "2,5" } });
    expect(figure("energy")).toBe("150kcal");
    expect(figure("protein")).toBe("20.0g");
    fireEvent.click(logButton());
    await screen.findByText("Logged Shake, 2.5 meals.");
    expect(sent()[0]).toMatchObject({ kind: "saved_meal", savedMealId: world.shake.id, count: 2.5 });
  });

  it("goes back to browsing with a line when the meal is gone", async () => {
    renderDay();
    await openLogSheet();
    fireEvent.click(
      within(within(dialog()).getByRole("region", { name: "Recent" })).getByRole("button", { name: /^Shake/ }),
    );
    await within(dialog()).findByRole("button", { name: "Back" });
    // Deleted on another device while its view is open.
    world.server.meals.clear();
    fireEvent.click(logButton());
    expect(await within(dialog()).findByText("This saved meal is no longer available.")).toBeInTheDocument();
    expect(within(dialog()).getByLabelText("Search foods and meals")).toHaveFocus();
  });
});

describe("The log sheet on a phone", () => {
  it("ignores a '+' until the sheet is at rest", async () => {
    // The arm delay on a fake clock that also moves with real time, so the
    // reads still answer and the delay passes exactly when the test says.
    jest.useFakeTimers({ advanceTimers: true });
    const restorePhone = stubPhone();
    const animations = controlSheetAnimations();
    try {
      renderDay();
      const launcher = await screen.findByRole("button", { name: "Log food" });
      // The launcher waits until the day's date is known.
      await waitFor(() => expect(launcher).not.toHaveAttribute("aria-disabled"));
      fireEvent.click(launcher);
      await within(await screen.findByRole("dialog")).findByRole("region", { name: "Recent" });
      const guard = () => dialog().querySelector("[data-press-guard]");
      // Still sliding in: the second tap of a double tap lands here.
      fireEvent.pointerDown(plus("Log Quark again, 250 g"));
      fireEvent.click(plus("Log Quark again, 250 g"));
      await act(async () => {});
      expect(addEntry).not.toHaveBeenCalled();
      // The delay passes on the fake clock: still sliding in, so still waiting.
      act(() => jest.advanceTimersByTime(ARM_DELAY_MS));
      expect(guard()).toHaveAttribute("data-press-guard", "waiting");
      fireEvent.pointerDown(plus("Log Quark again, 250 g"));
      fireEvent.click(plus("Log Quark again, 250 g"));
      await act(async () => {});
      expect(addEntry).not.toHaveBeenCalled();
      // The entry ends (Base UI may ask for the animations more than once): at rest, armed.
      await waitFor(() => {
        animations.finish();
        expect(guard()).toHaveAttribute("data-press-guard", "armed");
      });
      fireEvent.pointerDown(plus("Log Quark again, 250 g"));
      fireEvent.click(plus("Log Quark again, 250 g"));
      await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(1));
    } finally {
      animations.restore();
      restorePhone();
      jest.useRealTimers();
    }
  });
});
