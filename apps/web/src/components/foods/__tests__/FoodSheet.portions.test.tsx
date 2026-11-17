import { confirmArmed } from "@/__tests__/sheet";
import { addPortion, deletePortion, updatePortion } from "@/lib/api/foods";
import type { FoodDetail, Portion } from "@hovimestari/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { addOwn, body, installServer, openDetail, renderSheet, server, settle } from "./foodSheetServer";
import { detailOf, fineliPortion, ownFood, ownPortion } from "./support";

// A portion's own write shows in the food's detail at once, with the read
// that follows it held (./foodSheetServer.tsx). Only the write's answer can
// put it there.

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn().mockResolvedValue({ items: [] }) }));
jest.mock("@/lib/api/savedMeals", () => ({
  getSavedMeals: jest.fn().mockResolvedValue({ meals: [] }),
  createSavedMeal: jest.fn(),
  saveAndLog: jest.fn(),
  updateSavedMeal: jest.fn(),
  setSavedMealArchived: jest.fn(),
  deleteSavedMeal: jest.fn(),
}));
jest.mock("@/lib/api/foods", () => ({
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
  getFood: jest.fn(),
  createFood: jest.fn(),
  updateFood: jest.fn(),
  deleteFood: jest.fn(),
  addPortion: jest.fn(),
  updatePortion: jest.fn(),
  deletePortion: jest.fn(),
  setFavourite: jest.fn(),
}));

beforeEach(installServer);

/** The detail's portion rows, as label and weight. */
const portions = () =>
  Array.from(within(body()).getByRole("region", { name: "Portions" }).querySelectorAll("li")).map((li) =>
    li.textContent?.replace(/ /g, " "),
  );
const portionSheet = () => screen.getByRole("dialog", { name: /portion/i });
const fill = (name: string, grams: string) => {
  fireEvent.change(within(portionSheet()).getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(within(portionSheet()).getByLabelText("Weight"), { target: { value: grams } });
};

/** An own food with a Fineli-like measure and the user's "Purkki", on the server and opened in the sheet. */
async function openFood(): Promise<{ food: FoodDetail; tub: Portion }> {
  const tub = ownPortion("Purkki", 200);
  const food = detailOf(ownFood("Oma rahka"), { portions: [fineliPortion("DL", 120), tub] });
  addOwn(food);
  renderSheet();
  await openDetail("Oma rahka");
  await waitFor(() => expect(portions()).toEqual(["Decilitre120 g", "Purkki200 g"]));
  return { food, tub };
}

describe("FoodSheet, a portion's own write with the detail's read held", () => {
  it("an add shows the new portion in its place at once", async () => {
    const { food } = await openFood();
    const cup = ownPortion("Kuppi", 150);
    jest.mocked(addPortion).mockImplementation(async () => {
      server.foods[food.id].portions.push(cup);
      return cup;
    });
    fireEvent.click(screen.getByRole("button", { name: "Add a portion" }));
    await screen.findByRole("dialog", { name: "Add a portion" });
    fill("Kuppi", "150");
    server.holdReads = true;
    fireEvent.click(within(portionSheet()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add a portion" })).toBeNull());
    await settle();
    // The user's own portions sort by name, after Fineli's measures.
    expect(portions()).toEqual(["Decilitre120 g", "Kuppi150 g", "Purkki200 g"]);
  });

  it("an edit shows the changed portion at once, in place of the old one", async () => {
    const { tub } = await openFood();
    const edited: Portion = { ...tub, name: "Iso purkki", grams: 450 };
    jest.mocked(updatePortion).mockResolvedValue(edited);
    fireEvent.click(screen.getByRole("button", { name: "Edit Purkki" }));
    await screen.findByRole("dialog", { name: "Edit portion" });
    fill("Iso purkki", "450");
    server.holdReads = true;
    fireEvent.click(within(portionSheet()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit portion" })).toBeNull());
    await settle();
    expect(portions()).toEqual(["Decilitre120 g", "Iso purkki450 g"]);
  });

  it("a delete takes the portion off at once, so it cannot be opened again, and focuses Add a portion", async () => {
    await openFood();
    jest.mocked(deletePortion).mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Edit Purkki" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit portion" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this portion?" });
    await confirmArmed();
    server.holdReads = true;
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    await settle();
    expect(portions()).toEqual(["Decilitre120 g"]);
    expect(screen.queryByRole("button", { name: "Edit Purkki" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add a portion" })).toHaveFocus();
  });
});
