import { ThemeProvider } from "@/contexts/ThemeContext";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "../ThemeToggle";

function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Map<string, (event: MediaQueryListEvent) => void>();
  const mql = {
    matches: initialMatches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: jest.fn((type: string, cb: (event: MediaQueryListEvent) => void) => listeners.set(type, cb)),
    removeEventListener: jest.fn((type: string) => listeners.delete(type)),
  };
  window.matchMedia = jest.fn().mockReturnValue(mql);
  return mql;
}

function resetDocumentTheme() {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeMode;
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    resetDocumentTheme();
    window.localStorage.clear();
    stubMatchMedia(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders all three modes as radio options, with accessible names from the catalog", () => {
    render(<ThemeToggle />, { wrapper: ThemeProvider });
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Light/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Dark/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /System/ })).toBeInTheDocument();
  });

  it("starts on System (the default) and marks it checked", () => {
    render(<ThemeToggle />, { wrapper: ThemeProvider });
    expect(screen.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Light/ })).toHaveAttribute("aria-checked", "false");
  });

  it("clicking a mode selects it and writes data-theme accordingly", () => {
    render(<ThemeToggle />, { wrapper: ThemeProvider });
    fireEvent.click(screen.getByRole("radio", { name: /Dark/ }));
    expect(screen.getByRole("radio", { name: /Dark/ })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(screen.getByRole("radio", { name: /Light/ }));
    expect(screen.getByRole("radio", { name: /Light/ })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("is one Tab stop: the arrow keys move the mode and focus", () => {
    render(<ThemeToggle />, { wrapper: ThemeProvider });
    const system = screen.getByRole("radio", { name: /System/ });
    expect(system).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /Light/ })).toHaveAttribute("tabindex", "-1");
    system.focus();
    fireEvent.keyDown(system, { key: "ArrowRight" });
    const light = screen.getByRole("radio", { name: /Light/ });
    expect(light).toHaveFocus();
    expect(light).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("every option is keyboard reachable (a real button, not a div)", () => {
    render(<ThemeToggle />, { wrapper: ThemeProvider });
    for (const name of [/Light/, /Dark/, /System/]) {
      const el = screen.getByRole("radio", { name });
      expect(el.tagName).toBe("BUTTON");
      expect(el).not.toHaveAttribute("disabled");
    }
  });

  // Owner ruling #2 (round 2 pass B): all three segments must be the exact
  // width of the widest label, not sized by their own content — a `flex` row
  // sized each button by its own text ("System" is wider than "Light"/"Dark").
  // A three-column CSS grid sizes every column identically regardless of the
  // content inside it, which is what actually guarantees equal widths (a
  // bounding-box comparison is meaningless in jsdom, which lays out nothing —
  // this asserts the markup mechanism that produces equal widths in a real
  // browser, verified live in docs/design and the round-2-pass-B screenshots).
  it("lays the three segments out on an equal-width grid, not a content-sized flex row", () => {
    render(<ThemeToggle />, { wrapper: ThemeProvider });
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group).toHaveClass("grid", "grid-cols-3");
    expect(group).not.toHaveClass("flex");
    for (const name of [/Light/, /Dark/, /System/]) {
      const el = screen.getByRole("radio", { name });
      expect(el).not.toHaveClass("flex-1");
    }
  });
});
