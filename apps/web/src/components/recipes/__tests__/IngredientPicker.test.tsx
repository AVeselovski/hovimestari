import { detailOf, fineliFood, fineliPortion } from "@/components/foods/__tests__/support";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import type { FoodDetail } from "@hovimestari/types";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { IngredientPicker, type IngredientPickerProps } from "../IngredientPicker";
import type { CountedDraft } from "../recipeDraft";

// The ingredient picker on its own: a food's amount opens on grams with the
// field empty, Add returns to an empty search with focus in it and says what
// it added, a line opened to change has Save and Remove ingredient, and
// Change food keeps the amount typed.

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/recipes" }));
jest.mock("@/lib/api/foods", () => ({
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
  getFood: jest.fn(),
  createFood: jest.fn(),
  updateFood: jest.fn(),
  deleteFood: jest.fn(),
  setFavourite: jest.fn(),
  lookupBarcode: jest.fn(),
}));

const feta = fineliFood("Fetajuusto", { per100g: { energyKcal: 264, proteinG: 14.2, carbsG: 4.1, fatG: 21.3 } });
const egg = fineliFood("Kananmuna, kuoreton", {
  per100g: { energyKcal: 134.17, proteinG: 12.61, carbsG: 0.4, fatG: 9.24 },
});
const eggPiece = fineliPortion("KPL_M", 55);
const details: Record<string, FoodDetail> = {
  [feta.id]: detailOf(feta),
  [egg.id]: detailOf(egg, { portions: [eggPiece], lastAmount: { grams: 110, portion: { ...eggPiece, count: 2 } } }),
};

beforeEach(() => {
  jest.mocked(searchFoods).mockImplementation(async (q) => ({
    foods: [feta, egg].filter((f) => f.name.toLowerCase().startsWith(q.toLowerCase().slice(0, 4))),
  }));
  jest.mocked(getFavouriteFoods).mockResolvedValue({ foods: [] });
  jest.mocked(getOwnFoods).mockResolvedValue({ foods: [] });
  jest.mocked(getFood).mockImplementation(async (id) => details[id]);
});

function renderPicker(props: Partial<IngredientPickerProps> = {}) {
  const handlers = { onClose: jest.fn(), onAdd: jest.fn(), onSave: jest.fn(), onRemove: jest.fn() };
  render(<IngredientPicker open returnFocusTo={null} recipeName="Shakshuka" editing={null} {...handlers} {...props} />);
  return handlers;
}

const picker = () => screen.getByRole("dialog", { name: "Add ingredient" });
const search = () => within(picker()).getByLabelText("Search foods") as HTMLInputElement;
const amount = () => within(picker()).getByRole("textbox", { name: "Amount" }) as HTMLInputElement;
const status = () => picker().querySelector("[data-status-line]")!.textContent;
const settle = () => act(() => new Promise((r) => setTimeout(r, 400)));

async function pick(query: string, name: RegExp): Promise<void> {
  fireEvent.change(search(), { target: { value: query } });
  await settle();
  fireEvent.click(await within(picker()).findByRole("button", { name }));
}

describe("IngredientPicker", () => {
  it("opens a food's amount on grams with the field empty, not on the last amount logged", async () => {
    renderPicker();
    expect(status()).toBe("Adding to Shakshuka");
    await pick("kananmuna", /^Kananmuna/);
    expect(amount().value).toBe("");
    expect(within(picker()).getByRole("radio", { name: "g" })).toHaveAttribute("aria-checked", "true");
    expect(within(picker()).getByText("Enter an amount to see its figures.")).toBeInTheDocument();
    expect(within(picker()).getByText("Weigh it as it goes into the pot.")).toBeInTheDocument();
  });

  it("adds a line and goes back to an empty search, focus in the field, saying what it added", async () => {
    const h = renderPicker();
    await pick("feta", /^Fetajuusto/);
    fireEvent.change(amount(), { target: { value: "60" } });
    expect(within(picker()).getByText("For this amount")).toBeInTheDocument();
    fireEvent.change(within(picker()).getByLabelText("Note"), { target: { value: " crumbled " } });
    fireEvent.click(within(picker()).getByRole("button", { name: "Add" }));
    await act(async () => {});
    expect(h.onAdd).toHaveBeenCalledWith({
      kind: "counted",
      food: expect.objectContaining({ id: feta.id, name: "Fetajuusto", per100g: feta.per100g }),
      grams: 60,
      portion: null,
      written: null,
      note: "crumbled",
    });
    expect(h.onClose).not.toHaveBeenCalled();
    expect(search().value).toBe("");
    expect(search()).toHaveFocus();
    expect(status()?.replace(/ /g, " ")).toBe("Added Fetajuusto, 60 g.");
  });

  it("adds a count of a portion with its weight, and the recipe's own words for it", async () => {
    const h = renderPicker();
    await pick("kananmuna", /^Kananmuna/);
    fireEvent.click(await within(picker()).findByRole("radio", { name: /^Medium piece/ }));
    fireEvent.change(amount(), { target: { value: "4" } });
    fireEvent.change(within(picker()).getByLabelText("Number"), { target: { value: "4" } });
    fireEvent.change(within(picker()).getByLabelText("Unit"), { target: { value: "piece" } });
    fireEvent.click(within(picker()).getByRole("button", { name: "Add" }));
    await act(async () => {});
    expect(h.onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        grams: 220,
        portion: { id: eggPiece.id, unit: "KPL_M", name: null, count: 4 },
        written: { amount: 4, unit: "piece" },
      }),
    );
  });

  it("refuses an amount it cannot read, and a written amount without its unit, and adds nothing", async () => {
    const h = renderPicker();
    await pick("feta", /^Fetajuusto/);
    fireEvent.change(amount(), { target: { value: "0" } });
    fireEvent.change(within(picker()).getByLabelText("Number"), { target: { value: "2" } });
    fireEvent.click(within(picker()).getByRole("button", { name: "Add" }));
    await act(async () => {});
    expect(amount()).toHaveAttribute("aria-invalid", "true");
    expect(within(picker()).getByText("Enter an amount above zero, with at most two decimals.")).toBeInTheDocument();
    expect(h.onAdd).not.toHaveBeenCalled();
  });

  it("opens a line to change on its amount, with Save and Remove ingredient", async () => {
    const line: CountedDraft = {
      kind: "counted",
      id: "00000000-0000-4000-8000-0000000000c1",
      food: {
        id: feta.id,
        name: "Fetajuusto",
        source: "fineli",
        per100g: feta.per100g,
        retired: false,
        deleted: false,
      },
      grams: 60,
      portion: null,
      written: null,
      note: null,
    };
    const h = renderPicker({ editing: line });
    expect(status()).toBe("Changing an ingredient of Shakshuka");
    expect(amount().value).toBe("60");
    expect(within(picker()).queryByRole("button", { name: "Add" })).toBeNull();
    fireEvent.change(amount(), { target: { value: "100" } });
    fireEvent.click(within(picker()).getByRole("button", { name: "Save" }));
    expect(h.onSave).toHaveBeenCalledWith({ ...line, grams: 100 });
    expect(h.onClose).toHaveBeenCalled();
  });

  it("removes a line opened to change", () => {
    const line: CountedDraft = {
      kind: "counted",
      id: "00000000-0000-4000-8000-0000000000c2",
      food: {
        id: feta.id,
        name: "Fetajuusto",
        source: "fineli",
        per100g: feta.per100g,
        retired: false,
        deleted: false,
      },
      grams: 60,
      portion: null,
      written: null,
      note: null,
    };
    const h = renderPicker({ editing: line });
    fireEvent.click(within(picker()).getByRole("button", { name: "Remove ingredient" }));
    expect(h.onRemove).toHaveBeenCalledWith(line.id);
    expect(h.onClose).toHaveBeenCalled();
  });

  it("keeps the amount typed through Change food, in grams", async () => {
    const h = renderPicker();
    await pick("kananmuna", /^Kananmuna/);
    fireEvent.click(await within(picker()).findByRole("radio", { name: /^Medium piece/ }));
    fireEvent.change(amount(), { target: { value: "2" } });
    fireEvent.click(within(picker()).getByRole("button", { name: "Change food" }));
    await pick("feta", /^Fetajuusto/);
    expect(amount().value).toBe("110");
    expect(within(picker()).getByRole("radio", { name: "g" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(picker()).getByRole("button", { name: "Add" }));
    await act(async () => {});
    expect(h.onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ food: expect.objectContaining({ id: feta.id }), grams: 110 }),
    );
  });
});
