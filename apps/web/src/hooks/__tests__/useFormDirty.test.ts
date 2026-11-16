import { act, renderHook } from "@testing-library/react";
import { useFormDirty } from "../useFormDirty";

describe("useFormDirty", () => {
  it("is clean at first and dirty once the snapshot changes", () => {
    const { result, rerender } = renderHook(({ snapshot }) => useFormDirty(snapshot, true), {
      initialProps: { snapshot: "a" },
    });
    expect(result.current.dirty).toBe(false);
    rerender({ snapshot: "b" });
    expect(result.current.dirty).toBe(true);
  });

  it("is clean again when the input goes back to exactly the baseline", () => {
    const { result, rerender } = renderHook(({ snapshot }) => useFormDirty(snapshot, true), {
      initialProps: { snapshot: "a" },
    });
    rerender({ snapshot: "b" });
    rerender({ snapshot: "a" });
    expect(result.current.dirty).toBe(false);
  });

  it("waits for ready: the snapshot at the first ready render is the baseline, whatever came before", () => {
    const { result, rerender } = renderHook(({ snapshot, ready }) => useFormDirty(snapshot, ready), {
      initialProps: { snapshot: "empty", ready: false },
    });
    expect(result.current.dirty).toBe(false);
    rerender({ snapshot: "prefilled", ready: true });
    expect(result.current.dirty).toBe(false);
    rerender({ snapshot: "edited", ready: true });
    expect(result.current.dirty).toBe(true);
    rerender({ snapshot: "prefilled", ready: true });
    expect(result.current.dirty).toBe(false);
  });

  it("is never dirty before ready, however the snapshot moves", () => {
    const { result, rerender } = renderHook(({ snapshot }) => useFormDirty(snapshot, false), {
      initialProps: { snapshot: "a" },
    });
    rerender({ snapshot: "b" });
    expect(result.current.dirty).toBe(false);
  });

  it("rebase makes what is on screen the new baseline", () => {
    const { result, rerender } = renderHook(({ snapshot }) => useFormDirty(snapshot, true), {
      initialProps: { snapshot: "a" },
    });
    rerender({ snapshot: "saved" });
    expect(result.current.dirty).toBe(true);
    act(() => result.current.rebase());
    expect(result.current.dirty).toBe(false);
    rerender({ snapshot: "a" });
    expect(result.current.dirty).toBe(true);
  });

  it("a rebase in the same batch as new input takes that input as the baseline", () => {
    const { result, rerender } = renderHook(({ snapshot }) => useFormDirty(snapshot, true), {
      initialProps: { snapshot: "a" },
    });
    act(() => {
      result.current.rebase();
      rerender({ snapshot: "prefilled again" });
    });
    expect(result.current.dirty).toBe(false);
  });
});
