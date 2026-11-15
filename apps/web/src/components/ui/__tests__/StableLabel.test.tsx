import { render, screen } from "@testing-library/react";
import { StableLabel } from "../StableLabel";

function Button({ active }: { active: boolean }) {
  return (
    <button type="button">
      <StableLabel active={active} idle="Save" busy="Saving…" className="row" busyClassName="text-positive" />
    </button>
  );
}

describe("StableLabel", () => {
  it("keeps both labels in one grid cell in every state, so the width never changes", () => {
    const { rerender } = render(<Button active={false} />);
    const cells = () => Array.from(screen.getByRole("button").querySelectorAll(":scope > span > span"));
    for (const active of [false, true, false]) {
      rerender(<Button active={active} />);
      expect(cells()).toHaveLength(2);
      for (const cell of cells()) expect(cell).toHaveClass("[grid-area:1/1]", "row");
    }
  });

  it("shows and names the idle label at rest, the busy one while active", () => {
    const { rerender } = render(<Button active={false} />);
    expect(screen.getByRole("button")).toHaveAccessibleName("Save");
    expect(screen.getByText("Saving…")).toHaveClass("invisible");
    expect(screen.getByText("Save")).not.toHaveClass("invisible");

    rerender(<Button active />);
    expect(screen.getByRole("button")).toHaveAccessibleName("Saving…");
    expect(screen.getByText("Save")).toHaveClass("invisible");
    expect(screen.getByText("Saving…")).not.toHaveClass("invisible");
    expect(screen.getByText("Saving…")).toHaveClass("text-positive");
    expect(screen.getByText("Save")).not.toHaveClass("text-positive");
  });
});
