import { act, render, screen } from "@testing-library/react";
import { dayTabHref, forgetShownDay, rememberShownDay, useShownDay } from "../shownDay";

function Shown(): React.ReactElement {
  return <p>{useShownDay() ?? "today"}</p>;
}

afterEach(() => forgetShownDay());

describe("shownDay", () => {
  it("leads to today's plain address when no day is remembered, and to the day's address when one is", () => {
    expect(dayTabHref(null)).toBe("/");
    expect(dayTabHref("2026-11-15")).toBe("/?date=2026-11-15");
  });

  it("tells every reader when the day changes and when it is forgotten", () => {
    render(<Shown />);
    expect(screen.getByText("today")).toBeInTheDocument();
    act(() => rememberShownDay("2026-11-15"));
    expect(screen.getByText("2026-11-15")).toBeInTheDocument();
    act(() => forgetShownDay());
    expect(screen.getByText("today")).toBeInTheDocument();
  });
});
