import { fakeAuth } from "@/__tests__/helpers/auth";
import { queryWrapper } from "@/__tests__/helpers/queryClient";
import { NavLinks } from "@/components/shell/NavLinks";
import type { TabKey } from "@/components/shell/tabs";
import { TICK_MS, TodayProvider } from "@/components/targets/TodayProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { getFood } from "@/lib/api/foods";
import { forgetShownDay } from "@/lib/shownDay";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { DayTab } from "../DayTab";
import { FakeDays, seededClient, serve } from "./harness";
import { foodEntry } from "./support";

// The Day tab remembers the day it showed by its address, so the tab bar's
// Day link leads back to it from another tab. The app's today in these tests
// is 2026-11-16 (Helsinki), with the clock pinned 30 seconds before its end.

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn() }));
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
}));
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/foods", () => ({
  getFood: jest.fn(),
  getFavouriteFoods: jest.fn().mockResolvedValue({ foods: [] }),
  getOwnFoods: jest.fn().mockResolvedValue({ foods: [] }),
}));

/** The address, as the router holds it. `replace` changes it the way the router does. */
let address = new URL("http://app.test/");
const replace = jest.fn((href: string) => {
  address = new URL(href, address);
});
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () => address.searchParams,
  usePathname: () => address.pathname,
}));
jest.mock("next/link", () => {
  // A link is followed by the test's own navigation, so its href is what is asserted.
  const Link = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  return { __esModule: true, default: Link };
});

const NOW = Date.parse("2026-11-16T21:59:30Z");
const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));

/** The shell in small: the Day tab while it is the current tab, and the tab links under it. */
function App({ tab }: { tab: TabKey }): ReactElement {
  return (
    <TodayProvider>
      <ToastProvider>
        {tab === "day" && <DayTab />}
        <nav aria-label="Main">
          <ul>
            <NavLinks active={tab} variant="bar" />
          </ul>
        </nav>
      </ToastProvider>
    </TodayProvider>
  );
}

let server: FakeDays;
let rerender: (ui: ReactElement) => void;

function start(href: string): void {
  address = new URL(href, "http://app.test/");
  const view = render(<App tab={address.pathname === "/" ? "day" : "settings"} />, {
    wrapper: queryWrapper(seededClient()),
  });
  rerender = view.rerender;
}

/** Follows a link the way the router does: the address becomes its href, and the tab its path's. */
async function follow(name: string): Promise<void> {
  const link = within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name });
  address = new URL(link.getAttribute("href")!, address);
  rerender(<App tab={address.pathname === "/" ? "day" : "settings"} />);
  await advance(0);
}

const dayLink = (): string | null =>
  within(screen.getByRole("navigation", { name: "Main" }))
    .getByRole("link", { name: "Day" })
    .getAttribute("href");
const shownDate = (): string => (document.querySelector("[data-date-bar] input") as HTMLInputElement).value;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"], now: NOW });
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  jest.mocked(getFood).mockReturnValue(new Promise(() => {}));
  replace.mockClear();
  server = new FakeDays([foodEntry("Quark", 250, { status: "planned" })]);
  serve(server);
  // Each test is a fresh open of the app.
  forgetShownDay();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("the Day tab's remembered day", () => {
  it("a fresh open with no date shows today, and the Day link leads to today", async () => {
    start("/");
    await advance(0);
    expect(shownDate()).toBe("2026-11-16");
    await follow("Settings");
    expect(dayLink()).toBe("/");
  });

  it("a day chosen with the chevrons is where the Day link leads back to from another tab", async () => {
    start("/");
    await advance(0);
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(replace).toHaveBeenCalledWith("/?date=2026-11-15", { scroll: false });
    rerender(<App tab="day" />);
    await advance(0);
    await follow("Settings");
    expect(dayLink()).toBe("/?date=2026-11-15");
    await follow("Day");
    expect(address.search).toBe("?date=2026-11-15");
    expect(shownDate()).toBe("2026-11-15");
  });

  it("a day opened by its address, such as a shared link or a reload, is remembered too", async () => {
    start("/?date=2026-11-02");
    await advance(0);
    await follow("Settings");
    expect(dayLink()).toBe("/?date=2026-11-02");
  });

  it("choosing today again forgets the day, so the link leads to today", async () => {
    start("/?date=2026-11-15");
    await advance(0);
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(replace).toHaveBeenCalledWith("/", { scroll: false });
    rerender(<App tab="day" />);
    await advance(0);
    await follow("Settings");
    expect(dayLink()).toBe("/");
  });

  it("on the Day tab its own link leads to today, whatever day is shown", async () => {
    start("/?date=2026-11-15");
    await advance(0);
    expect(dayLink()).toBe("/");
    await follow("Day");
    expect(address.search).toBe("");
    expect(shownDate()).toBe("2026-11-16");
  });

  it("a chosen day stays chosen across midnight while the person is on another tab", async () => {
    start("/?date=2026-11-15");
    await advance(0);
    await follow("Settings");
    server.today = "2026-11-17";
    await advance(TICK_MS);
    await advance(0);
    expect(dayLink()).toBe("/?date=2026-11-15");
    await follow("Day");
    expect(shownDate()).toBe("2026-11-15");
  });

  it("today stays today across midnight: the person comes back to the new day", async () => {
    start("/");
    await advance(0);
    await follow("Settings");
    server.today = "2026-11-17";
    await advance(TICK_MS);
    await advance(0);
    expect(dayLink()).toBe("/");
    await follow("Day");
    expect(shownDate()).toBe("2026-11-17");
  });
});
