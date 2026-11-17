import { queryWrapper } from "@/__tests__/helpers/queryClient";
import {
  addPortion,
  createFood,
  deleteFood,
  deletePortion,
  getFavouriteFoods,
  getFood,
  getOwnFoods,
  searchFoods,
  setFavourite,
  updateFood,
  updatePortion,
} from "@/lib/api/foods";
import type { FoodDetail, FoodSummary } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, type RenderResult } from "@testing-library/react";
import { FoodSheet, SEARCH_DEBOUNCE_MS } from "../FoodSheet";
import { detailOf, fakeLogActions, favouriteOf, fineliFood, listsInPlace, refusal, SHEET_DATE } from "./support";

// A fake server behind the food sheet, for the suites that check what the
// sheet shows right after the user's own write, while the reads that follow
// it are still out. Every read can be held, so a test sees what the cache
// alone puts on screen.
//
// A suite that uses it mocks `next/navigation` and every function of
// `@/lib/api/foods` itself, because `jest.mock` applies to the file that
// calls it, and calls `installServer()` in a `beforeEach`.

/** The server's state: every food by id, what this user marked, and whether reads hang. */
export const server = {
  foods: {} as Record<string, FoodDetail>,
  favouriteIds: [] as string[],
  /** While true, every read hangs, as on a slow phone network. */
  holdReads: false,
};

const hang = <T,>(answer: () => T): Promise<T> =>
  server.holdReads ? new Promise<T>(() => {}) : Promise.resolve().then(answer);
const summaries = () =>
  Object.values(server.foods).map(({ barcode: _b, fineli: _f, portions: _p, lastAmount: _l, ...s }) => s);
const withStar = (f: FoodSummary): FoodSummary => ({ ...f, isFavourite: server.favouriteIds.includes(f.id) });
/** Favourites first, as the server ranks, then the order the foods were made in. */
const ranked = (list: FoodSummary[]) =>
  [...list.map(withStar)].sort((a, b) => Number(b.isFavourite) - Number(a.isFavourite));
const finnish = new Intl.Collator("fi");

export const quarks = [
  fineliFood("Rahka, maustettu"),
  fineliFood("Rahka, maustamaton"),
  fineliFood("Rahka, vaniljalla"),
];

/** Puts the three quarks on the server and answers every call from its state. */
export function installServer(): void {
  server.holdReads = false;
  server.foods = Object.fromEntries(quarks.map((q) => [q.id, detailOf(q)]));
  server.favouriteIds = [];
  jest
    .mocked(searchFoods)
    .mockReset()
    .mockImplementation((q) =>
      hang(() => ({
        foods: ranked(summaries().filter((f) => q.split(" ").every((w) => f.name.toLowerCase().includes(w)))),
      })),
    );
  jest
    .mocked(getFavouriteFoods)
    .mockReset()
    .mockImplementation(() =>
      hang(() => ({ foods: server.favouriteIds.map((id) => favouriteOf(server.foods[id])).reverse() })),
    );
  jest
    .mocked(getOwnFoods)
    .mockReset()
    .mockImplementation(() =>
      hang(() => ({
        foods: summaries()
          .filter((f) => f.isOwn)
          .sort((a, b) => finnish.compare(a.name, b.name))
          .map(withStar),
      })),
    );
  jest
    .mocked(getFood)
    .mockReset()
    .mockImplementation((id) =>
      server.holdReads
        ? new Promise(() => {})
        : server.foods[id]
          ? Promise.resolve({ ...server.foods[id], isFavourite: server.favouriteIds.includes(id) })
          : Promise.reject(refusal(404, "food_not_found")),
    );
  jest
    .mocked(setFavourite)
    .mockReset()
    .mockImplementation(async (id, on) => {
      server.favouriteIds = server.favouriteIds.filter((f) => f !== id);
      if (on) server.favouriteIds.push(id);
    });
  jest
    .mocked(deleteFood)
    .mockReset()
    .mockImplementation(async (id) => {
      delete server.foods[id];
    });
  jest.mocked(createFood).mockReset();
  jest.mocked(updateFood).mockReset();
  jest.mocked(addPortion).mockReset();
  jest.mocked(updatePortion).mockReset();
  jest.mocked(deletePortion).mockReset();
}

/** Puts the user's own food on the server. */
export function addOwn(food: FoodDetail): void {
  server.foods[food.id] = food;
}

export function renderSheet(client?: QueryClient): RenderResult {
  return render(
    <FoodSheet open onClose={jest.fn()} returnFocusTo={null} date={SHEET_DATE} actions={fakeLogActions()} />,
    client ? { wrapper: queryWrapper(client) } : {},
  );
}

export const dialog = () => screen.getAllByRole("dialog")[0];
export const field = () => screen.getByLabelText("Search foods and meals") as HTMLInputElement;
export const type = (value: string) => fireEvent.change(field(), { target: { value } });
export const body = () => dialog().querySelector<HTMLElement>("[data-sheet-body]")!;

/** Long enough for the debounce to settle, an answer to land and the query client's batched notice to render. */
export async function settle(): Promise<void> {
  await act(() => new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 100)));
  for (let i = 0; i < 3; i += 1) await act(() => new Promise((r) => setTimeout(r, 0)));
}

export const rowNames = () =>
  Array.from(body().querySelectorAll<HTMLElement>("[data-food-row]")).map(
    (row) => row.querySelector("span span")!.textContent,
  );
export const back = () => fireEvent.click(screen.getByRole("button", { name: "Back" }));

export async function openDetail(name: string) {
  const row = await screen.findByRole("button", { name: new RegExp(`^${name}`) });
  await listsInPlace();
  fireEvent.click(row);
  return screen.findByRole("button", { name: "Back" });
}
