import { FoodSheet } from "@/components/foods/FoodSheet";
import { detailOf, fineliFood, listsInPlace } from "@/components/foods/__tests__/support";
import { getFood } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { loosely } from "./logHarness";

// While the app asks the server for today, every write control of the log
// sheet waits, and Back and closing stay free.

jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn() }));
jest.mock("@/lib/api/recipes", () => ({ getRecipes: jest.fn().mockResolvedValue({ recipes: [] }) }));
jest.mock("@/lib/api/savedMeals", () => ({
  getSavedMeals: jest.fn().mockResolvedValue({ meals: [] }),
  createSavedMeal: jest.fn(),
  saveAndLog: jest.fn(),
  updateSavedMeal: jest.fn(),
  setSavedMealArchived: jest.fn(),
  deleteSavedMeal: jest.fn(),
}));
jest.mock("@/lib/api/foods", () => ({
  getFood: jest.fn(),
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn().mockResolvedValue({ foods: [] }),
  getOwnFoods: jest.fn().mockResolvedValue({ foods: [] }),
  setFavourite: jest.fn(),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));

const quark = fineliFood("Quark");

beforeEach(() => {
  jest
    .mocked(getRecents)
    .mockResolvedValue({ items: [{ kind: "food", food: quark, last: { grams: 250, portion: null } }] });
  jest.mocked(getFood).mockResolvedValue(detailOf(quark));
});

it("holds '+' and Log while the app asks for today, and Back still works", async () => {
  const actions = { add: jest.fn(), saveAndLog: jest.fn(), withdrawAdd: jest.fn(), holding: true };
  const onClose = jest.fn();
  render(<FoodSheet open onClose={onClose} returnFocusTo={null} date="2026-11-16" actions={actions} />);
  const again = await screen.findByRole("button", { name: loosely("Log Quark again, 250 g") });
  expect(again).toHaveAttribute("aria-disabled", "true");
  // The rows in place, so it is the hold that stops the press.
  await listsInPlace();
  fireEvent.click(again);
  fireEvent.click(screen.getByRole("button", { name: /^Quark/ }));
  const back = await screen.findByRole("button", { name: "Back" });
  const log = screen.getByRole("button", { name: "Log" });
  expect(log).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(log);
  fireEvent.submit(document.querySelector("[data-log-block]")!);
  await act(async () => {});
  expect(actions.add).not.toHaveBeenCalled();
  fireEvent.click(back);
  expect(await within(screen.getByRole("dialog")).findByRole("region", { name: "Recent" })).toBeInTheDocument();
});
