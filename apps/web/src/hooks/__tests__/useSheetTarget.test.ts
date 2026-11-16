import { act, renderHook } from "@testing-library/react";
import { useSheetTarget } from "../useSheetTarget";

describe("useSheetTarget", () => {
  it("opens once for a double tap: the second open keeps the first open's key and opener", () => {
    const { result } = renderHook(() => useSheetTarget());
    const first = document.createElement("button");
    const second = document.createElement("button");
    act(() => result.current.open(first));
    const opened = result.current.shown;
    act(() => result.current.open(second));
    expect(result.current.shown).toBe(opened);
    expect(result.current.shown?.opener).toBe(first);
  });

  it("keeps what it showed while the sheet slides out, and gives the next open a fresh key", () => {
    const { result } = renderHook(() => useSheetTarget());
    act(() => result.current.open(null));
    const opened = result.current.shown!;
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.shown).toBe(opened);
    act(() => result.current.open(null));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.shown!.key).not.toBe(opened.key);
  });
});
