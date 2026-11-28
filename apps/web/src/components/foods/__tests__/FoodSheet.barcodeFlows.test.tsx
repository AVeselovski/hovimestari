import { createTestQueryClient, queryWrapper, registerTestQueryClient } from "@/__tests__/helpers/queryClient";
import { holdSheetExits, openSheet } from "@/__tests__/sheet";
import { createFood, getFood, searchFoods, setFavourite } from "@/lib/api/foods";
import { getSavedMeals } from "@/lib/api/savedMeals";
import type { FoodDetail } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FoodSheet } from "../FoodSheet";
import { answerWith, installLookups, keepProduct, lookups, releaseLookups } from "./barcodeServer";
import { addOwn, back, body, dialog, installServer, renderSheet, settle, type } from "./foodSheetServer";
import { detailOf, fakeLogActions, offFood, ownFood, SHEET_DATE } from "./support";

// The log sheet's barcode lookup, from a press to the food: a found food's
// view and the held row Back shows, the own-food form from the label and the
// turn to found after its save, Copy to my foods, a log, and the searches
// a newly visible product makes stale. The fake server answers what it holds
// when it answers and remembers what it was sent (./barcodeServer.ts).

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn().mockResolvedValue({ items: [] }) }));
jest.mock("@/lib/api/recipes", () => ({ getRecipes: jest.fn().mockResolvedValue({ recipes: [] }) }));
jest.mock("@/lib/api/savedMeals", () => ({
  getSavedMeals: jest.fn(),
  createSavedMeal: jest.fn(),
  saveAndLog: jest.fn(),
  updateSavedMeal: jest.fn(),
  setSavedMealArchived: jest.fn(),
  deleteSavedMeal: jest.fn(),
}));
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

jest.setTimeout(15_000);

const CODE = "6408430000258";
const NOTE = "Check each value against the label. Some came from Open Food Facts.";
const milk: FoodDetail = offFood("Eila laktoositon kevytmaitojuoma, Valio", CODE, {
  per100g: { energyKcal: 39, proteinG: 3.3, carbsG: 3.125, fatG: 1.5 },
});

beforeEach(() => {
  installServer();
  installLookups();
  jest.mocked(getSavedMeals).mockReset().mockResolvedValue({ meals: [] });
});

const block = () => body().querySelector<HTMLElement>("[data-barcode-result]");
const press = (name: string) => fireEvent.click(within(block()!).getByRole("button", { name }));
const foodHeading = () => within(dialog()).queryByRole("heading", { level: 2, name: milk.name });
const heldRow = () => block()?.querySelector<HTMLElement>('[data-list="barcode"] [data-food-row]') ?? null;
const ownSheet = () => openSheet("New food");
const input = (sheet: HTMLElement, label: string) => within(sheet).getByLabelText(label) as HTMLInputElement;
const saveFood = (sheet: HTMLElement) => fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));

async function lookUpFound(): Promise<void> {
  keepProduct(CODE, milk);
  renderSheet();
  type(CODE);
  press("Look up");
  await waitFor(() => expect(foodHeading()).not.toBeNull());
}

describe("FoodSheet, a barcode found", () => {
  it("opens the food view, and Back shows the held row, focused, with no request", async () => {
    await lookUpFound();
    expect(within(dialog()).getByRole("button", { name: "Back" })).toHaveFocus();
    back();
    await waitFor(() => expect(heldRow()).not.toBeNull());
    expect(heldRow()).toHaveFocus();
    expect(block()!.firstElementChild).toHaveTextContent(`Barcode ${CODE}`);
    expect(block()!.querySelector("[aria-live]")).toHaveTextContent(`Found ${milk.name}.`);
    expect(lookups.sent).toEqual([CODE]);
    // The row opens the food again, still with no lookup.
    fireEvent.click(heldRow()!);
    await waitFor(() => expect(foodHeading()).not.toBeNull());
    expect(lookups.sent).toEqual([CODE]);
  });

  it("finds the user's own food with that barcode first", async () => {
    const own = detailOf(ownFood("Oma maito"), { barcode: CODE });
    addOwn(own);
    keepProduct(CODE, milk);
    renderSheet();
    type(CODE);
    press("Look up");
    expect(await within(dialog()).findByRole("heading", { level: 2, name: "Oma maito" })).toBeInTheDocument();
  });

  it("names Open Food Facts, links to the product's page and to the credit, and offers no Edit", async () => {
    await lookUpFound();
    const link = await within(dialog()).findByRole("link", {
      name: "Open Food Facts, this product's page (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", `https://world.openfoodfacts.org/product/${CODE}`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(within(dialog()).getByRole("link", { name: "About the data" })).toHaveAttribute(
      "href",
      "/settings#food-data",
    );
    expect(link.closest("[data-food-source]")).toHaveTextContent(/^From Open Food Facts/);
    expect(within(dialog()).queryByRole("button", { name: "Edit food" })).toBeNull();
  });

  it("sends no second lookup on a food write while the answer shows (a star press)", async () => {
    await lookUpFound();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Favourite" }));
    await waitFor(() => expect(setFavourite).toHaveBeenCalledWith(milk.id, true));
    back();
    await waitFor(() => expect(heldRow()).not.toBeNull());
    await act(async () => {});
    expect(lookups.sent).toEqual([CODE]);
  });

  it("logs the found food by grams from its food view", async () => {
    keepProduct(CODE, milk);
    const actions = fakeLogActions();
    actions.add.mockResolvedValue({ announce: jest.fn() });
    render(<FoodSheet open onClose={jest.fn()} returnFocusTo={null} date={SHEET_DATE} actions={actions} />);
    type(CODE);
    press("Look up");
    await waitFor(() => expect(foodHeading()).not.toBeNull());
    fireEvent.change(within(dialog()).getByRole("textbox", { name: "Amount" }), { target: { value: "250" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Log" }));
    await waitFor(() =>
      expect(actions.add).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ kind: "food", foodId: milk.id, amount: { grams: 250 } }),
        }),
      ),
    );
  });

  it("Copy to my foods opens the form filled in, and saves a 3.125 g value untouched", async () => {
    await lookUpFound();
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Copy to my foods" }));
    const sheet = await waitFor(() => ownSheet()!);
    expect(input(sheet, "Name").value).toBe(milk.name);
    expect(input(sheet, "Barcode (optional)").value).toBe(CODE);
    expect(input(sheet, "Carbohydrates").value).toBe("3.125");
    expect(within(sheet).getByText(NOTE)).toBeInTheDocument();
    saveFood(sheet);
    await waitFor(() =>
      expect(createFood).toHaveBeenCalledWith({
        name: milk.name,
        barcode: CODE,
        per100g: { energyKcal: 39, proteinG: 3.3, carbsG: 3.125, fatG: 1.5 },
      }),
    );
    // The copy is the user's own, and from now on wins the lookup of that barcode.
    expect(await within(dialog()).findByText("My food")).toBeInTheDocument();
  });

  it("opens no food view for an answer that lands while the sheet closes", async () => {
    const release = holdSheetExits();
    try {
      lookups.hold = true;
      keepProduct(CODE, milk);
      const actions = fakeLogActions();
      const props = { onClose: jest.fn(), returnFocusTo: null, date: SHEET_DATE, actions };
      const view = render(<FoodSheet open {...props} />);
      type(CODE);
      press("Look up");
      await waitFor(() => expect(lookups.sent).toHaveLength(1));
      view.rerender(<FoodSheet open={false} {...props} />);
      await releaseLookups();
      await act(async () => {});
      expect(screen.queryByRole("button", { name: "Back", hidden: true })).toBeNull();
      expect(block()).not.toBeNull();
    } finally {
      release();
    }
  });
});

describe("FoodSheet, a barcode added from the label", () => {
  it("Complete it from the label opens the form with the barcode, the name and only the values that are numbers", async () => {
    answerWith(CODE, {
      result: "incomplete",
      barcode: CODE,
      reason: "missing_values",
      product: { name: "Eila, Valio", per100g: { energyKcal: 39, proteinG: null, carbsG: 4.9, fatG: 1.5 } },
    });
    renderSheet();
    type(CODE);
    press("Look up");
    fireEvent.click(await within(block()!).findByRole("button", { name: "Complete it from the label" }));
    const sheet = await waitFor(() => ownSheet()!);
    expect(input(sheet, "Name").value).toBe("Eila, Valio");
    expect(input(sheet, "Barcode (optional)").value).toBe(CODE);
    expect(["Energy", "Protein", "Carbohydrates", "Fat"].map((l) => input(sheet, l).value)).toEqual([
      "39",
      "",
      "4.9",
      "1.5",
    ]);
    expect(within(sheet).getByText(NOTE)).toBeInTheDocument();

    // Saved: the food view opens, and Back shows the new food as found, with no request.
    fireEvent.change(input(sheet, "Protein"), { target: { value: "3.3" } });
    saveFood(sheet);
    expect(await within(dialog()).findByRole("heading", { level: 2, name: "Eila, Valio" })).toBeInTheDocument();
    back();
    await waitFor(() => expect(heldRow()).toHaveTextContent("Eila, Valio"));
    expect(lookups.sent).toEqual([CODE]);
  });

  it("a shop's own barcode opens the form with no barcode and no note", async () => {
    answerWith(CODE, { result: "in_store", barcode: CODE });
    renderSheet();
    type(CODE);
    press("Look up");
    fireEvent.click(await within(block()!).findByRole("button", { name: "Add it from the label" }));
    const sheet = await waitFor(() => ownSheet()!);
    expect(input(sheet, "Barcode (optional)").value).toBe("");
    expect(input(sheet, "Name").value).toBe("");
    expect(within(sheet).queryByText(NOTE)).toBeNull();
  });

  it.each([
    ["the held barcode", CODE, true],
    ["another barcode", "6411401015090", false],
    ["no barcode", "", false],
  ])("saved with %s, the held answer turns found only when it matches", async (_what, barcode, found) => {
    renderSheet();
    type(CODE);
    press("Look up");
    fireEvent.click(await within(block()!).findByRole("button", { name: "Add it from the label" }));
    const sheet = await waitFor(() => ownSheet()!);
    expect(input(sheet, "Barcode (optional)").value).toBe(CODE);
    for (const [label, value] of [
      ["Name", "Maito"],
      ["Energy", "39"],
      ["Protein", "3.3"],
      ["Carbohydrates", "4.9"],
      ["Fat", "1.5"],
      ["Barcode (optional)", barcode],
    ]) {
      fireEvent.change(input(sheet, label), { target: { value } });
    }
    saveFood(sheet);
    expect(await within(dialog()).findByRole("heading", { level: 2, name: "Maito" })).toBeInTheDocument();
    back();
    await waitFor(() => expect(block()).not.toBeNull());
    if (found) {
      expect(heldRow()).toHaveTextContent("Maito");
    } else {
      expect(heldRow()).toBeNull();
      expect(block()).toHaveTextContent(`No food has the barcode ${CODE}.`);
    }
    expect(lookups.sent).toEqual([CODE]);
  });
});

describe("FoodSheet, after a lookup made a product visible", () => {
  async function searchFindsNothing(name: string): Promise<void> {
    type(name);
    await settle();
    await screen.findByText(`No food matches “${name}”.`);
  }

  it("reads the next search by name again, and finds the product", async () => {
    keepProduct(CODE, milk);
    renderSheet();
    await searchFindsNothing("eila");
    const before = jest.mocked(searchFoods).mock.calls.length;
    type(CODE);
    press("Look up");
    await waitFor(() => expect(foodHeading()).not.toBeNull());
    back();
    await waitFor(() => expect(block()).not.toBeNull());
    type("eila");
    await settle();
    expect(await screen.findByRole("button", { name: new RegExp(`^${milk.name}`) })).toBeInTheDocument();
    expect(jest.mocked(searchFoods).mock.calls.length).toBeGreaterThan(before);
  });

  it("does so also when the answer landed after the sheet closed", async () => {
    keepProduct(CODE, milk);
    const client = registerTestQueryClient(createTestQueryClient());
    const props = { onClose: jest.fn(), returnFocusTo: null, date: SHEET_DATE, actions: fakeLogActions() };
    const first = render(<FoodSheet open {...props} />, { wrapper: queryWrapper(client) });
    await searchFindsNothing("eila");
    lookups.hold = true;
    type(CODE);
    press("Look up");
    await waitFor(() => expect(lookups.sent).toHaveLength(1));
    first.unmount();
    await releaseLookups();
    await act(async () => {});
    jest.mocked(getFood).mockClear();

    render(<FoodSheet open {...props} />, { wrapper: queryWrapper(client) });
    type("eila");
    await settle();
    expect(await screen.findByRole("button", { name: new RegExp(`^${milk.name}`) })).toBeInTheDocument();
  });
});
