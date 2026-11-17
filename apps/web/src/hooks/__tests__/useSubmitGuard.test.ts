import { act, renderHook } from "@testing-library/react";
import { useSubmitGuard } from "../useSubmitGuard";

function deferred(): { promise: Promise<void>; resolve: () => void; reject: () => void } {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSubmitGuard", () => {
  it("refuses a second submit while the first one's promise is pending, and opens when it resolves", async () => {
    const { result } = renderHook(() => useSubmitGuard());
    const first = deferred();
    const submit = jest.fn(() => first.promise);
    expect(result.current.run(submit)).toBe(true);
    expect(result.current.inFlight()).toBe(true);
    expect(result.current.run(submit)).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve());
    expect(result.current.inFlight()).toBe(false);
    expect(result.current.run(() => undefined)).toBe(true);
  });

  it("opens again after a rejected submit", async () => {
    const { result } = renderHook(() => useSubmitGuard());
    const first = deferred();
    result.current.run(() => first.promise);
    await act(async () => {
      first.reject();
      await first.promise.catch(() => undefined);
    });
    expect(result.current.inFlight()).toBe(false);
  });

  it("stays open after a submit that returns nothing", () => {
    const { result } = renderHook(() => useSubmitGuard());
    const submit = jest.fn();
    result.current.run(submit);
    result.current.run(submit);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(result.current.inFlight()).toBe(false);
  });
});
