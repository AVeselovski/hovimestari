import { TEST_USER } from "@/__tests__/helpers/auth";
import { createTestQueryClient, deferred, registerTestQueryClient } from "@/__tests__/helpers/queryClient";
import { confirmArmed } from "@/__tests__/sheet";
import { addPortion, createFood, deleteFood, getFood, searchFoods, setFavourite, updateFood } from "@/lib/api/foods";
import { afterFoodNameLanguageChange } from "@/lib/invalidation";
import type { FoodDetail } from "@hovimestari/types";
import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { SEARCH_DEBOUNCE_MS } from "../FoodSheet";
import {
  addOwn,
  back,
  body,
  field,
  installServer,
  openDetail,
  quarks,
  renderSheet,
  rowNames,
  server,
  settle,
  type,
} from "./foodSheetServer";
import { detailOf, listsInPlace, ownFood, refusal } from "./support";

// What the food sheet shows right after the user's own write, while the
// reads that follow it are still out (./foodSheetServer.tsx), and where
// focus lands around a food that is gone.

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn().mockResolvedValue({ items: [] }) }));
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
afterEach(() => onlineManager.setOnline(true));

describe("FoodSheet, right after the user's own write, with the reads that follow it held", () => {
  it("an add from a search that found nothing: Back shows the new food at once, not the no-results line", async () => {
    const saved = detailOf(ownFood("Mummon pulla"), {
      per100g: { energyKcal: 350, proteinG: 8, carbsG: 50, fatG: 12 },
    });
    jest.mocked(createFood).mockImplementation(async () => {
      addOwn(saved);
      return saved;
    });
    renderSheet();
    type("Mummon pulla");
    expect(await screen.findByText("No food matches “Mummon pulla”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add “Mummon pulla” as your own food" }));
    const sheet = await screen.findByRole("dialog", { name: "New food" });
    for (const [label, value] of [
      ["Energy", "350"],
      ["Protein", "8"],
      ["Carbohydrates", "50"],
      ["Fat", "12"],
    ]) {
      fireEvent.change(within(sheet).getByLabelText(label), { target: { value } });
    }
    server.holdReads = true;
    fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
    await screen.findByRole("button", { name: "Back" });
    back();
    expect(field()).toHaveValue("Mummon pulla");
    expect(screen.queryByText("No food matches “Mummon pulla”.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /as your own food/ })).not.toBeInTheDocument();
    expect(rowNames()).toEqual(["Mummon pulla"]);
  });

  it("an edit: Back shows the new name and figures at once, in the results and in the own foods", async () => {
    const mine = detailOf(ownFood("Oma rahka"));
    addOwn(mine);
    const edited: FoodDetail = {
      ...mine,
      name: "Oma rahka, laktoositon",
      per100g: { ...mine.per100g, energyKcal: 70 },
    };
    jest.mocked(updateFood).mockImplementation(async () => {
      server.foods[mine.id] = edited;
      return edited;
    });
    renderSheet();
    // The own foods list is cached first, then the search.
    await screen.findByRole("button", { name: /^Oma rahka/ });
    type("oma rahka");
    await settle();
    await openDetail("Oma rahka");
    fireEvent.click(await screen.findByRole("button", { name: "Edit food" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit food" });
    fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: edited.name } });
    fireEvent.change(within(sheet).getByLabelText("Energy"), { target: { value: "70" } });
    server.holdReads = true;
    fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit food" })).not.toBeInTheDocument());
    back();
    expect(rowNames()).toEqual(["Oma rahka, laktoositon"]);
    expect(within(body()).getByText(/^70 kcal/)).toBeInTheDocument();
    type("");
    expect(rowNames()).toEqual(["Oma rahka, laktoositon"]);
  });

  it("a delete: the query typed again lists the food no more", async () => {
    const mine = detailOf(ownFood("Rahka, oma"));
    addOwn(mine);
    renderSheet();
    type("rahka");
    await settle();
    expect(rowNames()).toContain("Rahka, oma");
    await openDetail("Rahka, oma");
    fireEvent.click(screen.getByRole("button", { name: "Delete food" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Rahka, oma?" });
    await confirmArmed();
    server.holdReads = true;
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(field()).toHaveValue(""));
    type("rahka");
    await settle();
    expect(rowNames()).toEqual(["Rahka, maustettu", "Rahka, maustamaton", "Rahka, vaniljalla"]);
    expect(screen.queryByRole("button", { name: /^Rahka, oma/ })).not.toBeInTheDocument();
  });

  it("a favourite: Back keeps the order and the scroll, with the star in place, and reads nothing again", async () => {
    renderSheet();
    type("rahka");
    await settle();
    expect(rowNames()).toEqual(["Rahka, maustettu", "Rahka, maustamaton", "Rahka, vaniljalla"]);
    body().scrollTop = 120;
    await openDetail("Rahka, vaniljalla");
    fireEvent.click(screen.getByRole("button", { name: "Favourite" }));
    await waitFor(() => expect(setFavourite).toHaveBeenCalledWith(quarks[2].id, true));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Favourite" })).toHaveAttribute("aria-pressed", "true"),
    );
    // A read now would rank the favourite first and jump the list.
    await settle();
    back();
    await settle();
    expect(rowNames()).toEqual(["Rahka, maustettu", "Rahka, maustamaton", "Rahka, vaniljalla"]);
    expect(body().scrollTop).toBe(120);
    const row = screen.getByRole("button", { name: /^Rahka, vaniljalla/ });
    expect(within(row).getByText("Favourite")).toBeInTheDocument();
    expect(searchFoods).toHaveBeenCalledTimes(1);
  });

  it("a food-name language change: no food read cached before it can show while the next one is out", async () => {
    const client = registerTestQueryClient(createTestQueryClient());
    const first = renderSheet(client);
    type("rahka");
    await settle();
    expect(rowNames()).toContain("Rahka, maustettu");
    first.unmount();
    server.holdReads = true;
    await act(() => afterFoodNameLanguageChange(client, { ...TEST_USER, foodNameLanguage: "en" }));
    renderSheet(client);
    type("rahka");
    await settle();
    expect(screen.queryByText("Rahka, maustettu")).not.toBeInTheDocument();
    expect(screen.queryByText("Rahka, maustettu (en)")).not.toBeInTheDocument();
  });
});

describe("FoodSheet, a new name, with the reads that follow it held", () => {
  /** "Oma rahka" on the server, its detail open from the search "oma rahka", renamed to `name` and saved. */
  async function rename(name: string): Promise<void> {
    const mine = detailOf(ownFood("Oma rahka"));
    addOwn(mine);
    jest.mocked(updateFood).mockImplementation(async () => {
      server.foods[mine.id] = { ...mine, name };
      return server.foods[mine.id];
    });
    type("oma rahka");
    await settle();
    await openDetail("Oma rahka");
    fireEvent.click(await screen.findByRole("button", { name: "Edit food" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit food" });
    fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: name } });
    server.holdReads = true;
    fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit food" })).toBeNull());
    back();
  }

  it("a search the new name no longer matches does not come back with the renamed food in it", async () => {
    renderSheet();
    await rename("Kotijuusto");
    expect(field()).toHaveValue("oma rahka");
    // The search for "oma rahka" is read afresh: the lists show until it lands.
    expect(screen.getByRole("heading", { name: "Favourites" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "My foods" })).toBeInTheDocument();
    expect(screen.queryByText(/foods? found/)).toBeNull();
  });

  it("a search that found nothing for exactly the new name shows the food, and offers no add", async () => {
    renderSheet();
    type("kotijuusto");
    expect(await screen.findByText("No food matches “kotijuusto”.")).toBeInTheDocument();
    await rename("Kotijuusto");
    type("kotijuusto");
    await settle();
    expect(rowNames()).toEqual(["Kotijuusto"]);
    expect(screen.queryByRole("button", { name: /as your own food/ })).toBeNull();
  });

  it("a new food shows in My foods at once, in its place by name, also when the query was not its name", async () => {
    addOwn(detailOf(ownFood("Oma rahka")));
    addOwn(detailOf(ownFood("Äidin pulla")));
    const saved = detailOf(ownFood("Mummon pulla"));
    jest.mocked(createFood).mockImplementation(async () => {
      addOwn(saved);
      return saved;
    });
    renderSheet();
    const own = await screen.findByRole("region", { name: "My foods" });
    await waitFor(() => expect(within(own).getAllByRole("button")).toHaveLength(2));
    await listsInPlace();
    fireEvent.click(screen.getByRole("button", { name: "New food" }));
    const sheet = await screen.findByRole("dialog", { name: "New food" });
    for (const [label, value] of [
      ["Name", "Mummon pulla"],
      ["Energy", "350"],
      ["Protein", "8"],
      ["Carbohydrates", "50"],
      ["Fat", "12"],
    ]) {
      fireEvent.change(within(sheet).getByLabelText(label), { target: { value } });
    }
    server.holdReads = true;
    fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
    await screen.findByRole("button", { name: "Back" });
    back();
    const names = within(screen.getByRole("region", { name: "My foods" }))
      .getAllByRole("button")
      .map((b) => b.querySelector("span span")!.textContent);
    // Finnish order: ä after z.
    expect(names).toEqual(["Mummon pulla", "Oma rahka", "Äidin pulla"]);
  });
});

describe("FoodSheet, while typing", () => {
  it("shows the lists or results at every step of typing r, then ra, never a blank list", async () => {
    renderSheet();
    const shown = () => screen.queryByRole("heading", { name: "Favourites" }) !== null || rowNames().length > 0;
    await screen.findByRole("heading", { name: "Favourites" });
    type("r");
    expect(shown()).toBe(true);
    type("ra");
    expect(shown()).toBe(true);
    for (let ms = 0; ms < SEARCH_DEBOUNCE_MS + 100; ms += 10) {
      await act(() => new Promise((r) => setTimeout(r, 10)));
      expect([ms, shown()]).toEqual([ms, true]);
    }
    expect(rowNames()).toContain("Rahka, maustettu");
    type("r");
    expect(screen.getByRole("heading", { name: "Favourites" })).toBeInTheDocument();
  });

  it("names the same text in the no-results line and the Add button while the next query settles", async () => {
    renderSheet();
    type("xyzzy");
    expect(await screen.findByText("No food matches “xyzzy”.")).toBeInTheDocument();
    type("xyzzyq");
    const line = screen.queryByText(/^No food matches/);
    const button = screen.queryByRole("button", { name: /as your own food$/ });
    expect(line?.textContent).toBe("No food matches “xyzzy”.");
    expect(button).toHaveAccessibleName("Add “xyzzy” as your own food");
  });

  it("shares one search between texts that differ in case, and shows the text as typed", async () => {
    renderSheet();
    type("Rahka");
    await settle();
    type("rahka");
    await settle();
    expect(searchFoods).toHaveBeenCalledTimes(1);
    expect(searchFoods).toHaveBeenCalledWith("rahka", expect.anything());
    type("Xyzzy");
    expect(await screen.findByText("No food matches “Xyzzy”.")).toBeInTheDocument();
  });
});

describe("FoodSheet, a food that is gone and where focus lands", () => {
  it("shows Edit food only once the detail is there", async () => {
    const mine = detailOf(ownFood("Oma rahka"));
    addOwn(mine);
    const held = deferred<FoodDetail>();
    renderSheet();
    await screen.findByRole("button", { name: /^Oma rahka/ });
    jest.mocked(getFood).mockReturnValueOnce(held.promise);
    await openDetail("Oma rahka");
    expect(screen.queryByRole("button", { name: "Edit food" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete food" })).toBeInTheDocument();
    await act(async () => held.resolve(mine));
    expect(await screen.findByRole("button", { name: "Edit food" })).toBeInTheDocument();
  });

  it("focuses the search field after a delete from the detail", async () => {
    const mine = detailOf(ownFood("Oma rahka"));
    addOwn(mine);
    renderSheet();
    await openDetail("Oma rahka");
    fireEvent.click(screen.getByRole("button", { name: "Delete food" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Oma rahka?" });
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete Oma rahka?" })).toBeNull());
    await settle();
    expect(field()).toHaveFocus();
  });

  it("focuses the search field after a delete from the own-food sheet, which closes with it", async () => {
    const mine = detailOf(ownFood("Oma rahka"));
    addOwn(mine);
    renderSheet();
    await openDetail("Oma rahka");
    fireEvent.click(await screen.findByRole("button", { name: "Edit food" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit food" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Oma rahka?" });
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit food" })).toBeNull());
    await settle();
    expect(field()).toHaveFocus();
    expect(deleteFood).toHaveBeenCalledTimes(1);
  });

  it("treats a delete of a food already gone as done", async () => {
    const mine = detailOf(ownFood("Oma rahka"));
    addOwn(mine);
    jest.mocked(deleteFood).mockRejectedValueOnce(refusal(404, "food_not_found"));
    renderSheet();
    await openDetail("Oma rahka");
    fireEvent.click(screen.getByRole("button", { name: "Delete food" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Oma rahka?" });
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete Oma rahka?" })).toBeNull());
    expect(screen.queryByText("This food is no longer available.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Favourites" })).toBeInTheDocument();
  });

  it("focuses the search field when the opened food answers 404", async () => {
    renderSheet();
    type("rahka");
    await settle();
    delete server.foods[quarks[1].id];
    fireEvent.click(screen.getByRole("button", { name: /^Rahka, maustamaton/ }));
    expect(await screen.findByText("This food is no longer available.")).toBeInTheDocument();
    await settle();
    expect(field()).toHaveFocus();
    expect(screen.queryByRole("button", { name: /^Rahka, maustamaton/ })).toBeNull();
  });

  it.each([
    ["the own-food sheet's Save", "Edit food", "Save food"],
    ["the portion sheet's Save", "Add a portion", "Save"],
  ])("closes %s's sheet with the food sheet when the food is gone", async (_name, opener, save) => {
    const mine = detailOf(ownFood("Oma rahka"));
    addOwn(mine);
    jest.mocked(updateFood).mockRejectedValue(refusal(404, "food_not_found"));
    jest.mocked(addPortion).mockRejectedValue(refusal(404, "food_not_found"));
    renderSheet();
    await openDetail("Oma rahka");
    fireEvent.click(await screen.findByRole("button", { name: opener }));
    const sheet = await screen.findByRole("dialog", { name: opener === "Edit food" ? "Edit food" : "Add a portion" });
    if (opener !== "Edit food") {
      fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "Purkki" } });
      fireEvent.change(within(sheet).getByLabelText("Weight"), { target: { value: "200" } });
    }
    fireEvent.click(within(sheet).getByRole("button", { name: save }));
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    expect(screen.getByText("This food is no longer available.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    await settle();
    expect(field()).toHaveFocus();
  });
});
