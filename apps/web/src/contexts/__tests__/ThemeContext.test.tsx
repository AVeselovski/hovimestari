import { THEME_STORAGE_KEY } from "@/lib/theme/noFlashScript";
import { act, renderHook } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../ThemeContext";

/**
 * jsdom has no `matchMedia` implementation — stub a minimal MediaQueryList
 * whose `matches` can be flipped and whose `change` listener can be fired,
 * mirroring the idiom `hooks/__tests__/useIsMobile.test.tsx` already uses.
 */
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Map<string, (event: MediaQueryListEvent) => void>();
  const mql = {
    matches: initialMatches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: jest.fn((type: string, cb: (event: MediaQueryListEvent) => void) => listeners.set(type, cb)),
    removeEventListener: jest.fn((type: string) => listeners.delete(type)),
    fireChange: (matches: boolean) => listeners.get("change")?.({ matches } as MediaQueryListEvent),
  };
  window.matchMedia = jest.fn().mockReturnValue(mql);
  return mql;
}

function resetDocumentTheme() {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeMode;
}

describe("ThemeContext", () => {
  beforeEach(() => {
    resetDocumentTheme();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("useTheme() outside a provider returns the documented safe default rather than throwing", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current).toEqual({ mode: "system", resolved: "dark", setMode: expect.any(Function) });
  });

  it("writes data-theme and data-theme-mode to the document element", () => {
    stubMatchMedia(false);
    renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(document.documentElement.dataset.themeMode).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("cycles through all three modes, resolving light/dark directly and system via the OS", () => {
    stubMatchMedia(true); // system currently prefers dark
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.mode).toBe("system");
    expect(result.current.resolved).toBe("dark");

    act(() => result.current.setMode("light"));
    expect(result.current.mode).toBe("light");
    expect(result.current.resolved).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    act(() => result.current.setMode("dark"));
    expect(result.current.mode).toBe("dark");
    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => result.current.setMode("system"));
    expect(result.current.mode).toBe("system");
    expect(result.current.resolved).toBe("dark"); // OS still prefers dark
  });

  it("persists the mode to localStorage and a fresh provider re-reads it", () => {
    stubMatchMedia(false);
    const { result, unmount } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => result.current.setMode("dark"));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    unmount();

    // Simulate the no-flash script having already run on reload: it would
    // have read localStorage and written the attribute before the provider
    // mounts — the provider's initial mode comes from that attribute, not
    // from reading localStorage itself (see the module doc).
    document.documentElement.dataset.themeMode = "dark";
    document.documentElement.dataset.theme = "dark";

    const second = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(second.result.current.mode).toBe("dark");
    expect(second.result.current.resolved).toBe("dark");
  });

  it("in system mode, follows a live matchMedia change", () => {
    const mql = stubMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.resolved).toBe("light");

    act(() => mql.fireChange(true));
    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("still updates mode/resolved/DOM attributes when localStorage.setItem throws (private mode / disabled storage)", () => {
    stubMatchMedia(false);
    const setItemSpy = jest.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(() => {
      act(() => result.current.setMode("dark"));
    }).not.toThrow();

    expect(result.current.mode).toBe("dark");
    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themeMode).toBe("dark");

    setItemSpy.mockRestore();
  });

  it("stops following the OS once an explicit mode is chosen", () => {
    const mql = stubMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => result.current.setMode("light"));
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    // A subsequent OS change must not move the now-explicit "light" choice.
    act(() => mql.fireChange(true));
    expect(result.current.mode).toBe("light");
    expect(result.current.resolved).toBe("light");
  });
});
