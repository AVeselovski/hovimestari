import { UNCONFIRMED_HOLD_MS } from "@/lib/pendingIds";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { STATUS_MESSAGE_MS, StatusLine, useStatusMessage } from "../StatusLine";

// The log sheet's status line: the day it logs to, or for a moment what a
// press did. A message ends after its time, or at the next press or key.

function Line({ text }: { text: string }) {
  const status = useStatusMessage();
  const { say } = status;
  useEffect(() => say(text, "failure"), [say, text]);
  return <StatusLine date="2026-11-16" message={status.message} />;
}

const line = () => document.querySelector("[data-status-line]")!;

describe("The status line's message", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows for six seconds, then the line names the day again", () => {
    render(<Line text="Could not confirm. Try again." />);
    expect(line()).toHaveTextContent("Could not confirm. Try again.");
    act(() => jest.advanceTimersByTime(STATUS_MESSAGE_MS - 1));
    expect(line()).toHaveTextContent("Could not confirm. Try again.");
    act(() => jest.advanceTimersByTime(1));
    expect(line()).not.toHaveTextContent("Could not confirm.");
    expect(STATUS_MESSAGE_MS).toBe(6000);
  });

  it("ends at the next press or key, whichever comes first", () => {
    const view = render(<Line text="You are offline." />);
    fireEvent.pointerDown(document.body);
    expect(line()).not.toHaveTextContent("You are offline.");
    view.rerender(<Line text="Saved Bowl." />);
    expect(screen.getByText("Saved Bowl.")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "a" });
    expect(line()).not.toHaveTextContent("Saved Bowl.");
  });
});

describe("The hold of an add that could not confirm", () => {
  it("lasts as long as the status message, so '+' again resends the id the whole time its line can show", () => {
    expect(UNCONFIRMED_HOLD_MS).toBe(STATUS_MESSAGE_MS);
  });
});
