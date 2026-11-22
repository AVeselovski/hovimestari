import { fakeAuth } from "@/__tests__/helpers/auth";
import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import { createTestQueryClient, registerTestQueryClient } from "@/__tests__/helpers/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { getDay, getDaySummaries } from "@/lib/api/days";
import { getFood } from "@/lib/api/foods";
import { getTargets } from "@/lib/api/targets";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { FakeDays, renderDay, serve } from "./harness";
import { TODAY, foodEntry } from "./support";

// ---------------------------------------------------------------------------
// The Week button on the Day tab and the sheet it opens. The app's today is
// Monday 16 November 2026, the clock runs from noon that day in Helsinki, and
// dates format as a British phone.
// ---------------------------------------------------------------------------

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn().mockResolvedValue({ items: [] }) }));
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
}));

let searchParams = new URLSearchParams();
const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/",
}));

beforeEach(() => {
  clockFrom(`${TODAY}T10:00:00Z`);
  setTestLocale("en-GB");
  searchParams = new URLSearchParams();
  replace.mockReset();
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  for (const fn of [getDay, getDaySummaries, getTargets, getFood]) jest.mocked(fn).mockReset();
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
});

afterEach(() => jest.restoreAllMocks());

const weekButton = () => screen.getByRole("button", { name: "Week" });

async function ready(): Promise<void> {
  await waitFor(() => expect(weekButton()).not.toHaveAttribute("aria-disabled"));
}

describe("DayTab, the Week button", () => {
  it.each([
    ["today", null],
    ["a past day", "2026-11-10"],
    ["a future day", "2026-11-20"],
  ])("reads Week on %s, beside the launcher on its row", async (_name, date) => {
    if (date) searchParams = new URLSearchParams({ date });
    serve(new FakeDays());
    renderDay();
    await ready();
    expect(weekButton()).toHaveTextContent(/^Week$/);
    expect(weekButton()).toHaveAttribute("aria-haspopup", "dialog");
    const row = weekButton().parentElement!;
    expect(row).toHaveAttribute("data-launcher-row");
    expect(row.querySelector("[data-day-launcher]")).not.toBeNull();
    // The launcher first, Week after it.
    expect(row.lastElementChild).toBe(weekButton());
  });

  it("keeps the launcher's row 48 px tall: both controls are h-12 and the row adds no height of its own", async () => {
    serve(new FakeDays());
    renderDay();
    await ready();
    const row = document.querySelector("[data-launcher-row]")!;
    const tokens = (el: Element) => el.className.split(/\s+/);
    expect(tokens(weekButton())).toContain("h-12");
    expect(tokens(row.querySelector("[data-day-launcher]")!)).toContain("h-12");
    expect(tokens(row).filter((c) => /^(md:|lg:)?(p[ytb]?|m[ytb]?|h|min-h)-/.test(c))).toEqual([]);
    // The header still holds the date bar and this row, and nothing else.
    const header = document.querySelector("[data-day-header]")!;
    expect(header.children).toHaveLength(2);
    expect(header.lastElementChild).toBe(row);
  });

  it("waits, as the launcher does, while today is not known", async () => {
    serve(new FakeDays());
    jest.mocked(getTargets).mockReturnValue(new Promise(() => {}));
    // No targets answer cached and none coming: no today.
    renderDay(registerTestQueryClient(createTestQueryClient()));
    expect(weekButton()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(weekButton());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reads the shown day's week ahead once the day is on screen", async () => {
    searchParams = new URLSearchParams({ date: "2026-11-19" });
    serve(new FakeDays());
    renderDay();
    await ready();
    await waitFor(() => expect(getDaySummaries).toHaveBeenCalledWith("2026-11-16", "2026-11-22", expect.anything()));
  });
});

describe("DayTab, the week sheet", () => {
  it("opens on the shown day's week, and a row shows that day, closes the sheet and puts focus back on Week", async () => {
    searchParams = new URLSearchParams({ date: "2026-11-19" });
    const server = new FakeDays([foodEntry("Rahka", 250, { date: "2026-11-17" })]);
    serve(server);
    renderDay();
    await ready();
    weekButton().focus();
    fireEvent.click(weekButton());
    const sheet = await screen.findByRole("dialog", { name: "16 to 22 Nov" });
    const shown = within(sheet).getByRole("button", { name: "Thursday 19 November" });
    expect(shown).toHaveAttribute("aria-current", "true");
    await waitFor(() => expect(shown).toHaveFocus());
    expect(within(sheet).getByRole("button", { name: "Today, Monday 16 November" })).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Tuesday 17 November" }));
    expect(replace).toHaveBeenLastCalledWith("/?date=2026-11-17", { scroll: false });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(weekButton()).toHaveFocus();
  });

  it("goes to the plain address when the row pressed is today", async () => {
    searchParams = new URLSearchParams({ date: "2026-11-19" });
    serve(new FakeDays());
    renderDay();
    await ready();
    fireEvent.click(weekButton());
    const sheet = await screen.findByRole("dialog", { name: "16 to 22 Nov" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Today, Monday 16 November" }));
    expect(replace).toHaveBeenLastCalledWith("/", { scroll: false });
  });

  it("steps weeks in the sheet and leaves the day behind it alone, and Escape returns focus to Week", async () => {
    serve(new FakeDays());
    renderDay();
    await ready();
    weekButton().focus();
    fireEvent.click(weekButton());
    const sheet = await screen.findByRole("dialog", { name: "16 to 22 Nov" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Next week" }));
    expect(screen.getByRole("dialog", { name: "23 to 29 Nov" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
    expect(weekButton()).toHaveFocus();
  });
});
