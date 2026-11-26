import { createFood, updateFood } from "@/lib/api/foods";
import type { FoodDetail } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OwnFoodSheet, type OwnFoodSheetProps } from "../OwnFoodSheet";
import { detailOf, ownFood, refusal } from "./support";

// The macros' sum: protein, carbohydrates and fat together at most 101.5 g
// per 100 g. A refusal shows once, under Fat, and marks all three fields,
// each described by that one line. The values typed here use a point, which
// the field reads the same in every locale, so the suite needs no pinned one.

jest.mock("@/lib/api/foods", () => ({ createFood: jest.fn(), updateFood: jest.fn(), deleteFood: jest.fn() }));

// toHaveTextContent folds the no-break space before "g" into a plain one.
const SUM_LINE = "These three add up to more than 100 g.";
const MACROS = ["Protein", "Carbohydrates", "Fat"] as const;

const answered: FoodDetail = detailOf(ownFood("Pähkinäsekoitus"), {
  per100g: { energyKcal: 600, proteinG: 50, carbsG: 51, fatG: 0.5 },
});

// Stored past the API, before the rule: 300 g of macros in 100 g.
const overLimit: FoodDetail = detailOf(ownFood("Vanha virhe"), {
  per100g: { energyKcal: 400, proteinG: 100, carbsG: 100, fatG: 100 },
});

beforeEach(() => {
  jest.mocked(createFood).mockReset().mockResolvedValue(answered);
  jest.mocked(updateFood).mockReset().mockResolvedValue(answered);
});

const dialog = () => screen.getByRole("dialog", { name: /new food|edit food/i });
const input = (label: string) => within(dialog()).getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(input(label), { target: { value } });
const lineOf = (label: string) => document.getElementById(`${input(label).id}-line`)!;
const save = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Save food" }));
/** Lets a refused submit settle, as it does before a person's next press. */
const settle = () => act(async () => {});

function renderSheet(props: Partial<OwnFoodSheetProps> = {}): void {
  render(<OwnFoodSheet open returnFocusTo={null} onClose={jest.fn()} onSaved={jest.fn()} {...props} />);
}

function fill(protein: string, carbs: string, fat: string): void {
  type("Name", "Pähkinäsekoitus");
  type("Energy", "600");
  type("Protein", protein);
  type("Carbohydrates", carbs);
  type("Fat", fat);
}

/** The refusal on screen: one line under Fat, the three fields marked and described by it. */
function expectSumRefused(): void {
  expect(lineOf("Fat")).toHaveTextContent(SUM_LINE);
  expect(lineOf("Protein")).toBeEmptyDOMElement();
  expect(lineOf("Carbohydrates")).toBeEmptyDOMElement();
  for (const label of MACROS) {
    expect(input(label)).toHaveAttribute("aria-invalid", "true");
    expect(input(label).getAttribute("aria-describedby")!.split(" ")).toContain(lineOf("Fat").id);
  }
  expect(input("Energy")).not.toHaveAttribute("aria-invalid");
  expect(input("Name")).not.toHaveAttribute("aria-invalid");
  expect(input("Protein")).toHaveFocus();
  // The form's general line stays empty: the refusal belongs to the fields.
  expect(within(dialog()).getByRole("alert")).toBeEmptyDOMElement();
}

function expectNothingMarked(): void {
  for (const label of MACROS) {
    expect(input(label)).not.toHaveAttribute("aria-invalid");
  }
  // Fat reads its own line, always. The other two read it only while it holds the sum's refusal.
  for (const label of ["Protein", "Carbohydrates"]) {
    expect(input(label).getAttribute("aria-describedby")!.split(" ")).not.toContain(lineOf("Fat").id);
  }
  expect(lineOf("Fat")).toBeEmptyDOMElement();
}

describe("OwnFoodSheet, the macros' sum", () => {
  it("refuses three valid macros that add up to 101.501 g, under Fat, and sends nothing", async () => {
    renderSheet();
    // A third decimal goes on a value below 1: "37.201" would read as a thousands group.
    fill("50", "51", "0.501");
    save();
    await settle();
    expectSumRefused();
    expect(createFood).not.toHaveBeenCalled();
  });

  it("saves macros that add up to exactly 101.5 g", async () => {
    renderSheet();
    fill("50", "51", "0,5");
    save();
    await waitFor(() =>
      expect(createFood).toHaveBeenCalledWith(
        expect.objectContaining({ per100g: { energyKcal: 600, proteinG: 50, carbsG: 51, fatG: 0.5 } }),
      ),
    );
  });

  it.each(MACROS)("clears the refusal once %s is fixed and Save is pressed", async (label) => {
    let finish: (food: FoodDetail) => void = () => {};
    jest.mocked(createFood).mockReturnValue(new Promise((res) => (finish = res)));
    renderSheet();
    fill("50", "51", "0.6");
    save();
    await settle();
    expectSumRefused();
    type(label, label === "Fat" ? "0.5" : "49");
    save();
    try {
      await waitFor(() => expect(createFood).toHaveBeenCalledTimes(1));
      // Cleared as the save starts, while the request is still on its way.
      expectNothingMarked();
    } finally {
      await act(async () => finish(answered));
    }
  });

  it("puts the server's refusal in the same place as the form's own check", async () => {
    jest.mocked(createFood).mockRejectedValue(refusal(400, "food_macro_sum_too_high"));
    renderSheet();
    // Valid to the form: the server is the one that refuses.
    fill("30", "34", "37");
    save();
    await waitFor(() => expect(lineOf("Fat")).toHaveTextContent(SUM_LINE));
    expectSumRefused();
  });

  it("opens an over-limit food with its numbers, refuses a name-only edit, and saves once the numbers add up", async () => {
    renderSheet({ food: overLimit });
    expect(input("Protein")).toHaveValue("100");
    expect(input("Carbohydrates")).toHaveValue("100");
    expect(input("Fat")).toHaveValue("100");
    expectNothingMarked();

    // The user touched only the name. The line still says what is wrong with the numbers.
    type("Name", "Vanha virhe, korjattu");
    save();
    await waitFor(() => expect(lineOf("Fat")).toHaveTextContent(SUM_LINE));
    expectSumRefused();
    expect(updateFood).not.toHaveBeenCalled();

    type("Carbohydrates", "0");
    type("Fat", "0");
    save();
    await waitFor(() =>
      expect(updateFood).toHaveBeenCalledWith(overLimit.id, {
        name: "Vanha virhe, korjattu",
        per100g: { energyKcal: 400, proteinG: 100, carbsG: 0, fatG: 0 },
        barcode: null,
      }),
    );
  });

  it("keeps a macro's own refusal on that field alone", async () => {
    renderSheet();
    fill("100.5", "1", "0.5");
    save();
    await settle();
    expect(lineOf("Protein")).toHaveTextContent("Enter 0 to 100, three decimals at most.");
    expect(input("Protein")).toHaveAttribute("aria-invalid", "true");
    expect(input("Carbohydrates")).not.toHaveAttribute("aria-invalid");
    expect(input("Fat")).not.toHaveAttribute("aria-invalid");
    expect(lineOf("Fat")).toBeEmptyDOMElement();
  });
});
