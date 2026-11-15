import { render, renderHook } from "@testing-library/react";
import { act } from "react";
import { useMediaQuery } from "../useMediaQuery";

/**
 * jsdom has no `matchMedia` implementation — stub a minimal MediaQueryList
 * whose `matches` can be flipped and whose `change` listener can be fired.
 */
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Map<string, (event: MediaQueryListEvent) => void>();
  const mql: {
    matches: boolean;
    addEventListener: jest.Mock;
    removeEventListener: jest.Mock;
    fireChange: (matches: boolean) => void;
  } = {
    matches: initialMatches,
    addEventListener: jest.fn((type: string, cb: (event: MediaQueryListEvent) => void) => listeners.set(type, cb)),
    removeEventListener: jest.fn((type: string) => listeners.delete(type)),
    // A real MediaQueryList updates its own `matches` BEFORE it dispatches
    // `change`, so anything reading `mql.matches` in response to the event
    // sees the new value. The stub used to fire the event while leaving
    // `matches` at its old value, which only worked for an implementation
    // that took the value off the event payload — CLAUDE.md failure mode 1,
    // a mock modelling behaviour the browser does not have.
    fireChange: (matches: boolean) => {
      mql.matches = matches;
      listeners.get("change")?.({ matches } as MediaQueryListEvent);
    },
  };
  window.matchMedia = jest.fn().mockReturnValue(mql);
  return mql;
}

describe("useMediaQuery", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reads the initial matchMedia value on mount", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(max-width: 1023px)"));
    expect(result.current).toBe(true);
  });

  it("reacts live to a matchMedia change event", () => {
    const mql = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(max-width: 1023px)"));
    expect(result.current).toBe(false);

    act(() => mql.fireChange(true));
    expect(result.current).toBe(true);
  });

  it("queries exactly the string it was given", () => {
    stubMatchMedia(false);
    renderHook(() => useMediaQuery("(max-width: 1099px)"));
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1099px)");
  });

  it("removes its listener on unmount", () => {
    const mql = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery("(max-width: 1023px)"));
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("re-queries when the query string changes", () => {
    stubMatchMedia(false);
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: "(max-width: 767px)" },
    });
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");

    rerender({ query: "(max-width: 1023px)" });
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1023px)");
  });
});

// Owner defect, 2026-09-22. The hook used to be `useState(false)` plus an
// effect, so the FIRST render always answered "no match" and the truth only
// arrived once an effect had run. Every consumer therefore painted its
// desktop branch first — and where that branch is a fixed-width overlay, a
// phone got a panel wider than its own screen until the effect landed.
// `renderHook` runs effects, so a test that only reads `result.current`
// cannot see this: it has to catch what the component rendered on the very
// first pass, before any effect.
describe("the first render, before any effect", () => {
  function FirstRender({ onRender }: { onRender: (v: boolean) => void }) {
    const matches = useMediaQuery("(max-width: 767px)");
    onRender(matches);
    return null;
  }

  it("answers with the real viewport, not a default of false", () => {
    stubMatchMedia(true);
    const seen: boolean[] = [];
    render(<FirstRender onRender={(v) => seen.push(v)} />);
    expect(seen[0]).toBe(true);
  });

  it("still answers false on the first render when the query does not match", () => {
    stubMatchMedia(false);
    const seen: boolean[] = [];
    render(<FirstRender onRender={(v) => seen.push(v)} />);
    expect(seen[0]).toBe(false);
  });
});
