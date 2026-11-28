import { stubPhone } from "@/__tests__/formSheet";
import { tap } from "@/__tests__/helpers/tap";
import { controlSheetAnimations } from "@/__tests__/sheet";
import { detailOf, favouriteOf, fineliFood } from "@/components/foods/__tests__/support";
import { ARM_DELAY_MS } from "@/hooks/useArmedAtRest";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IngredientPicker } from "../IngredientPicker";

// The picker slides up over the editor on a phone, under the finger that
// pressed Add ingredient. Its results take no press until it is at rest and
// half a second has passed, so the second tap of a double tap on Add
// ingredient opens no food. The rule is the log sheet's (`useArmedAtRest`).

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

const rahka = fineliFood("Rahka, maustamaton", { per100g: { energyKcal: 64, proteinG: 11, carbsG: 4, fatG: 0.2 } });

beforeEach(() => {
  jest.mocked(searchFoods).mockResolvedValue({ foods: [], near: [] });
  jest.mocked(getFavouriteFoods).mockResolvedValue({ foods: [favouriteOf(rahka)] });
  jest.mocked(getOwnFoods).mockResolvedValue({ foods: [] });
  jest.mocked(getFood).mockResolvedValue(detailOf(rahka));
});

function renderPicker(): void {
  render(
    <IngredientPicker
      open
      returnFocusTo={null}
      recipeName="Shakshuka"
      editing={null}
      onClose={jest.fn()}
      onAdd={jest.fn()}
      onSave={jest.fn()}
      onRemove={jest.fn()}
    />,
  );
}

const picker = () => screen.getAllByRole("dialog").at(-1)!;
const row = () => within(picker()).getByRole("button", { name: /^Rahka/ });
const amountOpen = () => within(picker()).queryByRole("textbox", { name: "Amount" });
const guard = () => picker().querySelector("[data-press-guard]");

describe("IngredientPicker while it slides in", () => {
  it("on a phone, its results take no tap while it slides in, also once the delay has passed, then a tap at rest opens the food", async () => {
    // The arm delay on a fake clock that also moves with real time, so the
    // reads still answer and the delay passes exactly when the test says.
    jest.useFakeTimers({ advanceTimers: true });
    const restorePhone = stubPhone();
    const animations = controlSheetAnimations();
    try {
      renderPicker();
      await within(picker()).findByRole("button", { name: /^Rahka/ });
      // Still sliding in: the second tap of a double tap on Add ingredient lands here.
      tap(row());
      await act(async () => {});
      expect(amountOpen()).toBeNull();
      expect(guard()).toHaveAttribute("data-press-guard", "waiting");
      // The delay passes: still sliding in, so still waiting.
      act(() => jest.advanceTimersByTime(ARM_DELAY_MS));
      expect(tap(row()).defaultPrevented).toBe(true);
      await act(async () => {});
      expect(amountOpen()).toBeNull();
      // The entry ends: at rest, armed.
      await waitFor(() => {
        animations.finish();
        expect(guard()).toHaveAttribute("data-press-guard", "armed");
      });
      tap(row());
      expect(await within(picker()).findByRole("textbox", { name: "Amount" })).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
      animations.restore();
      restorePhone();
    }
  });

  it("on a phone, its results take no tap once it is at rest until the delay has passed", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const restorePhone = stubPhone();
    const animations = controlSheetAnimations();
    try {
      renderPicker();
      await within(picker()).findByRole("button", { name: /^Rahka/ });
      // A quick entry, as with reduced motion: at rest inside a double tap.
      await act(async () => animations.finish());
      await act(async () => animations.finish());
      expect(tap(row()).defaultPrevented).toBe(true);
      await act(async () => {});
      expect(amountOpen()).toBeNull();
      expect(guard()).toHaveAttribute("data-press-guard", "waiting");
      act(() => jest.advanceTimersByTime(ARM_DELAY_MS));
      expect(guard()).toHaveAttribute("data-press-guard", "armed");
      tap(row());
      expect(await within(picker()).findByRole("textbox", { name: "Amount" })).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
      animations.restore();
      restorePhone();
    }
  });

  it("on a phone, Enter on a row counts once the picker is at rest, after a touch that turned into a scroll", async () => {
    const restorePhone = stubPhone();
    const animations = controlSheetAnimations();
    try {
      renderPicker();
      await within(picker()).findByRole("button", { name: /^Rahka/ });
      fireEvent.pointerDown(row());
      fireEvent.pointerCancel(row());
      await act(() => new Promise((r) => setTimeout(r, ARM_DELAY_MS)));
      await waitFor(() => {
        animations.finish();
        expect(guard()).toHaveAttribute("data-press-guard", "armed");
      });
      fireEvent.click(row());
      expect(await within(picker()).findByRole("textbox", { name: "Amount" })).toBeInTheDocument();
    } finally {
      animations.restore();
      restorePhone();
    }
  });

  it("from md, where it fades in centred and away from the finger, a tap on a row opens the food at once", async () => {
    renderPicker();
    await within(picker()).findByRole("button", { name: /^Rahka/ });
    expect(guard()).toBeNull();
    tap(row());
    expect(await within(picker()).findByRole("textbox", { name: "Amount" })).toBeInTheDocument();
  });
});
