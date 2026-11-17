import { describeFormSheetContract } from "@/__tests__/formSheet";
import { confirmArmed } from "@/__tests__/sheet";
import { createFood, deleteFood, updateFood } from "@/lib/api/foods";
import type { FoodDetail } from "@hovimestari/types";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OwnFoodSheet, type OwnFoodSheetProps } from "../OwnFoodSheet";
import { detailOf, ownFood, refusal } from "./support";

jest.mock("@/lib/api/foods", () => ({ createFood: jest.fn(), updateFood: jest.fn(), deleteFood: jest.fn() }));

const saved: FoodDetail = detailOf(ownFood("Mummon pulla"), {
  per100g: { energyKcal: 350, proteinG: 8.25, carbsG: 50, fatG: 12.125 },
  barcode: "6411401015090",
});

beforeEach(() => {
  jest.mocked(createFood).mockReset().mockResolvedValue(saved);
  jest.mocked(updateFood).mockReset().mockResolvedValue(saved);
  jest.mocked(deleteFood).mockReset().mockResolvedValue(undefined);
});

const dialog = () => screen.getByRole("dialog", { name: /a food|edit food/i });
const input = (label: string) => within(dialog()).getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(input(label), { target: { value } });
const lineOf = (label: string) => document.getElementById(`${input(label).id}-line`);
function fillValid(): void {
  type("Name", "Mummon pulla");
  type("Energy", "350");
  type("Protein", "8,25");
  type("Carbohydrates", "50");
  type("Fat", "0.125");
}

function renderSheet(props: Partial<OwnFoodSheetProps> = {}) {
  const handlers = { onClose: jest.fn(), onSaved: jest.fn(), onSavedFood: jest.fn(), onDeleted: jest.fn() };
  render(<OwnFoodSheet open returnFocusTo={null} {...handlers} {...props} />);
  return handlers;
}

const save = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Save food" }));

describe("OwnFoodSheet", () => {
  describeFormSheetContract({
    name: /add a food/i,
    renderSheet: (p) => <OwnFoodSheet {...p} />,
    type: () => type("Name", "Pulla"),
    typedField: () => input("Name"),
    fillValid,
    holdSave: () => {
      let resolve: () => void = () => {};
      let reject: () => void = () => {};
      jest.mocked(createFood).mockReturnValue(
        new Promise((res, rej) => {
          resolve = () => res(saved);
          reject = () => rej(refusal(500, "internal_error"));
        }),
      );
      return { resolve, reject };
    },
    firstField: () => input("Name"),
    saveName: /^save food$/i,
  });

  it("opens with every field empty and no placeholder, the name aside when the search typed one", () => {
    renderSheet({ initialName: "Mummon pulla" });
    expect(input("Name")).toHaveValue("Mummon pulla");
    for (const label of ["Energy", "Protein", "Carbohydrates", "Fat", "Barcode (optional)"]) {
      expect(input(label)).toHaveValue("");
    }
    for (const field of dialog().querySelectorAll("input")) expect(field).not.toHaveAttribute("placeholder");
    // No number anywhere in the form before the user types one, past the "100" of "Per 100 g".
    expect(dialog().querySelector("form")!.textContent!.replace("Per 100\u00a0g", "")).not.toMatch(/\d/);
  });

  it("is the tall sheet, so its top never moves when lines appear under the fields", () => {
    renderSheet();
    expect(dialog()).toHaveAttribute("data-sheet-size", "tall");
  });

  it("keeps two lines of room under every field, and puts each value beside its label", () => {
    renderSheet();
    for (const label of ["Name", "Energy", "Protein", "Carbohydrates", "Fat", "Barcode (optional)"]) {
      expect([label, lineOf(label)!.className.split(" ")]).toEqual([label, expect.arrayContaining(["min-h-10"])]);
    }
    for (const label of ["Energy", "Protein", "Carbohydrates", "Fat"]) {
      const row = input(label).parentElement!.parentElement!;
      expect(row.className.split(" ")).toEqual(expect.arrayContaining(["flex", "items-center"]));
      expect(row.querySelector("label")).toHaveAttribute("for", input(label).id);
      expect(input(label).parentElement!.className.split(" ")).toContain("w-36");
    }
  });

  it("sends the four values with a comma or a point, at the decimals each holds", async () => {
    const { onSavedFood, onSaved, onClose } = renderSheet();
    fillValid();
    type("Barcode (optional)", " 6411401015090 ");
    save();
    await waitFor(() =>
      expect(createFood).toHaveBeenCalledWith({
        name: "Mummon pulla",
        per100g: { energyKcal: 350, proteinG: 8.25, carbsG: 50, fatG: 0.125 },
        barcode: "6411401015090",
      }),
    );
    expect(onSavedFood).toHaveBeenCalledWith(saved);
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows each field's own line, and sends nothing", async () => {
    renderSheet();
    type("Name", "x");
    type("Energy", "1200");
    type("Protein", "1,5000");
    type("Fat", "abc");
    type("Barcode (optional)", "123");
    save();
    expect(lineOf("Name")).toHaveTextContent(
      "Use at least two letters or digits in a row, so search can find the food.",
    );
    expect(lineOf("Energy")).toHaveTextContent("Enter a number from 0 to 1000, with at most two decimals.");
    expect(lineOf("Protein")).toHaveTextContent("Enter a number from 0 to 100, with at most three decimals.");
    expect(lineOf("Carbohydrates")).toHaveTextContent("Enter a value from the label.");
    expect(lineOf("Fat")).toHaveTextContent("Enter a number from 0 to 100, with at most three decimals.");
    expect(lineOf("Barcode (optional)")).toHaveTextContent("A barcode has 8 to 14 digits.");
    expect(input("Name")).toHaveFocus();
    expect(createFood).not.toHaveBeenCalled();
  });

  it("refuses a value that may be a thousands group with a line that says so", () => {
    renderSheet();
    fillValid();
    type("Energy", "1,000");
    type("Carbohydrates", "1.500");
    save();
    const why = "This may mean thousands. Type it with no comma or point, or with fewer decimals.";
    expect(lineOf("Energy")).toHaveTextContent(why);
    expect(lineOf("Carbohydrates")).toHaveTextContent(why);
    expect(input("Energy")).toHaveFocus();
    expect(createFood).not.toHaveBeenCalled();
  });

  it("puts a taken barcode's refusal under the barcode", async () => {
    jest.mocked(createFood).mockRejectedValue(refusal(409, "barcode_taken"));
    renderSheet();
    fillValid();
    type("Barcode (optional)", "6411401015090");
    save();
    await waitFor(() =>
      expect(lineOf("Barcode (optional)")).toHaveTextContent("One of your foods already has this barcode."),
    );
    expect(input("Barcode (optional)")).toHaveFocus();
  });

  it("says the device is offline when a save fails offline, as every form sheet does", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      // What the browser gives a request with no network: no answer at all.
      jest
        .mocked(createFood)
        .mockRejectedValue(Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" }));
      renderSheet();
      fillValid();
      save();
      await waitFor(() =>
        expect(within(dialog()).getByRole("alert")).toHaveTextContent("You are offline. Changes need a connection."),
      );
    } finally {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    }
  });

  it("opens an edit with what was saved, keeps an untouched three-decimal value as saved, and sends the change", async () => {
    renderSheet({ food: saved });
    expect(screen.getByRole("dialog", { name: "Edit food" })).toBeInTheDocument();
    expect(input("Name")).toHaveValue("Mummon pulla");
    expect(input("Energy")).toHaveValue("350");
    expect(input("Fat")).toHaveValue("12.125");
    expect(input("Barcode (optional)")).toHaveValue("6411401015090");
    type("Name", "Mummon pulla, iso");
    save();
    await waitFor(() =>
      expect(updateFood).toHaveBeenCalledWith(saved.id, {
        name: "Mummon pulla, iso",
        per100g: saved.per100g,
        barcode: "6411401015090",
      }),
    );
  });

  it("edits the values of a food whose saved name search cannot find, and checks a new name", async () => {
    const odd = detailOf(ownFood("C"));
    renderSheet({ food: odd });
    type("Energy", "70");
    save();
    await waitFor(() => expect(updateFood).toHaveBeenCalledWith(odd.id, expect.objectContaining({ name: "C" })));
  });

  it("refuses a changed name search cannot find, under the name", async () => {
    renderSheet({ food: detailOf(ownFood("Oma rahka")) });
    type("Name", "D");
    save();
    expect(
      await within(dialog()).findByText("Use at least two letters or digits in a row, so search can find the food."),
    ).toBeInTheDocument();
    expect(updateFood).not.toHaveBeenCalled();
  });

  it("deletes an own food after asking, from the edit", async () => {
    const { onDeleted } = renderSheet({ food: saved });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Mummon pulla?" });
    expect(confirm).toHaveTextContent("This removes the food and its portions.");
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteFood).toHaveBeenCalledWith(saved.id));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("offers no Delete while adding", () => {
    renderSheet();
    expect(within(dialog()).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
