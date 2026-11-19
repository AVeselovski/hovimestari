import { renderHook } from "@testing-library/react";
import { useMainScrollLock } from "../useMainScrollLock";

describe("useMainScrollLock", () => {
  let main: HTMLElement;
  beforeEach(() => {
    main = document.body.appendChild(document.createElement("main"));
    main.style.overflow = "auto";
    Object.defineProperty(main, "scrollTop", { value: 300, writable: true });
  });
  afterEach(() => main.remove());

  it("holds <main> while active and puts back its overflow and scrollTop after", () => {
    const { rerender } = renderHook(({ on }) => useMainScrollLock(on), { initialProps: { on: true } });
    expect(main.style.overflow).toBe("hidden");
    main.scrollTop = 999;
    rerender({ on: false });
    expect(main.style.overflow).toBe("auto");
    expect(main.scrollTop).toBe(300);
  });

  // The browser's scroll anchoring keeps the page still behind a sheet when a
  // row is added above what shows: it moves scrollTop by the row's height and
  // fires a scroll event, as Chrome does. Putting back the scrollTop from
  // before would then move the page by that row once the sheet closes.
  it("puts back the scrollTop the browser moved it to while held, so the page does not jump on release", () => {
    const { rerender } = renderHook(({ on }) => useMainScrollLock(on), { initialProps: { on: true } });
    main.scrollTop = 460;
    main.dispatchEvent(new Event("scroll"));
    rerender({ on: false });
    expect(main.scrollTop).toBe(460);
  });

  it("follows <main> afresh under a lock taken after an earlier one let go", () => {
    const { rerender } = renderHook(({ on }) => useMainScrollLock(on), { initialProps: { on: true } });
    rerender({ on: false });
    const again = renderHook(() => useMainScrollLock(true));
    main.scrollTop = 120;
    main.dispatchEvent(new Event("scroll"));
    again.unmount();
    expect(main.scrollTop).toBe(120);
  });

  it("does nothing while inactive", () => {
    renderHook(() => useMainScrollLock(false));
    expect(main.style.overflow).toBe("auto");
  });

  // Two overlays that do not know about each other (the nav drawer and a
  // sheet that opens on its own) can open and close in either order.
  it("keeps <main> held until the last of two overlapping locks lets go, whichever goes first", () => {
    const a = renderHook(({ on }) => useMainScrollLock(on), { initialProps: { on: true } });
    const b = renderHook(({ on }) => useMainScrollLock(on), { initialProps: { on: true } });

    a.rerender({ on: false });
    expect(main.style.overflow).toBe("hidden");

    main.scrollTop = 999;
    b.rerender({ on: false });
    expect(main.style.overflow).toBe("auto");
    expect(main.scrollTop).toBe(300);
  });

  it("releases on unmount too", () => {
    const a = renderHook(() => useMainScrollLock(true));
    const b = renderHook(() => useMainScrollLock(true));
    a.unmount();
    expect(main.style.overflow).toBe("hidden");
    b.unmount();
    expect(main.style.overflow).toBe("auto");
  });
});
