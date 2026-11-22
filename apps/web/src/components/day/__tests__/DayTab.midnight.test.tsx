import { fakeAuth } from "@/__tests__/helpers/auth";
import { refusal } from "@/components/targets/__tests__/support";
import { TICK_MS } from "@/components/targets/TodayProvider";
import { useAuth } from "@/contexts/AuthContext";
import { getDay } from "@/lib/api/days";
import { getFood } from "@/lib/api/foods";
import { getTargets } from "@/lib/api/targets";
import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { FakeDays, renderDay, rowOf, serve } from "./harness";
import { foodEntry } from "./support";

// The Day tab across the account's midnight (Helsinki), with the tab open.

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
  getFavouriteFoods: jest.fn().mockResolvedValue({ foods: [] }),
  getOwnFoods: jest.fn().mockResolvedValue({ foods: [] }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

const MIDNIGHT = Date.parse("2026-11-16T22:00:00Z");
const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));

let server: FakeDays;
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"], now: MIDNIGHT - 30_000 });
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
  server = new FakeDays([foodEntry("Quark", 250, { status: "planned" })]);
  serve(server);
});
afterEach(() => {
  jest.useRealTimers();
  onlineManager.setOnline(true);
});

/** The server's midnight passes with the device's. */
async function crossMidnight(): Promise<void> {
  server.today = "2026-11-17";
  await advance(TICK_MS);
}

it("offline at midnight shows that the day needs a connection, not an endless frame, and the new day on reconnect", async () => {
  renderDay();
  await advance(0);
  expect(screen.getByText("Quark")).toBeInTheDocument();
  act(() => onlineManager.setOnline(false));
  await crossMidnight();
  expect(screen.getByText("This day needs a connection.")).toBeInTheDocument();
  expect(screen.queryByText("Quark")).toBeNull();
  act(() => {
    onlineManager.setOnline(true);
    window.dispatchEvent(new Event("online"));
  });
  await advance(0);
  await advance(0);
  expect(screen.queryByText("This day needs a connection.")).toBeNull();
  expect(screen.getByText("Nothing logged yet.")).toBeInTheDocument();
  expect(getDay).toHaveBeenCalledWith("2026-11-17", expect.anything());
});

it("a failed ask shows that the day did not load, and Try again asks again", async () => {
  renderDay();
  await advance(0);
  jest.mocked(getTargets).mockRejectedValueOnce(refusal(503, "request_refused"));
  await crossMidnight();
  expect(screen.getByText("This day did not load.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await advance(0);
  await advance(0);
  expect(screen.getByText("Nothing logged yet.")).toBeInTheDocument();
});

it("keeps an open entry sheet and its typed amount through midnight", async () => {
  renderDay();
  await advance(0);
  fireEvent.click(within(rowOf("Quark")).getByRole("button", { name: /^Quark/ }));
  const sheet = screen.getByRole("dialog", { name: "Quark" });
  const amount = within(sheet).getByLabelText("Amount", { selector: "input" });
  fireEvent.change(amount, { target: { value: "312" } });
  await crossMidnight();
  await advance(0);
  expect(screen.getByRole("dialog", { name: "Quark" })).toBe(sheet);
  expect(within(sheet).getByLabelText("Amount", { selector: "input" })).toHaveValue("312");
});

it("goes from the old day straight to the new one at midnight, never through the empty frame", async () => {
  server.entries.push({ ...foodEntry("Skyr", 100, { status: "planned" }), date: "2026-11-17" });
  // Every read takes 150 ms, as over a phone's connection.
  const slow = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
    jest.fn((...a: A) => new Promise<R>((resolve) => setTimeout(() => resolve(fn(...a)), 150)));
  jest.mocked(getTargets).mockImplementation(slow(jest.mocked(getTargets).getMockImplementation()!));
  jest.mocked(getDay).mockImplementation(slow(jest.mocked(getDay).getMockImplementation()!));
  renderDay();
  await advance(1000);
  expect(screen.getByText("Quark")).toBeInTheDocument();
  const seen: string[] = [];
  const record = () => {
    const text = document.body.textContent ?? "";
    const now = text.includes("Quark") ? "old" : text.includes("Skyr") ? "new" : "empty";
    if (seen.at(-1) !== now) seen.push(now);
  };
  server.today = "2026-11-17";
  for (let i = 0; i < 1300; i++) {
    await advance(50);
    record();
  }
  expect(seen).toEqual(["old", "new"]);
});
