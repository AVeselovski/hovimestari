import { stubPhone } from "@/__tests__/formSheet";
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

/** The picker, whatever it is named: "Add ingredient" on its search, the food's name on its amount. */
const picker = () => screen.getAllByRole("dialog").at(-1)!;
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
    // A count of a portion is not weighed: the line goes with the grams.
    fireEvent.click(await within(picker()).findByRole("radio", { name: /^Medium piece/ }));
    expect(within(picker()).queryByText("Weigh it as it goes into the pot.")).toBeNull();
  });

  it("names the dialog after what it shows: the food on its amount, since the header's name is hidden from assistive technology", async () => {
    renderPicker();
    expect(screen.getByRole("dialog", { name: "Add ingredient" })).toBeInTheDocument();
    await pick("kananmuna", /^Kananmuna/);
    expect(screen.getByRole("dialog", { name: "Kananmuna, kuoreton" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Add ingredient" })).toBeNull();
    // The name shows on two lines, in the star's room.
    expect(picker().querySelector("[data-view-name]")!.className.split(/\s+/)).toContain("line-clamp-2");
  });

  it("puts focus in the search field after Back and after Change food on a phone, where no field focuses itself", async () => {
    const restore = stubPhone();
    try {
      renderPicker();
      await pick("feta", /^Fetajuusto/);
      const back = within(picker()).getByRole("button", { name: "Back" });
      back.focus();
      fireEvent.click(back);
      expect(search()).toHaveFocus();
      await pick("feta", /^Fetajuusto/);
      const change = within(picker()).getByRole("button", { name: "Change food" });
      change.focus();
      fireEvent.click(change);
      expect(search()).toHaveFocus();
    } finally {
      restore();
    }
  });

  it("says its favourites are the foods marked as favourites, with no word of a star it does not have", async () => {
    renderPicker();
    expect(await within(picker()).findByText("Foods you mark as favourites appear here.")).toBeInTheDocument();
    expect(within(picker()).queryByText(/star/)).toBeNull();
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
    // The amount first: the line is cut at the sheet's width, and the amount is what confirms the add.
    expect(status()?.replace(/\u00a0/g, " ")).toBe("Added 60 g of Fetajuusto.");
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

  it("refuses an amount it cannot read, and adds nothing", async () => {
    const h = renderPicker();
    await pick("feta", /^Fetajuusto/);
    fireEvent.change(amount(), { target: { value: "0" } });
    fireEvent.click(within(picker()).getByRole("button", { name: "Add" }));
    await act(async () => {});
    expect(amount()).toHaveAttribute("aria-invalid", "true");
    expect(amount()).toHaveFocus();
    expect(h.onAdd).not.toHaveBeenCalled();
  });

  it("says a written number needs a unit, at the unit, and that a number it cannot read is wrong, at the number", async () => {
    const h = renderPicker();
    await pick("feta", /^Fetajuusto/);
    fireEvent.change(amount(), { target: { value: "60" } });
    const number = within(picker()).getByLabelText("Number");
    const unit = within(picker()).getByLabelText("Unit");
    fireEvent.change(number, { target: { value: "2" } });
    fireEvent.click(within(picker()).getByRole("button", { name: "Add" }));
    await act(async () => {});
    expect(within(picker()).getByText("Choose a unit, or clear the number.")).toBeInTheDocument();
    expect(within(picker()).queryByText("Enter an amount above zero, with at most two decimals.")).toBeNull();
    expect(unit).toHaveAttribute("aria-invalid", "true");
    expect(number).not.toHaveAttribute("aria-invalid");
    expect(unit).toHaveFocus();
    fireEvent.change(unit, { target: { value: "clove" } });
    expect(within(picker()).queryByText("Choose a unit, or clear the number.")).toBeNull();
    fireEvent.change(number, { target: { value: "0" } });
    fireEvent.click(within(picker()).getByRole("button", { name: "Add" }));
    await act(async () => {});
    expect(within(picker()).getByText("Enter an amount above zero, with at most two decimals.")).toBeInTheDocument();
    expect(number).toHaveAttribute("aria-invalid", "true");
    expect(unit).not.toHaveAttribute("aria-invalid");
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
    // Named after the food it changes, never "Add ingredient".
    expect(screen.getByRole("dialog", { name: "Fetajuusto" })).toBeInTheDocument();
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
    expect(screen.getByRole("dialog", { name: "Add ingredient" })).toBeInTheDocument();
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
