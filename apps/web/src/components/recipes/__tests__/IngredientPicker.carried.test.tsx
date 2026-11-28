import { tap } from "@/__tests__/helpers/tap";
import { openSheet, viewHoldPassed } from "@/__tests__/sheet";
import { installLookups, lookups } from "@/components/foods/__tests__/barcodeServer";
import { addOwn, installServer, server } from "@/components/foods/__tests__/foodSheetServer";
import { detailOf, fineliFood, fineliPortion, refusal } from "@/components/foods/__tests__/support";
import { createFood, getFood } from "@/lib/api/foods";
import type { FoodDetail } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import messages from "../../../../messages/en.json";
import { IngredientPicker } from "../IngredientPicker";

// The ingredient picker carries the barcode of a scan that found nothing to
// the food saved as the person's own: Artur's olive oil in a recipe, ending
// on the copy's amount, and Add ending the carry. The fake server answers
// what it holds (components/foods/__tests__/barcodeServer.ts).

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

jest.setTimeout(15000);

const CODE = "6416710030208";
const line = messages.foods.sheet.carried.replace("<digits>{code}</digits>", CODE);
const oil: FoodDetail = detailOf(
  fineliFood("Oliiviöljy", { per100g: { energyKcal: 899.6, proteinG: 0, carbsG: 0, fatG: 99.875 } }),
  { portions: [fineliPortion("RKL", 13.5), fineliPortion("TL", 4.5)] },
);
const bread: FoodDetail = detailOf(fineliFood("Ruisleipä"));

let onAdd: jest.Mock;
beforeEach(() => {
  installServer();
  installLookups();
  addOwn(oil);
  addOwn(bread);
  onAdd = jest.fn();
  render(
    <IngredientPicker
      open
      returnFocusTo={null}
      recipeName="Salaatti"
      editing={null}
      onClose={jest.fn()}
      onAdd={onAdd}
      onSave={jest.fn()}
      onRemove={jest.fn()}
    />,
  );
});

const picker = () => screen.getAllByRole("dialog")[0];
const search = () => screen.getByLabelText("Search foods") as HTMLInputElement;
const block = () => document.querySelector<HTMLElement>("[data-barcode-result]");
const carried = () => picker().querySelector<HTMLElement>("[data-carried-line]");
const amount = () => within(picker()).getByRole("textbox", { name: "Amount" }) as HTMLInputElement;
const copyFound = () => within(picker()).findByRole("button", { name: /^Copy to my foods/ });

async function missThenSearch(): Promise<void> {
  fireEvent.change(search(), { target: { value: CODE } });
  fireEvent.click(within(block()!).getByRole("button", { name: "Look up" }));
  await waitFor(() => expect(block()).toHaveAttribute("data-barcode-result", "not_found"));
  fireEvent.click(within(block()!).getByRole("button", { name: "Search by name" }));
  // The search takes presses again once a double tap is over.
  await waitFor(() => expect(picker().querySelector('[data-press-guard="waiting"]')).toBeNull(), { timeout: 2000 });
}

async function openFood(text: string, name: string): Promise<void> {
  fireEvent.change(search(), { target: { value: text } });
  tap(await within(picker()).findByRole("button", { name: new RegExp(`^${name}`) }));
  await screen.findByRole("dialog", { name });
  await viewHoldPassed(picker);
}

describe("IngredientPicker, a copy button whose food's detail cannot be read", () => {
  it("waits while the detail is read, and goes when the read fails", async () => {
    let fail: (error: unknown) => void = () => {};
    jest.mocked(getFood).mockImplementation(() => new Promise((_resolve, reject) => (fail = reject)));
    await openFood("oliivi", "Oliiviöljy");
    const waiting = await copyFound();
    expect(waiting).toHaveAttribute("aria-disabled", "true");
    await act(async () => fail(refusal(500, "internal")));
    await waitFor(() => expect(within(picker()).queryByRole("button", { name: /^Copy to my foods/ })).toBeNull());
  });
});

describe("IngredientPicker, the olive oil", () => {
  it("carries the barcode to the copy and lands on the copy's amount with the grams typed", async () => {
    await missThenSearch();
    expect(within(carried()!).getByRole("status")).toHaveTextContent(line);
    await openFood("oliivi", "Oliiviöljy");
    fireEvent.change(amount(), { target: { value: "30" } });
    const copy = await copyFound();
    expect(copy).toHaveTextContent("Copy to my foods with the barcode");
    // One copy button in the view, under the amount form.
    expect(within(picker()).getAllByRole("button", { name: /^Copy to my foods/ })).toHaveLength(1);
    fireEvent.click(copy);
    const sheet = await waitFor(() => openSheet("New food")!);
    const field = (label: string) => within(sheet).getByLabelText(label) as HTMLInputElement;
    expect(field("Barcode (optional)").value).toBe(CODE);
    expect(within(sheet).getByRole("region", { name: "Portions" })).toHaveTextContent(/Tablespoon.*Teaspoon/);
    fireEvent.change(field("Fat"), { target: { value: "92" } });
    fireEvent.change(field("Name"), { target: { value: "Oliiviöljy Filos" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
    await waitFor(() =>
      expect(createFood).toHaveBeenCalledWith({
        name: "Oliiviöljy Filos",
        per100g: { ...oil.per100g, fatG: 92 },
        barcode: CODE,
        portions: [
          { name: "Tablespoon", grams: 13.5 },
          { name: "Teaspoon", grams: 4.5 },
        ],
      }),
    );
    // The amount is the copy's, an own food, which offers no copy, with the grams typed kept.
    expect(await screen.findByRole("dialog", { name: "Oliiviöljy Filos" })).toBeInTheDocument();
    expect(amount()).toHaveValue("30");
    await waitFor(() => expect(within(picker()).queryByRole("button", { name: /^Copy to my foods/ })).toBeNull());
    expect(server.foods[oil.id]).toEqual(oil);

    // Added, the picker is back on its search, carrying nothing, and the next lookup finds the copy.
    fireEvent.click(within(picker()).getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ grams: 30 }));
    await waitFor(() => expect(search()).toHaveValue(""));
    expect(carried()).toBeNull();
    fireEvent.change(search(), { target: { value: CODE } });
    fireEvent.click(within(block()!).getByRole("button", { name: "Look up" }));
    expect(await screen.findByRole("dialog", { name: "Oliiviöljy Filos" })).toBeInTheDocument();
    expect(lookups.sent).toEqual([CODE, CODE]);
  });
});

describe("IngredientPicker, Add", () => {
  it("ends the carry: a food added as it is leaves the barcode behind, and the next copy takes none", async () => {
    await missThenSearch();
    await openFood("ruis", "Ruisleipä");
    fireEvent.change(amount(), { target: { value: "40" } });
    fireEvent.click(within(picker()).getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(search()).toHaveValue(""));
    expect(carried()).toBeNull();
    await openFood("oliivi", "Oliiviöljy");
    expect(await copyFound()).toHaveTextContent(/^Copy to my foods$/);
  });
});
