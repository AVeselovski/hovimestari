import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "../useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("settles on the last value once it has held still for the delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 150), { initialProps: { v: "" } });
    for (const v of ["r", "ra", "rah"]) {
      rerender({ v });
      act(() => jest.advanceTimersByTime(100));
    }
    expect(result.current).toBe("");
    act(() => jest.advanceTimersByTime(150));
    expect(result.current).toBe("rah");
  });
});
