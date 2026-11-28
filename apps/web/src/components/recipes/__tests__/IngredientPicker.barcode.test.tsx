import { stubPhone } from "@/__tests__/formSheet";
import { guardArmed, openSheet, viewHoldPassed } from "@/__tests__/sheet";
import { answerWith, installLookups, keepProduct, lookups } from "@/components/foods/__tests__/barcodeServer";
import { addOwn, installServer, server } from "@/components/foods/__tests__/foodSheetServer";
import { installCamera, type FakeCamera } from "@/components/foods/__tests__/scannerFakes";
import { detailOf, offFood, ownFood } from "@/components/foods/__tests__/support";
import { createFood } from "@/lib/api/foods";
import type { FoodDetail } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IngredientPicker } from "../IngredientPicker";

// The ingredient picker and the barcode: Copy to my foods on an Open Food
// Facts food's amount (a Fineli food's, and the carried barcode, are in
// ./IngredientPicker.carried.test.tsx), and the barcode block's ways on from a miss, which the
// picker shares with the log sheet through the food finder. The fake server
// answers what it holds (components/foods/__tests__/barcodeServer.ts).

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/recipes" }));
jest.mock("@/lib/api/foods", () => ({
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
  getFood: jest.fn(),
  createFood: jest.fn(),
  updateFood: jest.fn(),
  deleteFood: jest.fn(),
  addPortion: jest.fn(),
  updatePortion: jest.fn(),
  deletePortion: jest.fn(),
  setFavourite: jest.fn(),
  lookupBarcode: jest.fn(),
}));
jest.mock("@/components/foods/scanner/decoder", () => ({ loadDecoder: jest.fn() }));

const CODE = "6416710030208";
const NOTE = "Check each value against the label. Some came from Open Food Facts.";
const oil: FoodDetail = offFood("Filos ladolia", CODE, {
  per100g: { energyKcal: 828, proteinG: 0, carbsG: 0, fatG: 92 },
});

let camera: FakeCamera | null = null;

beforeEach(() => {
  installServer();
  installLookups();
});
afterEach(() => {
  camera?.uninstall();
  camera = null;
});

function renderPicker(): void {
  render(
    <IngredientPicker
      open
      returnFocusTo={null}
      recipeName="Salaatti"
      editing={null}
      onClose={jest.fn()}
      onAdd={jest.fn()}
      onSave={jest.fn()}
      onRemove={jest.fn()}
    />,
  );
}

const picker = () => openSheet("Add ingredient") ?? screen.getAllByRole("dialog")[0];

const search = () => screen.getByLabelText("Search foods") as HTMLInputElement;
const block = () => document.querySelector<HTMLElement>("[data-barcode-result]");
const buttonIn = (name: string) => within(block()!).getByRole("button", { name });
const copyButton = () => screen.queryByRole("button", { name: "Copy to my foods" });

/** Looks `code` up in the picker's field, and waits for a miss. */
async function missOn(code: string): Promise<void> {
  fireEvent.change(search(), { target: { value: code } });
  fireEvent.click(buttonIn("Look up"));
  await waitFor(() => expect(block()).toHaveAttribute("data-barcode-result", "not_found"));
}

describe("IngredientPicker, Copy to my foods", () => {
  it("shows on an Open Food Facts food's amount once its detail is in, and opens the form filled in from it", async () => {
    keepProduct(CODE, oil);
    renderPicker();
    fireEvent.change(search(), { target: { value: CODE } });
    fireEvent.click(buttonIn("Look up"));
    // Found, the amount opens at once.
    expect(await screen.findByRole("dialog", { name: oil.name })).toBeInTheDocument();
    const copy = await waitFor(() => copyButton()!);
    await viewHoldPassed();
    fireEvent.click(copy);
    const sheet = await waitFor(() => openSheet("New food")!);
    const field = (label: string) => (within(sheet).getByLabelText(label) as HTMLInputElement).value;
    expect(field("Name")).toBe(oil.name);
    expect(field("Barcode (optional)")).toBe(CODE);
    expect(["Energy", "Protein", "Carbohydrates", "Fat"].map(field)).toEqual(["828", "0", "0", "92"]);
    expect(within(sheet).getByText(NOTE)).toBeInTheDocument();

    // Saved, the copy is the person's own food, and the picker opens its amount.
    fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
    await waitFor(() =>
      expect(createFood).toHaveBeenCalledWith({ name: oil.name, barcode: CODE, per100g: oil.per100g }),
    );
    await waitFor(() => expect(openSheet("New food")).toBeNull());
    const saved = Object.values(server.foods).find((f) => f.isOwn && f.barcode === CODE)!;
    expect(saved).toBeDefined();
    // The amount view is the saved food's, an own food, so it offers no copy.
    await waitFor(() => expect(copyButton()).toBeNull());
    expect(screen.getByRole("dialog", { name: oil.name })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Amount" })).toBeInTheDocument();
  });

  it("does not show on an own food", async () => {
    const food = detailOf(ownFood("Oma öljy"), { barcode: CODE });
    addOwn(food);
    renderPicker();
    fireEvent.change(search(), { target: { value: food.name.slice(0, 5).toLowerCase() } });
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${food.name}`) }));
    expect(await screen.findByRole("dialog", { name: food.name })).toBeInTheDocument();
    // Its detail is in, so the button would be there by now.
    await waitFor(() => expect(screen.getByRole("radio", { name: "g" })).toBeInTheDocument());
    await act(async () => {});
    expect(copyButton()).toBeNull();
  });
});

describe("IngredientPicker, the barcode block's ways on", () => {
  it("Search by name empties the field with the caret in it, within the press", async () => {
    answerWith(CODE, { result: "not_found", barcode: CODE });
    renderPicker();
    await missOn(CODE);
    const input = search();
    const press = buttonIn("Search by name");
    // Focus on the button, as a press leaves it, so focus in the field is the press's doing.
    press.focus();
    act(() => {
      press.click();
      expect(document.activeElement).toBe(input);
    });
    expect(input.value).toBe("");
    expect(block()).toBeNull();
    // The picker's own browse lists come back.
    expect(await within(picker()).findByText("Favourites")).toBeInTheDocument();
  });

  it("Scan again opens the scanner, and a read of the same code looks it up again", async () => {
    camera = installCamera();
    answerWith(CODE, { result: "not_found", barcode: CODE });
    renderPicker();
    await missOn(CODE);
    const first = block()!;
    fireEvent.click(buttonIn("Scan again"));
    await waitFor(() => expect(openSheet("Scan a barcode")).not.toBeNull());
    camera.reads = [{ text: CODE, format: undefined }];
    await waitFor(() => expect(lookups.sent).toEqual([CODE, CODE]));
    await waitFor(() => expect(first).toHaveAttribute("data-barcode-result", "not_found"));
    expect(block()).toBe(first);
    expect(search().value).toBe(CODE);
  });

  it("puts a phone's keyboard away on Look up, as Enter does, so the answer shows in full", async () => {
    const restore = stubPhone();
    try {
      answerWith(CODE, { result: "not_found", barcode: CODE });
      renderPicker();
      await guardArmed(picker);
      fireEvent.change(search(), { target: { value: CODE } });
      // jsdom's own blur hands Base UI's focus guard a related target that is no element, which a
      // browser never does, so the field's blur is recorded rather than run.
      const blur = jest.spyOn(search(), "blur").mockImplementation(() => {});
      fireEvent.click(buttonIn("Look up"));
      expect(blur).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(block()).toHaveAttribute("data-barcode-result", "not_found"));
    } finally {
      restore();
    }
  });

  it("keeps focus in the field on Look up from md up, where no keyboard covers the answer", async () => {
    answerWith(CODE, { result: "not_found", barcode: CODE });
    renderPicker();
    fireEvent.change(search(), { target: { value: CODE } });
    const blur = jest.spyOn(search(), "blur").mockImplementation(() => {});
    fireEvent.click(buttonIn("Look up"));
    await waitFor(() => expect(block()).toHaveAttribute("data-barcode-result", "not_found"));
    expect(blur).not.toHaveBeenCalled();
  });

  it("offers no Scan again where the browser cannot ask for a camera", async () => {
    answerWith(CODE, { result: "not_found", barcode: CODE });
    renderPicker();
    await missOn(CODE);
    expect(
      within(block()!)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Search by name", "Add it from the label"]);
  });
});
