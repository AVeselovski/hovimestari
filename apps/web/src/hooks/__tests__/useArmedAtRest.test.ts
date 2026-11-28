import { act, renderHook } from "@testing-library/react";
import { useArmedAtRest } from "../useArmedAtRest";
import { ARM_DELAY_MS } from "../usePressGuard";

// The container guard: a click inside is stopped until the sheet is at rest
// and the delay has passed, and a press that started before then never counts.
describe("useArmedAtRest guardProps", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** A click event. `detail` 0 is a click with no pointer of its own: Enter, Space or a screen reader. */
  const click = (detail?: number) => ({ preventDefault: jest.fn(), stopPropagation: jest.fn(), detail });

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

  // A press that ends in no click holds no later click: a touch the browser
  // takes for a scroll ends in pointercancel, which forgets it, and a click
  // with no pointer of its own (Enter, Space, a screen reader) never belongs
  // to an earlier press. Either counts once armed.
  it("a press cancelled while waiting holds no later click", () => {
    const { result } = renderHook(() => useArmedAtRest(true, true));
    act(() => jest.advanceTimersByTime(ARM_DELAY_MS - 200));
    result.current.guardProps.onPointerDownCapture?.();
    result.current.guardProps.onPointerCancelCapture();
    act(() => result.current.onOpened());
    act(() => jest.advanceTimersByTime(200));
    const e = click();
    result.current.guardProps.onClickCapture(e);
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it("a press that never ended holds no Enter once armed", () => {
    const { result } = renderHook(() => useArmedAtRest(true, true));
    result.current.guardProps.onPointerDownCapture();
    act(() => result.current.onOpened());
    act(() => jest.advanceTimersByTime(ARM_DELAY_MS));
    const e = click(0);
    result.current.guardProps.onClickCapture(e);
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });
});

describe("useArmedAtRest pressProps", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("runs the action only for a press that started armed", () => {
    const action = jest.fn();
    const { result } = renderHook(() => useArmedAtRest(true, true));
    result.current.pressProps(action).onPointerDown();
    act(() => result.current.onOpened());
    act(() => jest.advanceTimersByTime(ARM_DELAY_MS - 100));
    result.current.pressProps(action).onClick({ detail: 1 });
    expect(action).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(100));
    result.current.pressProps(action).onPointerDown();
    result.current.pressProps(action).onClick({ detail: 1 });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("a press cancelled while waiting holds no later click", () => {
    const action = jest.fn();
    const { result } = renderHook(() => useArmedAtRest(true, true));
    act(() => jest.advanceTimersByTime(ARM_DELAY_MS - 200));
    result.current.pressProps(action).onPointerDown();
    result.current.pressProps(action).onPointerCancel();
    act(() => result.current.onOpened());
    act(() => jest.advanceTimersByTime(200));
    result.current.pressProps(action).onClick({ detail: 1 });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("a press that never ended holds no Enter once armed", () => {
    const action = jest.fn();
    const { result } = renderHook(() => useArmedAtRest(true, true));
    result.current.pressProps(action).onPointerDown();
    act(() => result.current.onOpened());
    act(() => jest.advanceTimersByTime(ARM_DELAY_MS));
    result.current.pressProps(action).onClick({ detail: 0 });
    expect(action).toHaveBeenCalledTimes(1);
  });
});
