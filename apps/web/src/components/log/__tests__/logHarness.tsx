import { FakeDays, serve } from "@/components/day/__tests__/harness";
import { QUARK, TODAY, foodEntry } from "@/components/day/__tests__/support";
import { fineliFood, ownFood, uuid } from "@/components/foods/__tests__/support";
import type { FavouriteFood, FoodSummary, RecentItem, SavedMeal } from "@hovimestari/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

// ---------------------------------------------------------------------------
// The log sheet's suites run the real Day tab against `FakeDays`, which
// answers an add as the server does. This file builds the foods, meals and
// recent items those suites log, and the presses they share. A suite mocks
// the API modules itself, because `jest.mock` applies to the file that calls
// it.
// ---------------------------------------------------------------------------

/** A timeout as axios rejects it: the request may have landed. */
export const timeout = (): Error =>
  Object.assign(new Error("timeout of 10000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" });

export interface LogWorld {
  server: FakeDays;
  quark: FoodSummary;
  banana: FoodSummary;
  oats: FoodSummary;
  shake: SavedMeal;
  /** The banana's portion, 55 g a piece. */
  pieceId: string;
}

/**
 * A day with one entry, and on the server: quark last eaten as 250 g, banana
 * as 2 pieces of 55 g, a shake of 60 kcal and 8 g protein last eaten as 1,
 * in that order in the recent items. Oats are a favourite last eaten as 80 g.
 */
export function logWorld(): LogWorld {
  const server = new FakeDays([foodEntry("Oats", 80)]);
  const quark = fineliFood("Quark", { per100g: QUARK });
  const banana = fineliFood("Banana", { per100g: { energyKcal: 89, proteinG: 1.1, carbsG: 20, fatG: 0.3 } });
  const oats = fineliFood("Oats", { isFavourite: true });
  const pieceId = uuid();
  const shake: SavedMeal = {
    id: uuid(),
    name: "Shake",
    source: "Home",
    figures: { energyKcal: 60, proteinG: 8, carbsG: 3, fatG: 1 },
    archived: false,
    lastCount: 1,
  };
  for (const food of [quark, banana, oats]) server.foods.set(food.id, food);
  server.meals.set(shake.id, shake);
  server.portionGrams.set(pieceId, 55);
  const recents: RecentItem[] = [
    { kind: "food", food: quark, last: { grams: 250, portion: null } },
    { kind: "food", food: banana, last: { grams: 110, portion: { id: pieceId, unit: null, name: "Piece", count: 2 } } },
    { kind: "saved_meal", meal: shake, last: { count: 1 } },
  ];
  server.recents = recents;
  serve(server);
  return { server, quark, banana, oats, shake, pieceId };
}

/** The favourites `GET /foods/favourites` answers. */
export function favouritesOf(world: LogWorld): { foods: FavouriteFood[] } {
  return { foods: [{ ...world.oats, lastAmount: { grams: 80, portion: null } }] };
}

/** The own foods `GET /foods/own` answers: one never logged. */
export const ownFoods = (): { foods: FoodSummary[] } => ({ foods: [ownFood("Rye bread")] });

/** Waits for the day, then opens the log sheet from its launcher. */
export async function openLogSheet(label: RegExp = /^(Log food|Add to plan)$/): Promise<HTMLElement> {
  const launcher = await screen.findByRole("button", { name: label });
  await waitFor(() => expect(launcher).not.toHaveAttribute("aria-disabled"));
  fireEvent.click(launcher);
  const dialog = await screen.findByRole("dialog", { name: "Log food" });
  await within(dialog).findByRole("region", { name: "Recent" });
  return dialog;
}

/** The status line at the top of the open log sheet. */
export const statusLine = (): HTMLElement => document.querySelector<HTMLElement>("[data-status-line]")!;

/** `text` as an exact pattern in which a space also matches the no-break space before a unit. */
export const loosely = (text: string): RegExp =>
  new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s")}$`);

/** The first "+" with this accessible name: a saved meal's in the recent items comes before its row in the saved meals. */
export const plus = (name: string): HTMLElement => screen.getAllByRole("button", { name: loosely(name) })[0];

export { TODAY };
