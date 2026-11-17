import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { AmountField } from "../AmountField";
import type { UnitChip } from "../amount";

const LONG = "Lähikahvila Mustikkamäen Kulmakeittiö";
const CHIPS: UnitChip[] = [
  { id: "g", label: null },
  { id: "p1", label: LONG, grams: 125 },
];

function Harness({ layout }: { layout?: "stacked" | "beside" }): ReactElement {
  const [unit, setUnit] = useState("g");
  return (
    <AmountField
      id="amount"
      chips={CHIPS}
      unit={unit}
      amount="1234,5"
      onUnit={(chip) => setUnit(chip.id)}
      onAmount={jest.fn()}
      error={undefined}
      autoFocus={false}
      layout={layout}
    />
  );
}

describe("AmountField", () => {
  it("cuts a long portion at its row's width among the unit chips", () => {
    render(<Harness />);
    for (const chip of within(screen.getByRole("radiogroup")).getAllByRole("radio")) {
      expect(chip.className.split(" ")).toEqual(expect.arrayContaining(["max-w-full", "truncate"]));
    }
  });

  // "1234,5" is 58 px in the mono face. Beside "portions" a 9rem field left it 40.
  it("beside its label, is 11rem in grams and in portions alike, so a switch moves nothing", () => {
    render(<Harness layout="beside" />);
    const box = () => screen.getByRole("textbox", { name: "Amount" }).parentElement!.className.split(" ");
    const inGrams = box();
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(LONG) }));
    expect(screen.getByRole("radio", { name: new RegExp(LONG) })).toHaveAttribute("aria-checked", "true");
    expect(box()).toEqual(inGrams);
    expect(inGrams).toContain("w-44");
  });
});
