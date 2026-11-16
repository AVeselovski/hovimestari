import type { FavouriteFood, FoodDetail, FoodSummary, Portion } from "@hovimestari/types";

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
