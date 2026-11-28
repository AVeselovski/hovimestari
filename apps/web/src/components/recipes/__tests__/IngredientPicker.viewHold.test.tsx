import { tap } from "@/__tests__/helpers/tap";
import { detailOf, fineliFood, fineliPortion } from "@/components/foods/__tests__/support";
import { ARM_DELAY_MS } from "@/hooks/usePressGuard";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import type { FoodDetail } from "@hovimestari/types";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IngredientPicker, type IngredientPickerProps } from "../IngredientPicker";
import type { CountedDraft } from "../recipeDraft";

// The second tap of a double tap on a row lands in the amount the first tap
// opened, under the same finger. For the half second after a row opens it,
// a food's row in the search or a line of the editor, the amount's body and
// footer take no press: a portion chip keeps the unit, Add and Remove
// ingredient do nothing. The amount field focuses at once. After the half
// second every press works the first time. On a fake clock from the row's
// tap on.

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

const egg = fineliFood("Kananmuna, kuoreton", {
  per100g: { energyKcal: 134.17, proteinG: 12.61, carbsG: 0.4, fatG: 9.24 },
});
const eggPiece = fineliPortion("KPL_M", 55);
const details: Record<string, FoodDetail> = { [egg.id]: detailOf(egg, { portions: [eggPiece] }) };

beforeEach(() => {
  jest.mocked(searchFoods).mockResolvedValue({ foods: [egg], near: [] });
  jest.mocked(getFavouriteFoods).mockResolvedValue({ foods: [] });
  jest.mocked(getOwnFoods).mockResolvedValue({ foods: [] });
  jest.mocked(getFood).mockImplementation(async (id) => details[id]);
});
afterEach(() => jest.useRealTimers());

function renderPicker(props: Partial<IngredientPickerProps> = {}) {
  const handlers = { onClose: jest.fn(), onAdd: jest.fn(), onSave: jest.fn(), onRemove: jest.fn() };
  render(<IngredientPicker open returnFocusTo={null} recipeName="Shakshuka" editing={null} {...handlers} {...props} />);
  return handlers;
}

const picker = () => screen.getAllByRole("dialog").at(-1)!;
const amount = () => within(picker()).getByRole("textbox", { name: "Amount" }) as HTMLInputElement;
const chip = (name: RegExp) => within(picker()).getByRole("radio", { name });
const wait = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

/** Searches "kananmuna", then on a fake clock the first tap of a double tap on its row, and its portions landing. */
async function firstTap(): Promise<void> {
  fireEvent.change(within(picker()).getByLabelText("Search foods"), { target: { value: "kananmuna" } });
  await act(() => new Promise((r) => setTimeout(r, 400)));
  const row = await within(picker()).findByRole("button", { name: /^Kananmuna/ });
  jest.useFakeTimers();
  tap(row);
  expect(screen.getByRole("dialog", { name: egg.name })).toBeInTheDocument();
  // The portions land well inside the half second, as from the cache.
  for (let ms = 0; ms < 200 && within(picker()).queryByRole("radio", { name: /^Medium piece/ }) === null; ms += 10) {
    await wait(10);
  }
}

describe("The ingredient picker's amount, in the half second after a row opens it", () => {
  it("keeps grams on a second tap on a portion chip, and takes the chip after the half second", async () => {
    renderPicker();
    await firstTap();
    expect(chip(/^g$/)).toBeChecked();
    tap(chip(/^Medium piece/));
    expect(chip(/^g$/)).toBeChecked();
    expect(chip(/^Medium piece/)).not.toBeChecked();
    await wait(ARM_DELAY_MS);
    tap(chip(/^Medium piece/));
    expect(chip(/^Medium piece/)).toBeChecked();
  });

  it("adds nothing on a tap on Add inside the half second, and adds once after it", async () => {
    const h = renderPicker();
    await firstTap();
    fireEvent.change(amount(), { target: { value: "60" } });
    tap(within(picker()).getByRole("button", { name: "Add" }));
    expect(h.onAdd).not.toHaveBeenCalled();
    await wait(ARM_DELAY_MS);
    tap(within(picker()).getByRole("button", { name: "Add" }));
    expect(h.onAdd).toHaveBeenCalledTimes(1);
  });

  it("keeps focus in the amount on a tap inside the half second, and takes what is typed", async () => {
    renderPicker();
    await firstTap();
    // A new line's amount focuses itself as it opens.
    expect(amount()).toHaveFocus();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    await user.pointer({ keys: "[TouchA]", target: amount() });
    expect(amount()).toHaveFocus();
    await user.keyboard("2");
    expect(amount().value).toBe("2");
  });

  it("removes nothing on a second tap on Remove ingredient of a line the editor opened", async () => {
    jest.useFakeTimers();
    const line: CountedDraft = {
      kind: "counted",
      id: "00000000-0000-4000-8000-0000000000c3",
      food: { id: egg.id, name: egg.name, source: "fineli", per100g: egg.per100g, retired: false, deleted: false },
      grams: 110,
      portion: null,
      written: null,
      note: null,
    };
    const h = renderPicker({ editing: line });
    await wait(20);
    tap(within(picker()).getByRole("button", { name: "Remove ingredient" }));
    expect(h.onRemove).not.toHaveBeenCalled();
    await wait(ARM_DELAY_MS);
    tap(within(picker()).getByRole("button", { name: "Remove ingredient" }));
    expect(h.onRemove).toHaveBeenCalledWith(line.id);
  });
});
