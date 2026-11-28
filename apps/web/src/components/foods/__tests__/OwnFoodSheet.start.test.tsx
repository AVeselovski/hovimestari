import { createFood } from "@/lib/api/foods";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OwnFoodSheet, type OwnFoodSheetProps } from "../OwnFoodSheet";
import { startOf } from "../ownFoodForm";
import { detailOf, ownFood } from "./support";

// The own-food form opened on a start: what a barcode lookup brought back,
// or a kept Open Food Facts product copied to the person's own foods. A value
// left as it opened saves as the figure it came from, under the same checks
// as a typed one. The name is always a new name and is always checked.

jest.mock("@/lib/api/foods", () => ({ createFood: jest.fn(), updateFood: jest.fn(), deleteFood: jest.fn() }));

beforeEach(() => {
  jest
    .mocked(createFood)
    .mockReset()
    .mockResolvedValue(detailOf(ownFood("Saved")));
});

const dialog = () => screen.getByRole("dialog", { name: /new food/i });
const input = (label: string) => within(dialog()).getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(input(label), { target: { value } });
const save = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Save food" }));

function renderSheet(props: Partial<OwnFoodSheetProps> = {}) {
  render(<OwnFoodSheet open returnFocusTo={null} onClose={jest.fn()} {...props} />);
}

const NOTE = "Check each value against the label. Some came from Open Food Facts.";

describe("OwnFoodSheet opened on a start", () => {
  it("fills in the barcode, the name and only the values that are numbers, with the note", () => {
    renderSheet({
      start: {
        name: "Eila laktoositon, Valio",
        barcode: "6408430000258",
        per100g: { energyKcal: 39, proteinG: 3.3, carbsG: null, fatG: 1.5 },
        fromProduct: true,
      },
    });
    expect(input("Name").value).toBe("Eila laktoositon, Valio");
    expect(input("Barcode (optional)").value).toBe("6408430000258");
    expect([input("Energy").value, input("Protein").value, input("Carbohydrates").value, input("Fat").value]).toEqual([
      "39",
      "3.3",
      "",
      "1.5",
    ]);
    expect(within(dialog()).getByText(NOTE)).toBeInTheDocument();
    // The fieldset names the note, so a screen reader hears it with the values.
    const fieldset = dialog().querySelector("fieldset")!;
    const described = fieldset.getAttribute("aria-describedby")!.split(" ");
    expect(described.map((id) => document.getElementById(id)!.textContent)).toEqual([
      "Copy the values from the label.",
      NOTE,
    ]);
  });

  it("shows the plain hint alone for a start not from Open Food Facts", () => {
    renderSheet({ start: { barcode: "6408430000258" } });
    expect(within(dialog()).queryByText(NOTE)).toBeNull();
    expect(input("Name").value).toBe("");
    expect(input("Energy").value).toBe("");
  });

  it("saves an untouched three-decimal value as its figure, never refused as a thousands group", async () => {
    renderSheet({
      start: {
        name: "Rahka, Arla",
        barcode: "6408430000258",
        per100g: { energyKcal: 59.31, proteinG: 12.44, carbsG: 3.125, fatG: 0.2 },
      },
    });
    // As typed, "3.125" reads like a thousands group.
    expect(input("Carbohydrates").value).toBe("3.125");
    save();
    await waitFor(() =>
      expect(createFood).toHaveBeenCalledWith({
        name: "Rahka, Arla",
        barcode: "6408430000258",
        per100g: { energyKcal: 59.31, proteinG: 12.44, carbsG: 3.125, fatG: 0.2 },
      }),
    );
  });

  it.each([
    [{ energyKcal: 1200, proteinG: 10, carbsG: 30, fatG: 20 }, "Enter 0 to 1000, two decimals at most."],
    [{ energyKcal: 500, proteinG: 60, carbsG: 30, fatG: 20 }, "These three add up to more than 100 g."],
  ])("checks untouched values %j by the same ranges and sum as typed ones", async (per100g, line) => {
    renderSheet({ start: { name: "Odd product", per100g } });
    save();
    expect(await within(dialog()).findByText(line)).toBeInTheDocument();
    expect(createFood).not.toHaveBeenCalled();
  });

  it("reads a value the person changed as typed, with the usual thousands-group check", async () => {
    renderSheet({ start: { name: "Rahka", per100g: { energyKcal: 59, proteinG: 12, carbsG: 3.5, fatG: 0.2 } } });
    type("Carbohydrates", "3.125");
    save();
    expect(await within(dialog()).findByText("No comma or point, or fewer decimals.")).toBeInTheDocument();
    expect(createFood).not.toHaveBeenCalled();
  });

  it("checks a started name as a new name, even untouched", async () => {
    renderSheet({ start: { name: "D", per100g: { energyKcal: 59, proteinG: 12, carbsG: 3.5, fatG: 0.2 } } });
    save();
    expect(await within(dialog()).findByText("Search needs two letters or digits in a row.")).toBeInTheDocument();
    expect(createFood).not.toHaveBeenCalled();
  });
});

describe("startOf", () => {
  it("leaves out a value that is not a finite number", () => {
    const { values, ...baseline } = startOf({ per100g: { energyKcal: Number.NaN, proteinG: null, fatG: 2 } });
    expect([values.energy, values.protein, values.carbs, values.fat]).toEqual(["", "", "", "2"]);
    expect(baseline.per100g).toEqual({ fatG: 2 });
    expect(baseline.saved).toBe(false);
  });
});
