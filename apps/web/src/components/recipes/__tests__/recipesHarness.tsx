import { queryWrapper } from "@/__tests__/helpers/queryClient";
import { FakeDays, seededClient, serve } from "@/components/day/__tests__/harness";
import { TODAY } from "@/components/day/__tests__/support";
import { detailOf, ownFood, refusal, uuid } from "@/components/foods/__tests__/support";
import { TodayProvider } from "@/components/targets/TodayProvider";
import { ToastProvider, ToastRegion } from "@/components/ui/Toast";
import { deleteFood, getFood, getOwnFoods, updateFood } from "@/lib/api/foods";
import type { FoodDetail, FoodSummary, SavedMeal } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { RecipesTab } from "../RecipesTab";

// ---------------------------------------------------------------------------
// The Library's suites run the real page against `FakeDays`, which
// answers the saved meal routes as the server does, and a small store of own
// foods that answers the food routes. A suite mocks the API modules itself,
// because `jest.mock` applies to the file that calls it.
// ---------------------------------------------------------------------------

/** The user's own foods on the fake server, by id, kept in name order on read. */
export const foodStore = new Map<string, FoodDetail>();

const finnish = new Intl.Collator("fi");
const summaryOf = ({ barcode: _b, fineli: _f, portions: _p, lastAmount: _l, ...s }: FoodDetail): FoodSummary => s;

/** Puts `names` on the server as own foods and answers the food routes from the store. */
export function serveFoods(names: readonly string[], overrides: Partial<FoodSummary> = {}): FoodDetail[] {
  foodStore.clear();
  const foods = names.map((name) => detailOf(ownFood(name, overrides)));
  for (const food of foods) foodStore.set(food.id, food);
  jest.mocked(getOwnFoods).mockImplementation(async () => ({
    foods: [...foodStore.values()].map(summaryOf).sort((a, b) => finnish.compare(a.name, b.name)),
  }));
  jest.mocked(getFood).mockImplementation(async (id) => {
    const food = foodStore.get(id);
    if (!food) throw refusal(404, "food_not_found");
    return { ...food };
  });
  jest.mocked(updateFood).mockImplementation(async (id, body) => {
    const food = foodStore.get(id);
    if (!food) throw refusal(404, "food_not_found");
    const next: FoodDetail = {
      ...food,
      name: body.name,
      per100g: body.per100g,
      barcode: body.barcode ?? null,
    };
    foodStore.set(id, next);
    return { ...next };
  });
  jest.mocked(deleteFood).mockImplementation(async (id) => {
    foodStore.delete(id);
  });
  return foods;
}

export function savedMeal(name: string, source: string | null, overrides: Partial<SavedMeal> = {}): SavedMeal {
  return {
    id: uuid(),
    name,
    source,
    figures: { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 },
    archived: false,
    lastCount: null,
    ...overrides,
  };
}

/** A fake server with `meals` on it, behind the mocked saved meal and day routes. */
export function serveMeals(meals: readonly SavedMeal[]): FakeDays {
  const server = new FakeDays([]);
  for (const meal of meals) server.meals.set(meal.id, meal);
  // The recipes are the recipe server's (recipeServer.ts), which a suite puts up itself.
  serve(server, { recipes: false });
  return server;
}

export function RecipesHarness(): ReactElement {
  return (
    <TodayProvider>
      <ToastProvider>
        <RecipesTab />
        <ToastRegion />
      </ToastProvider>
    </TodayProvider>
  );
}

export function renderRecipes(client: QueryClient = seededClient()): { client: QueryClient; unmount: () => void } {
  const view = render(<RecipesHarness />, { wrapper: queryWrapper(client) });
  return { client, unmount: view.unmount };
}

/** Pins the device's clock to the fixtures' today, in the morning. */
export function pinClock(): jest.SpyInstance {
  return jest.spyOn(Date, "now").mockReturnValue(Date.parse(`${TODAY}T10:00:00Z`));
}

/** The section with this heading. */
export const section = (name: string): HTMLElement => screen.getByRole("region", { name });

/**
 * The names on the rows of `list` inside the section headed `heading`, in
 * order: the first line of a meal row's button, the first line inside a food
 * row's text column. Read from the DOM, so it also reads a list behind an
 * open sheet. A list outside that section reads as no rows.
 */
export function rowNames(heading: string, list: string): string[] {
  const title = [...document.querySelectorAll("section > h2")].find((h) => h.textContent === heading);
  const root = title?.parentElement?.querySelector<HTMLElement>(`[data-list="${list}"]`);
  if (!root) return [];
  return [...root.querySelectorAll("li")].map((li) => {
    const first = li.querySelector("button > span");
    const name = first?.firstElementChild?.tagName === "SPAN" ? first.firstElementChild : first;
    return name?.textContent ?? "";
  });
}

/** The top sheet on screen: the last modal dialog that is not a toast. */
export const topSheet = (): HTMLElement =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]:not([data-toast])')].at(-1)!;
