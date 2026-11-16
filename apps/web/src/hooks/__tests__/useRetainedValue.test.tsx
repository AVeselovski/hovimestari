import { renderHook } from "@testing-library/react";
import { useRetainedValue } from "../useRetainedValue";

describe("useRetainedValue", () => {
  it("is null until a value arrives", () => {
    const { result } = renderHook(() => useRetainedValue<string>(null));
    expect(result.current).toBeNull();
  });

  it("returns the current value while there is one", () => {
    const { result, rerender } = renderHook(({ value }) => useRetainedValue(value), {
      initialProps: { value: "a" as string | null },
    });
    expect(result.current).toBe("a");
    rerender({ value: "b" });
    expect(result.current).toBe("b");
  });

  it("keeps the last value after the value goes null", () => {
    const first = { id: 1 };
    const { result, rerender } = renderHook(({ value }) => useRetainedValue(value), {
      initialProps: { value: first as { id: number } | null },
    });
    rerender({ value: null });
    expect(result.current).toBe(first);
    // And across further renders while it stays null.
    rerender({ value: null });
    expect(result.current).toBe(first);
  });

  it("keeps the latest value, not the first one, when several arrive before it goes null", () => {
    const { result, rerender } = renderHook(({ value }) => useRetainedValue(value), {
      initialProps: { value: "a" as string | null },
    });
    rerender({ value: "b" });
    rerender({ value: null });
    expect(result.current).toBe("b");
  });

  it("is replaced by the next value after a null", () => {
    const { result, rerender } = renderHook(({ value }) => useRetainedValue(value), {
      initialProps: { value: "a" as string | null },
    });
    rerender({ value: null });
    rerender({ value: "c" });
    expect(result.current).toBe("c");
    rerender({ value: null });
    expect(result.current).toBe("c");
  });
});
