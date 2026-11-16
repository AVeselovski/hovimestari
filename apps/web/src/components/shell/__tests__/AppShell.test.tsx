import { useAuth } from "@/contexts/AuthContext";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { fakeAuth } from "../../../__tests__/helpers/auth";
import { AppShell } from "../AppShell";
import { tabOf } from "../tabs";

jest.mock("@/contexts/AuthContext");
let mockPathname = "/";
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
}

beforeEach(() => {
  mockPathname = "/";
  setOnline(true);
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
});

describe("tabOf", () => {
  it.each([
    ["/", "day"],
    ["/recipes", "recipes"],
    ["/recipes/abc", "recipes"],
    ["/groceries", "groceries"],
    ["/settings", "settings"],
    ["/recipesx", null],
    ["/elsewhere", null],
  ])("puts %s under %s", (path, tab) => {
    expect(tabOf(path)).toBe(tab);
  });
});

describe("AppShell", () => {
  it.each([
    ["/", "Day"],
    ["/recipes", "Recipes"],
    ["/groceries", "Groceries"],
    ["/settings", "Settings"],
  ])("on %s titles the page %s and marks that tab current in both navs", (path, label) => {
    mockPathname = path;
    render(<AppShell>{null}</AppShell>);
    expect(screen.getByRole("heading", { level: 1, name: label })).toBeInTheDocument();
    const navs = screen.getAllByRole("navigation", { name: "Main" });
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      const current = within(nav).getByRole("link", { current: "page" });
      expect(current).toHaveTextContent(label);
      expect(within(nav).getAllByRole("link")).toHaveLength(4);
    }
  });

  it("on Day keeps the h1 for screen readers only, the date bar being the header, and shows the title on every other tab", () => {
    render(<AppShell>{null}</AppShell>);
    const day = screen.getByRole("heading", { level: 1, name: "Day" });
    expect(day.className.split(/\s+/)).toContain("sr-only");
    expect(screen.getByRole("banner").querySelector(".rule-dashed")).toBeNull();
    cleanup();
    mockPathname = "/settings";
    render(<AppShell>{null}</AppShell>);
    const settings = screen.getByRole("heading", { level: 1, name: "Settings" });
    expect(settings.className.split(/\s+/)).not.toContain("sr-only");
    expect(screen.getByRole("banner").querySelector(".rule-dashed")).not.toBeNull();
  });

  it("mounts the tab bar for phones and the rail from md, and CSS shows one", () => {
    render(<AppShell>{null}</AppShell>);
    const [rail, bar] = screen.getAllByRole("navigation", { name: "Main" });
    expect(rail.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "md:flex"]));
    expect(bar.className.split(/\s+/)).toContain("md:hidden");
  });

  it("scrolls in <main> only, and holds every absolutely placed element of a page, so the document never scrolls", () => {
    render(<AppShell>{null}</AppShell>);
    // Positioned: a visually hidden label inside a page has <main> as its
    // containing block, so it scrolls with the page instead of growing the
    // document (measured at 320 by 568: the document grew by 137 px).
    expect(screen.getByRole("main").className.split(/\s+/)).toEqual(
      expect.arrayContaining(["overflow-y-auto", "relative"]),
    );
  });

  it("pads the header, the tab bar and the rail clear of the safe areas", () => {
    render(<AppShell>{null}</AppShell>);
    const [rail, bar] = screen.getAllByRole("navigation", { name: "Main" });
    expect(screen.getByRole("banner").className).toContain("var(--safe-top)");
    expect(bar.className).toContain("var(--safe-bottom)");
    expect(rail.className).toContain("var(--safe-left)");
  });

  it("shows the offline line while the browser is offline", () => {
    render(<AppShell>{null}</AppShell>);
    expect(screen.queryByText("You are offline.")).not.toBeInTheDocument();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("You are offline.");
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText("You are offline.")).not.toBeInTheDocument();
  });

  it("shows the offline line while the server cannot be reached", () => {
    jest.mocked(useAuth).mockReturnValue(fakeAuth("offline"));
    render(<AppShell>{null}</AppShell>);
    expect(screen.getByRole("status")).toHaveTextContent("You are offline.");
  });
});
