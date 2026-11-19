import type { FavouriteFood, FoodDetail, FoodSummary, Portion } from "@hovimestari/types";
import { waitFor } from "@testing-library/react";

export { refusal } from "@/components/targets/__tests__/support";

let ids = 0;
/** A UUID that differs per call and reads as one. */
export function uuid(): string {
  ids += 1;
  return `00000000-0000-4000-8000-${String(ids).padStart(12, "0")}`;
}

/** A Fineli food as a list shows it. */
export function fineliFood(name: string, overrides: Partial<FoodSummary> = {}): FoodSummary {
  return {
    id: uuid(),
    source: "fineli",
    name,
    otherName: `${name} (en)`,
    per100g: { energyKcal: 59.31, proteinG: 12.44, carbsG: 3.6, fatG: 0.2 },
    isFavourite: false,
    isOwn: false,
    retired: false,
    ...overrides,
  };
}

/** The user's own food as a list shows it. */
export function ownFood(name: string, overrides: Partial<FoodSummary> = {}): FoodSummary {
  return fineliFood(name, { source: "user", otherName: null, isOwn: true, ...overrides });
}

/** A product kept from Open Food Facts, as its detail: read-only, with its barcode. */
export function offFood(name: string, barcode: string, overrides: Partial<FoodDetail> = {}): FoodDetail {
  return detailOf(fineliFood(name, { source: "open_food_facts", otherName: null }), {
    barcode,
    fineli: null,
    ...overrides,
  });
}

/** A food's detail, from its summary. */
export function detailOf(food: FoodSummary, overrides: Partial<FoodDetail> = {}): FoodDetail {
  return {
    ...food,
    barcode: null,
    fineli: food.source === "fineli" ? { id: 622, type: "FOOD", process: "IND" } : null,
    portions: [],
    lastAmount: null,
    ...overrides,
  };
}

/** A favourite, as `GET /foods/favourites` answers it. */
export function favouriteOf(food: FoodSummary): FavouriteFood {
  return { ...food, isFavourite: true, lastAmount: null };
}

export function fineliPortion(unit: NonNullable<Portion["unit"]>, grams: number): Portion {
  return { id: uuid(), unit, name: null, grams, isOwn: false };
}

export function ownPortion(name: string, grams: number): Portion {
  return { id: uuid(), unit: null, name, grams, isOwn: true };
}

/** The log sheet's writes, for a suite about foods: nothing is held, and an add is a mock. */
export function fakeLogActions(): { add: jest.Mock; saveAndLog: jest.Mock; withdrawAdd: jest.Mock; holding: boolean } {
  return { add: jest.fn(), saveAndLog: jest.fn(), withdrawAdd: jest.fn(), holding: false };
}

/** The date the food suites open the log sheet on. */
export const SHEET_DATE = "2026-11-16";

/**
 * Waits until the log sheet's lists, where shown, take presses: every list
 * has its first answer and the rows are in place (components/log/heldList.tsx).
 * A press on a row in the render that first shows it is stopped, as a person's
 * would be in the frame before it is painted.
 */
export async function listsInPlace(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[data-lists-guard]:not([data-lists-guard="armed"])')).toBeNull());
}
