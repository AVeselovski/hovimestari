import { renderHook } from "@testing-library/react";
import { act } from "react";
import { MOBILE_QUERY, useIsMobile } from "../useIsMobile";

/**
 * jsdom has no `matchMedia` implementation — stub a minimal MediaQueryList
 * whose `matches` can be flipped and whose `change` listener can be fired.
 * `fireChange` updates `matches` before dispatching, as a real one does.
 */
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Map<string, (event: MediaQueryListEvent) => void>();
  const mql: {
    matches: boolean;
    media?: string;
    addEventListener: jest.Mock;
    removeEventListener: jest.Mock;
    fireChange: (matches: boolean) => void;
  } = {
    matches: initialMatches,
    media: MOBILE_QUERY,
    addEventListener: jest.fn((type: string, cb: (event: MediaQueryListEvent) => void) => listeners.set(type, cb)),
    removeEventListener: jest.fn((type: string) => listeners.delete(type)),
    // A real MediaQueryList updates `matches` before dispatching `change`.
    fireChange: (matches: boolean) => {
      mql.matches = matches;
      listeners.get("change")?.({ matches } as MediaQueryListEvent);
    },
  };
  window.matchMedia = jest.fn().mockReturnValue(mql);
  return mql;
}

describe("useIsMobile", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reads the initial matchMedia value on mount", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("reacts live to a matchMedia change event", () => {
    const mql = stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => mql.fireChange(true));
    expect(result.current).toBe(true);
  });

  it("queries the app's single md breakpoint", () => {
    const mql = stubMatchMedia(false);
    renderHook(() => useIsMobile());
    expect(window.matchMedia).toHaveBeenCalledWith(MOBILE_QUERY);
    expect(mql.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("removes its listener on unmount", () => {
    const mql = stubMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
