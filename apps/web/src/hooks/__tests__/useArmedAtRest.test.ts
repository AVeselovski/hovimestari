import { act, renderHook } from "@testing-library/react";
import { ARM_DELAY_MS, useArmedAtRest } from "../useArmedAtRest";

// The container guard: a click inside is stopped until the sheet is at rest
// and the delay has passed, and a press that started before then never counts.
describe("useArmedAtRest guardProps", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const click = () => ({ preventDefault: jest.fn(), stopPropagation: jest.fn() });

  it("off, it adds nothing and stops nothing", () => {
    const { result } = renderHook(() => useArmedAtRest(true, false));
    const e = click();
    result.current.guardProps.onClickCapture(e);
    expect(e.stopPropagation).not.toHaveBeenCalled();
    expect(result.current.guardProps["data-press-guard"]).toBeUndefined();
  });

  it("stops clicks until the sheet is at rest and the delay has passed", () => {
    const { result } = renderHook(() => useArmedAtRest(true, true));
    expect(result.current.guardProps["data-press-guard"]).toBe("waiting");
    const early = click();
    result.current.guardProps.onClickCapture(early);
    expect(early.stopPropagation).toHaveBeenCalled();
    expect(early.preventDefault).toHaveBeenCalled();

    act(() => result.current.onOpened());
    act(() => jest.advanceTimersByTime(ARM_DELAY_MS));
    expect(result.current.guardProps["data-press-guard"]).toBe("armed");
    const late = click();
    result.current.guardProps.onPointerDownCapture();
    result.current.guardProps.onClickCapture(late);
    expect(late.stopPropagation).not.toHaveBeenCalled();
  });

  it("a press that started while waiting does not count once armed", () => {
    const { result } = renderHook(() => useArmedAtRest(true, true));
    result.current.guardProps.onPointerDownCapture();
    act(() => result.current.onOpened());
    act(() => jest.advanceTimersByTime(ARM_DELAY_MS));
    const e = click();
    result.current.guardProps.onClickCapture(e);
    expect(e.stopPropagation).toHaveBeenCalled();
  });
});
