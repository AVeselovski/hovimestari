import { fakeAuth } from "@/__tests__/helpers/auth";
import {
  createTestQueryClient,
  deferred,
  queryWrapper,
  registerTestQueryClient,
} from "@/__tests__/helpers/queryClient";
import { change, overview } from "@/components/targets/__tests__/support";
import { TargetsGate } from "@/components/targets/TargetsGate";
import { ToastProvider, ToastRegion } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { getDay } from "@/lib/api/days";
import { getFood } from "@/lib/api/foods";
import { updateSettings } from "@/lib/api/settings";
import { getTargets, putTargets } from "@/lib/api/targets";
import { finishFirstRun } from "@/lib/api/users";
import { addDays, formatDay } from "@/lib/localDate";
import { queryKeys } from "@/lib/queryKeys";
import { dayQuery } from "@/lib/queryOptions";
import type { Day } from "@hovimestari/types";
import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TEST_USER } from "../../../__tests__/helpers/auth";
import { DayTab } from "../DayTab";
import { FakeDays, serve } from "./harness";
import { TODAY, foodEntry } from "./support";

// The first-run page opened again from a day, for a user with no targets,
// and every way back to that day: Continue, the browser's Back and a
// successful Save. The address never changes, the same day shows, and focus
// lands on the date button, never on the page's body.

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
jest.mock("@/lib/api/settings", () => ({ updateSettings: jest.fn() }));
jest.mock("@/lib/api/users", () => ({ getMe: jest.fn(), deleteAccount: jest.fn(), finishFirstRun: jest.fn() }));
jest.mock("@/lib/api/foods", () => ({
  getFood: jest.fn(),
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
}));
// The address is the browser's own, so a history entry the gate pushes is what the tab reads.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
}));

const SHOWN = "2026-11-10";
const ADDRESS = `/?date=${SHOWN}`;

let server: FakeDays;
beforeEach(() => {
  // Midday in Helsinki on the tests' today, so the device and the server agree on it.
  jest.spyOn(Date, "now").mockReturnValue(Date.parse(`${TODAY}T10:00:00Z`));
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
  jest.mocked(updateSettings).mockReset().mockResolvedValue(TEST_USER);
  jest.mocked(finishFirstRun).mockReset().mockResolvedValue(undefined);
  server = new FakeDays([foodEntry("Oats", 80, { date: SHOWN })]);
  server.changes = [];
  serve(server);
  jest.mocked(putTargets).mockImplementation(async (effectiveFrom, body) => {
    const saved = { ...change(effectiveFrom), ranges: body.ranges };
    server.changes = [saved];
    return saved;
  });
  window.history.replaceState({ fromNext: true }, "", ADDRESS);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  setDeviceOnline(true);
});

/** The device's connection, as the browser reports it: `navigator.onLine` and the event that follows. */
function setDeviceOnline(online: boolean): void {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
  act(() => onlineManager.setOnline(online));
}

function renderApp() {
  const client = registerTestQueryClient(createTestQueryClient());
  render(
    <TargetsGate>
      <ToastProvider>
        <DayTab />
        <ToastRegion />
      </ToastProvider>
    </TargetsGate>,
    { wrapper: queryWrapper(client) },
  );
  return client;
}

const address = () => window.location.pathname + window.location.search;
const dateButton = () => screen.getByRole("button", { name: /^Choose a date/ });
const firstRunHeading = () => screen.queryByRole("heading", { name: "Your daily targets" });

async function openFromTheDay(): Promise<void> {
  await screen.findByText("Oats");
  fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
  await screen.findByRole("heading", { name: "Your daily targets" });
  expect(address()).toBe(ADDRESS);
}

async function expectBackOnTheDay(): Promise<void> {
  expect(await screen.findByText("Oats")).toBeInTheDocument();
  expect(firstRunHeading()).toBeNull();
  expect(address()).toBe(ADDRESS);
  expect(dateButton()).toHaveAccessibleName(expect.stringContaining("Nov 10"));
  await waitFor(() => expect(dateButton()).toHaveFocus());
}

function popstate(): Promise<void> {
  return new Promise((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
}

function fillAll(): void {
  const bound = (g: string, b: string) => within(screen.getByRole("group", { name: g })).getByLabelText(b);
  fireEvent.change(bound("Calories", "From"), { target: { value: "1800" } });
  fireEvent.change(bound("Calories", "To"), { target: { value: "2200" } });
  fireEvent.change(bound("Protein", "From"), { target: { value: "120" } });
  fireEvent.change(bound("Protein", "To"), { target: { value: "160" } });
}

describe("DayTab, the first-run page opened from a day", () => {
  it("Continue without targets returns to the same day and address, with focus on the date button", async () => {
    renderApp();
    await openFromTheDay();
    const moved = popstate();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue without targets" }));
      await moved;
    });
    await expectBackOnTheDay();
    expect(finishFirstRun).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Set targets" })).toBeInTheDocument();
  });

  it("the browser's Back returns to the same day and address, with focus on the date button", async () => {
    renderApp();
    await openFromTheDay();
    const moved = popstate();
    await act(async () => {
      window.history.back();
      await moved;
    });
    await expectBackOnTheDay();
  });

  it("a successful Save returns to the same day, which now names the date the new targets start", async () => {
    renderApp();
    await openFromTheDay();
    fillAll();
    const moved = popstate();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
      await moved;
    });
    expect(putTargets).toHaveBeenCalledWith(TODAY, expect.anything());
    await expectBackOnTheDay();
    // The day is before the new change: figures only, and the line that says from when.
    const row = document.querySelector("[data-targets-row]")!;
    expect(row).toHaveAttribute("data-targets-row", "from");
    expect(row).toHaveTextContent(`Targets apply from ${formatDay(TODAY)}.`);
    expect(screen.queryByRole("button", { name: "Set targets" })).toBeNull();
  });

  it("Save leaves without waiting for days off screen, and the day returned to opens with its new answer, never the old one", async () => {
    const client = renderApp();
    await openFromTheDay();
    // Ten more days held in the cache, each with a read of its own.
    const held = Array.from({ length: 10 }, (_, i) => addDays(SHOWN, -(i + 1)));
    await act(async () => {
      for (const date of held) await client.prefetchQuery(dayQuery(date));
    });
    // From here on, every off-screen day's read hangs. The shown day answers.
    const hanging = deferred<Day>();
    jest.mocked(getDay).mockImplementation(async (date) => (date === SHOWN ? server.day(date) : hanging.promise));
    fillAll();
    // Every frame the summary shows from the moment the shell returns.
    const frames: string[] = [];
    const observer = new MutationObserver(() => {
      const row = document.querySelector("[data-targets-row]");
      if (row) frames.push(row.getAttribute("data-targets-row") ?? "");
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const moved = popstate();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
      await moved;
    });
    await expectBackOnTheDay();
    observer.disconnect();
    // The off-screen reads are still out: the page did not wait for them.
    expect(held.some((date) => client.getQueryState(queryKeys.day(date))?.fetchStatus === "fetching")).toBe(true);
    // The day never showed the old answer's Set targets after the save.
    expect(frames).not.toContain("none");
    expect(new Set(frames)).toEqual(new Set(["from"]));
  });

  it("Save from today returns to today with its gauges at once, never the old answer's row", async () => {
    window.history.replaceState({ fromNext: true }, "", "/");
    server.entries.push(foodEntry("Quark", 250));
    renderApp();
    await screen.findByText("Quark");
    fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
    await screen.findByRole("heading", { name: "Your daily targets" });
    // Today's read takes a while to answer once the targets are saved.
    jest.mocked(getDay).mockImplementation(async (date) => {
      await new Promise((r) => setTimeout(r, 50));
      return server.day(date);
    });
    fillAll();
    const seen = new Set<string>();
    const observer = new MutationObserver(() => {
      const row = document.querySelector("[data-targets-row]");
      if (row) seen.add(row.getAttribute("data-targets-row") ?? "");
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const moved = popstate();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
      await moved;
    });
    expect(await screen.findByText("Quark")).toBeInTheDocument();
    // The first frame of the day already has its gauges.
    expect(document.querySelectorAll('[data-gauge="energy"], [data-gauge="protein"]')).toHaveLength(2);
    observer.disconnect();
    expect([...seen]).toEqual([]);
    await waitFor(() => expect(dateButton()).toHaveFocus());
    expect(address()).toBe("/");
  });

  it("when another device has saved targets, the page opened goes back and the day shows its gauges", async () => {
    window.history.replaceState({ fromNext: true }, "", "/");
    server.entries.push(foodEntry("Quark", 250));
    renderApp();
    await screen.findByText("Quark");
    // Saved elsewhere, after this device read none. The read the press sends answers it.
    server.changes = [change(TODAY)];
    const moved = popstate();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
      await moved;
    });
    expect(await screen.findByText("Quark")).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelectorAll('[data-gauge="energy"], [data-gauge="protein"]')).toHaveLength(2),
    );
    expect(document.querySelector("[data-targets-row]")).toBeNull();
    expect(firstRunHeading()).toBeNull();
    await waitFor(() => expect(dateButton()).toHaveFocus());
  });

  it("passing the self-shown first run arrives on the day with focus on the date button", async () => {
    window.history.replaceState({ fromNext: true }, "", "/");
    let due = true;
    jest
      .mocked(getTargets)
      .mockImplementation(async () => overview(server.changes, server.today, server.today, { firstRunDue: due }));
    jest.mocked(finishFirstRun).mockImplementation(async () => {
      due = false;
    });
    renderApp();
    await screen.findByRole("heading", { name: "Your daily targets" });
    fireEvent.click(screen.getByRole("button", { name: "Continue without targets" }));
    expect(await screen.findByRole("button", { name: "Set targets" })).toBeInTheDocument();
    await waitFor(() => expect(dateButton()).toHaveFocus());
    expect(address()).toBe("/");
  });

  describe("when the reads after Save are slow or cannot run", () => {
    /** Today's address, Quark logged, and the page opened from it. */
    async function openFromToday(): Promise<void> {
      window.history.replaceState({ fromNext: true }, "", "/");
      server.entries.push(foodEntry("Quark", 250));
      renderApp();
      await screen.findByText("Quark");
      fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
      await screen.findByRole("heading", { name: "Your daily targets" });
    }

    it("leaves within two seconds when the reads hang, and the day opens on its frame laid out from the new targets, then its answer", async () => {
      await openFromToday();
      // Once the targets are saved, the targets read and the day's read hang until the test answers them.
      const targetsRead = deferred<Awaited<ReturnType<typeof getTargets>>>();
      const dayRead = deferred<Day>();
      jest.mocked(getTargets).mockImplementation(() => targetsRead.promise);
      jest.mocked(getDay).mockImplementation(() => dayRead.promise);
      fillAll();
      jest.useFakeTimers({ doNotFake: ["Date"] });
      fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1900);
      });
      expect(firstRunHeading()).toBeInTheDocument();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(200);
      });
      await waitFor(() => expect(firstRunHeading()).toBeNull());
      expect(address()).toBe("/");
      // The frame: no entries yet, busy, and gauges, since the saved change starts today. Never Set targets.
      expect(screen.queryByText("Quark")).toBeNull();
      expect(document.querySelector("[data-day-summary]")).toHaveAttribute("aria-busy", "true");
      expect(document.querySelector("[data-targets-row]")).toBeNull();
      expect(screen.queryByRole("button", { name: "Set targets" })).toBeNull();
      await act(async () => {
        targetsRead.resolve(overview(server.changes, server.today, server.today));
        dayRead.resolve(server.day(TODAY));
        await jest.advanceTimersByTimeAsync(50);
      });
      expect(await screen.findByText("Quark")).toBeInTheDocument();
      expect(document.querySelectorAll('[data-gauge="energy"], [data-gauge="protein"]')).toHaveLength(2);
      expect(document.querySelector("[data-targets-row]")).toBeNull();
    });

    it("a Back pressed while Save waits closes the page once, and Save's end goes Back no further", async () => {
      // An entry before the day, so a second Back would land somewhere visible.
      window.history.replaceState({ fromNext: true }, "", "/settings");
      window.history.pushState({ fromNext: true }, "", "/");
      server.entries.push(foodEntry("Quark", 250));
      renderApp();
      await screen.findByText("Quark");
      fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
      await screen.findByRole("heading", { name: "Your daily targets" });
      // Once the targets are saved, the targets read hangs, so Save waits its full bound.
      jest.mocked(getTargets).mockImplementation(() => new Promise(() => {}));
      fillAll();
      jest.useFakeTimers({ doNotFake: ["Date"] });
      fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(300);
      });
      expect(firstRunHeading()).toBeInTheDocument();
      // The person goes Back themselves while Save waits.
      const moved = popstate();
      await act(async () => {
        window.history.back();
        await jest.advanceTimersByTimeAsync(50);
        await moved;
      });
      expect(firstRunHeading()).toBeNull();
      expect(address()).toBe("/");
      const length = window.history.length;
      const back = jest.spyOn(window.history, "back");
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2500);
      });
      // Time for any Back sent at the end of the wait to land.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(100);
      });
      jest.useRealTimers();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(address()).toBe("/");
      expect(window.history.length).toBe(length);
      expect(back).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /^Choose a date/ })).toBeInTheDocument();
      expect(firstRunHeading()).toBeNull();
    });

    it("leaves at once when the connection drops after the save, and the day keeps its entries, never Set targets", async () => {
      await openFromToday();
      const save = jest.mocked(putTargets).getMockImplementation()!;
      jest.mocked(putTargets).mockImplementation(async (date, body) => {
        const saved = await save(date, body);
        // Stored, then the connection goes.
        setDeviceOnline(false);
        return saved;
      });
      fillAll();
      const moved = popstate();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
        await moved;
      });
      expect(firstRunHeading()).toBeNull();
      // The entries the device holds stay. The saved change starts today, so the row keeps its room, empty, until the
      // day is read again.
      expect(await screen.findByText("Quark")).toBeInTheDocument();
      expect(screen.queryByText("This day needs a connection.")).toBeNull();
      const row = document.querySelector("[data-targets-row]");
      expect(row).toHaveAttribute("data-targets-row", "pending");
      expect(row).toBeEmptyDOMElement();
      expect(screen.queryByRole("button", { name: "Set targets" })).toBeNull();
    });
  });
});
