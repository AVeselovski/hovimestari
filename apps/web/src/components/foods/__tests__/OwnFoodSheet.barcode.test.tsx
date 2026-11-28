import { createFood, updateFood } from "@/lib/api/foods";
import type { FoodDetail } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OwnFoodSheet, type OwnFoodSheetProps } from "../OwnFoodSheet";
import { detailOf, ownFood } from "./support";

// The own-food form's barcode: a new or changed barcode must have digits a
// barcode can have, checked on the phone before anything is sent, and a
// barcode the food already holds is kept on an edit whatever else changes,
// as the server rules. One code's 13 and 14-digit forms are one barcode.

jest.mock("@/lib/api/foods", () => ({ createFood: jest.fn(), updateFood: jest.fn(), deleteFood: jest.fn() }));

/** The Filos code with its last digit wrong. */
const WRONG = "6416710030209";
// The refusal alone, one row under the field at every width. The lookup block adds what to do about it.
const LINE = "No barcode has these digits.";

const holding = (barcode: string | null): FoodDetail =>
  detailOf(ownFood("Filos ladolia"), {
    per100g: { energyKcal: 828, proteinG: 0, carbsG: 0, fatG: 92 },
    barcode,
  });

beforeEach(() => {
  jest
    .mocked(createFood)
    .mockReset()
    .mockImplementation(async (body) => holding(body.barcode));
  jest
    .mocked(updateFood)
    .mockReset()
    .mockImplementation(async (_id, body) => holding(body.barcode));
});

const dialog = () => screen.getByRole("dialog", { name: /new food|edit food/i });
const input = (label: string) => within(dialog()).getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(input(label), { target: { value } });
const lineOf = (label: string) => document.getElementById(`${input(label).id}-line`);
const save = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Save food" }));

function renderSheet(props: Partial<OwnFoodSheetProps> = {}): void {
  render(<OwnFoodSheet open returnFocusTo={null} onClose={jest.fn()} onSavedFood={jest.fn()} {...props} />);
}

/** Saves, and lets the press settle, so a send would have happened. */
async function saveAndSettle(): Promise<void> {
  save();
  await act(async () => {});
}

describe("OwnFoodSheet's barcode", () => {
  it("refuses digits no barcode has on a new food, under the barcode, and sends nothing", async () => {
    renderSheet();
    type("Name", "Filos ladolia");
    for (const [label, value] of [
      ["Energy", "828"],
      ["Protein", "0"],
      ["Carbohydrates", "0"],
      ["Fat", "92"],
    ]) {
      type(label, value);
    }
    type("Barcode (optional)", WRONG);
    await saveAndSettle();
    expect(lineOf("Barcode (optional)")!.textContent).toBe(LINE);
    expect(input("Barcode (optional)")).toHaveFocus();
    expect(createFood).not.toHaveBeenCalled();
  });

  it("saves an 8-digit Lidl code on a new food", async () => {
    renderSheet({ start: { barcode: "20064020" } });
    type("Name", "Maito");
    for (const label of ["Energy", "Protein", "Carbohydrates", "Fat"]) type(label, "1");
    await saveAndSettle();
    await waitFor(() => expect(createFood).toHaveBeenCalledWith(expect.objectContaining({ barcode: "20064020" })));
  });

  const kept = holding(WRONG);
  it.each([
    ["only its protein changes", () => type("Protein", "0,5"), { ...kept.per100g, proteinG: 0.5 }, kept.name, WRONG],
    ["it is renamed", () => type("Name", "Filos oliiviöljy"), kept.per100g, "Filos oliiviöljy", WRONG],
    [
      "it is typed in its 14-digit form",
      () => type("Barcode (optional)", `0${WRONG}`),
      kept.per100g,
      kept.name,
      `0${WRONG}`,
    ],
  ])("keeps a bad barcode the food already holds when %s", async (_when, edit, per100g, name, barcode) => {
    renderSheet({ food: kept });
    edit();
    await saveAndSettle();
    await waitFor(() => expect(updateFood).toHaveBeenCalledWith(kept.id, { name, per100g, barcode }));
    expect(lineOf("Barcode (optional)")).toBeEmptyDOMElement();
  });

  it.each([
    ["another bad number", WRONG, "20064021"],
    ["a bad number, from a good one", "6416710030208", WRONG],
    ["a bad number, from none", null, WRONG],
  ])("refuses a barcode changed to %s, and sends nothing", async (_what, from, to) => {
    renderSheet({ food: holding(from) });
    type("Barcode (optional)", to);
    await saveAndSettle();
    expect(lineOf("Barcode (optional)")!.textContent).toBe(LINE);
    expect(updateFood).not.toHaveBeenCalled();
  });
});
