import { tapClick as tapClickOn, tap as tapOn } from "@/__tests__/helpers/tap";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ARM_DELAY_MS, usePressGuard } from "../usePressGuard";

// usePressGuard: from hold(), no click inside the container counts for
// ARM_DELAY_MS, and a press that started while held never counts. A press
// that ended in no click holds nothing after it. The clock is Jest's.

const onRow = jest.fn();
let hold: () => void = () => {};

function Guarded(): ReactElement {
  const guard = usePressGuard();
  hold = guard.hold;
  return (
    <div data-testid="guarded" {...guard.guardProps}>
      <button type="button" onClick={onRow}>
        Row
      </button>
    </div>
  );
}

const row = () => screen.getByRole("button", { name: "Row" });
const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

const tap = (): Event => tapOn(row());
const tapClick = (): Event => tapClickOn(row());

beforeEach(() => {
  jest.useFakeTimers();
  onRow.mockReset();
  render(<Guarded />);
});
afterEach(() => jest.useRealTimers());

describe("usePressGuard", () => {
  it("holds nothing until asked", () => {
    expect(screen.getByTestId("guarded")).not.toHaveAttribute("data-press-guard");
    expect(tap().defaultPrevented).toBe(false);
    expect(onRow).toHaveBeenCalledTimes(1);
  });

  it("stops every click for half a second from hold(), then lets them through", () => {
    act(() => hold());
    expect(screen.getByTestId("guarded")).toHaveAttribute("data-press-guard", "waiting");
    expect(tap().defaultPrevented).toBe(true);
    wait(ARM_DELAY_MS - 1);
    expect(tap().defaultPrevented).toBe(true);
    expect(onRow).not.toHaveBeenCalled();
    wait(1);
    expect(screen.getByTestId("guarded")).not.toHaveAttribute("data-press-guard");
    expect(tap().defaultPrevented).toBe(false);
    expect(onRow).toHaveBeenCalledTimes(1);
  });

  it("stops a press that starts inside the half second and ends after it", () => {
    act(() => hold());
    wait(ARM_DELAY_MS - 100);
    fireEvent.pointerDown(row());
    wait(200);
    fireEvent.pointerUp(row());
    expect(tapClick().defaultPrevented).toBe(true);
    expect(onRow).not.toHaveBeenCalled();
    // The press is over: the next one counts.
    expect(tap().defaultPrevented).toBe(false);
  });

  it("starts the half second again on a second hold", () => {
    act(() => hold());
    wait(ARM_DELAY_MS - 100);
    act(() => hold());
    wait(200);
    expect(tap().defaultPrevented).toBe(true);
    wait(ARM_DELAY_MS - 200);
    expect(tap().defaultPrevented).toBe(false);
  });

  it("forgets a touch that turned into a scroll", () => {
    act(() => hold());
    wait(80);
    fireEvent.pointerDown(row());
    fireEvent.pointerCancel(row());
    wait(ARM_DELAY_MS);
    // A screen reader's activation, which can count as one click and comes with no pointerdown.
    expect(tapClick().defaultPrevented).toBe(false);
    expect(onRow).toHaveBeenCalledTimes(1);
  });

  it("lets Enter through once nothing is held, after a press that never ended", () => {
    act(() => hold());
    wait(80);
    fireEvent.pointerDown(row());
    wait(820);
    fireEvent.click(row(), { detail: 0 });
    expect(onRow).toHaveBeenCalledTimes(1);
  });

  // The latch's one limit: a press that ends in a pointerup and no click
  // keeps its start until the next pointerdown. A real tap brings its own,
  // and Enter ignores it, so both count once nothing is held.
  it("after a press that ended in a pointerup and no click, a tap and Enter count once nothing is held", () => {
    act(() => hold());
    wait(80);
    fireEvent.pointerDown(row());
    fireEvent.pointerUp(row());
    wait(ARM_DELAY_MS);
    expect(tap().defaultPrevented).toBe(false);
    expect(onRow).toHaveBeenCalledTimes(1);
    act(() => hold());
    wait(80);
    fireEvent.pointerDown(row());
    fireEvent.pointerUp(row());
    wait(ARM_DELAY_MS);
    fireEvent.click(row(), { detail: 0 });
    expect(onRow).toHaveBeenCalledTimes(2);
  });

  it("stops Enter too while held", () => {
    act(() => hold());
    fireEvent.click(row(), { detail: 0 });
    expect(onRow).not.toHaveBeenCalled();
  });
});
