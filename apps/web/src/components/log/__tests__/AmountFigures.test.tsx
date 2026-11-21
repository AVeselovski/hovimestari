import { entryFigures } from "@hovimestari/types";
import { render, screen } from "@testing-library/react";
import { AmountFigures } from "../AmountFigures";

// The figures under an amount, shared by the log block, the ingredient picker
// and a recipe's log sheet. The four slots are drawn in every state, so a
// figure filling in moves nothing.

const slots = (root: HTMLElement) => root.querySelectorAll("[data-log-figures] dd").length;

describe("AmountFigures", () => {
  it("asks for an amount while nothing is typed, with the four slots drawn", () => {
    const { container } = render(<AmountFigures preview={null} empty />);
    expect(screen.getByText("Enter an amount to see its figures.")).toBeInTheDocument();
    expect(slots(container)).toBe(4);
  });

  it("says nothing while what is typed does not parse", () => {
    const { container } = render(<AmountFigures preview={null} empty={false} />);
    expect(container.querySelector("[aria-live]")!.textContent).toBe("");
    expect(slots(container)).toBe(4);
  });

  it("shows the figures for the amount under For this amount", () => {
    const preview = entryFigures(
      { energyKcal: 134.17, proteinG: 12.61, carbsG: 0.4, fatG: 9.2 },
      { per: "100g", grams: 240 },
    );
    const { container } = render(<AmountFigures preview={preview} empty={false} />);
    expect(screen.getByText("For this amount")).toBeInTheDocument();
    expect(container.textContent).toContain("322");
    expect(container.textContent).toContain("30.3");
  });
});
