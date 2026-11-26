import { createTestQueryClient, deferred, registerTestQueryClient } from "@/__tests__/helpers/queryClient";
import { searchFoods } from "@/lib/api/foods";
import { queryKeys } from "@/lib/queryKeys";
import type { FoodSearchResult, FoodSummary } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { back, body, installServer, openDetail, renderSheet, rowNames, server, settle, type } from "./foodSheetServer";
import { detailOf, fineliFood, listsInPlace } from "./support";

// The search results' second list: the foods that hold all words but one of
// the text, which the server answers when few foods hold them all. Four
// states, by which of the two lists has rows, and what holds between them:
// the foods above the new heading stay where they were.

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

const QUERY = "jauheliha 10 nauta";
const NEAR_TITLE = "Other matches";
const mixed = fineliFood("Jauheliha, sika-nauta, rasvaa 10 %");
const fried = fineliFood("Jauheliha, sika-nauta, rasvaa 10 %, paistettu");
const beef9 = fineliFood("Jauheliha, naudanpaisti, rasvaa 9 %");
const beef17 = fineliFood("Jauheliha, naudan, rasvaa 17 %");
const beef7 = fineliFood("Jauheliha, naudan, vähärasvainen, rasvaa 7 %");
const beers = ["I", "II", "III", "IV A", "IV B", "alkoholiton"].map((kind) => fineliFood(`Olut, ${kind}`));

function answer(text: string, foods: FoodSummary[], near: FoodSummary[]): void {
  server.answers[text] = { foods, near };
  for (const food of [...foods, ...near]) server.foods[food.id] = detailOf(food);
}

async function search(text: string): Promise<void> {
  type(text);
  await settle();
  await waitFor(() => expect(spoken()).not.toBe(""));
}

const nearSection = () => within(body()).queryByRole("region", { name: NEAR_TITLE });
const nearNames = () => rowNames(nearSection()!);
const foodNames = () => rowNames(body().querySelector('[data-list="results"]')!);
const addButton = (text: string) => within(body()).queryByRole("button", { name: `Add “${text}” as your own food` });
/** What the search says politely: the paragraph that counts the foods. */
const spoken = () =>
  Array.from(body().querySelectorAll('p[aria-live="polite"]'))
    .map((p) => p.textContent)
    .filter(Boolean)
    .join(" ");
/** `a` comes before `b` in the document. */
const precedes = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  installServer();
});

describe("the search results, by which of the two lists has rows", () => {
  it("shows the list alone when no food is near, with no heading and no offer to add", async () => {
    renderSheet();
    await search("rahka");
    expect(foodNames()).toEqual(["Rahka, maustettu", "Rahka, maustamaton", "Rahka, vaniljalla"]);
    // Nothing leads the foods here, so the list carries their name itself.
    expect(within(body()).getByRole("list", { name: "Foods" })).toBe(body().querySelector('[data-list="results"]'));
    expect(nearSection()).toBeNull();
    expect(within(body()).queryByRole("heading", { name: NEAR_TITLE })).toBeNull();
    expect(addButton("rahka")).toBeNull();
    expect(spoken()).toBe("3 foods found.");
  });

  it("shows nothing new under a one-word search that finds six foods", async () => {
    answer("olut", beers, []);
    renderSheet();
    await search("olut");
    expect(foodNames()).toHaveLength(6);
    expect(nearSection()).toBeNull();
    expect(addButton("olut")).toBeNull();
    expect(within(body()).queryByText(/No food/)).toBeNull();
  });

  it("lists the near foods under their heading after the foods, then the offer to add the text", async () => {
    answer(QUERY, [mixed, fried], [beef9, beef17, beef7]);
    renderSheet();
    await search(QUERY);
    expect(foodNames()).toEqual([mixed.name, fried.name]);
    expect(within(body()).getByRole("list", { name: "Foods" })).toBe(body().querySelector('[data-list="results"]'));
    expect(within(nearSection()!).getByRole("heading", { name: NEAR_TITLE })).toBeInTheDocument();
    expect(nearNames()).toEqual([beef9.name, beef17.name, beef7.name]);
    // One row per food: none is in both lists.
    expect(rowNames()).toEqual([mixed.name, fried.name, beef9.name, beef17.name, beef7.name]);
    const list = body().querySelector('[data-list="results"]')!;
    expect(precedes(list, nearSection()!)).toBe(true);
    expect(precedes(nearSection()!, addButton(QUERY)!)).toBe(true);
    expect(within(body()).queryByText(/No food/)).toBeNull();
    expect(spoken()).toBe("2 foods found. 3 other matches.");
  });

  it("says that no food has every word, over the near foods and the offer to add", async () => {
    answer("banaani 120 kuivattu", [], [beef9]);
    renderSheet();
    await search("banaani 120 kuivattu");
    const line = within(body()).getByText("No exact match for “banaani 120 kuivattu”.");
    expect(within(body()).queryByText(/No food matches/)).toBeNull();
    expect(body().querySelector('[data-list="results"]')).toBeNull();
    expect(nearNames()).toEqual([beef9.name]);
    expect(precedes(line, nearSection()!)).toBe(true);
    expect(precedes(nearSection()!, addButton("banaani 120 kuivattu")!)).toBe(true);
    expect(spoken()).toBe("No foods found. 1 other match.");
  });

  it("says that no food matches, with the offer to add, when neither list has a row", async () => {
    renderSheet();
    await search("kaurajuoma mansikka");
    expect(within(body()).getByText("No food matches “kaurajuoma mansikka”.")).toBeInTheDocument();
    expect(within(body()).queryByText(/No exact match for/)).toBeNull();
    expect(nearSection()).toBeNull();
    expect(addButton("kaurajuoma mansikka")).not.toBeNull();
    expect(spoken()).toBe("No foods found.");
  });
});

describe("the near foods, pressed", () => {
  it("opens a near food like any other row, and Back puts focus on that row in its own list", async () => {
    answer(QUERY, [mixed, fried], [beef9, beef17]);
    renderSheet();
    await search(QUERY);
    await openDetail(beef17.name);
    expect(screen.getByRole("dialog", { name: beef17.name })).toBeInTheDocument();
    back();
    await waitFor(() => expect(nearSection()).not.toBeNull());
    const row = within(nearSection()!).getByRole("button", { name: new RegExp(`^${beef17.name}`) });
    await waitFor(() => expect(row).toHaveFocus());
    expect(row.closest("[data-list]")!.getAttribute("data-list")).toBe("results-near");
  });

  it("opens the own-food sheet with the text as its name from the offer under the near foods", async () => {
    answer(QUERY, [mixed], [beef9]);
    renderSheet();
    await search(QUERY);
    await listsInPlace();
    fireEvent.click(addButton(QUERY)!);
    const own = await screen.findByRole("dialog", { name: /a food/i });
    expect((within(own).getByLabelText("Name") as HTMLInputElement).value).toBe(QUERY);
  });
});

describe("the foods above the near list, between states", () => {
  it("keeps the first food where it was in the document when the near foods come under it", async () => {
    const client = registerTestQueryClient(createTestQueryClient());
    answer(QUERY, [mixed, fried], []);
    renderSheet(client);
    await search(QUERY);
    const first = body().querySelector<HTMLElement>("[data-food-row]")!;
    const place = () => Array.from(body().querySelectorAll("*")).indexOf(first);
    const before = place();
    expect(nearSection()).toBeNull();

    act(() => {
      client.setQueryData<FoodSearchResult>(queryKeys.foodSearch(QUERY), {
        foods: [mixed, fried],
        near: [beef9, beef17, beef7],
      });
    });
    await waitFor(() => expect(nearSection()).not.toBeNull());
    // The same element, with the same elements before it: nothing was put above it.
    expect(first.isConnected).toBe(true);
    expect(body().querySelector("[data-food-row]")).toBe(first);
    expect(place()).toBe(before);
    expect(precedes(first, nearSection()!)).toBe(true);
    expect(precedes(first, addButton(QUERY)!)).toBe(true);
  });

  it("keeps naming the text its lists answer while the next answer is out", async () => {
    answer("banaani 120", [], [beef9]);
    renderSheet();
    await search("banaani 120");
    const next = deferred<FoodSearchResult>();
    jest.mocked(searchFoods).mockImplementationOnce(() => next.promise);
    type("banaani 120 g");
    await settle();
    await waitFor(() => expect(searchFoods).toHaveBeenLastCalledWith("banaani 120 g", expect.anything()));
    // The answer for the new text is out: the list on screen is still the old text's, and says so.
    expect(within(body()).getByText("No exact match for “banaani 120”.")).toBeInTheDocument();
    expect(addButton("banaani 120")).not.toBeNull();
    expect(nearSection()!.querySelector("ul")).toHaveAttribute("aria-busy", "true");

    await act(async () => next.resolve({ foods: [], near: [beef9, beef7] }));
    expect(await within(body()).findByText("No exact match for “banaani 120 g”.")).toBeInTheDocument();
    expect(addButton("banaani 120 g")).not.toBeNull();
    expect(addButton("banaani 120")).toBeNull();
  });

  it("keeps the line and the offer of a text no food matches while the next answer is out", async () => {
    renderSheet();
    await search("kaurajuoma mansikka");
    const next = deferred<FoodSearchResult>();
    jest.mocked(searchFoods).mockImplementationOnce(() => next.promise);
    type("kaurajuoma mansikka 2");
    await settle();
    await waitFor(() => expect(searchFoods).toHaveBeenLastCalledWith("kaurajuoma mansikka 2", expect.anything()));
    // Nothing goes blank in between, and both still name the text that was answered.
    expect(within(body()).getByText("No food matches “kaurajuoma mansikka”.")).toBeInTheDocument();
    expect(addButton("kaurajuoma mansikka")).not.toBeNull();
    expect(addButton("kaurajuoma mansikka 2")).toBeNull();

    await act(async () => next.resolve({ foods: [], near: [] }));
    expect(await within(body()).findByText("No food matches “kaurajuoma mansikka 2”.")).toBeInTheDocument();
    expect(addButton("kaurajuoma mansikka")).toBeNull();
  });
});

describe("an answer held from before the field emptied", () => {
  /** Every line and button in the body that names a typed text. */
  const naming = () => [
    ...within(body()).queryAllByText(/^No food /),
    ...within(body()).queryAllByRole("button", { name: /as your own food$/ }),
  ];

  it("shows the lists again after a clear until the new text has its own answer, with no line or offer naming it", async () => {
    answer("banaani 120 kuivattu", [], [beef9, beef7]);
    answer("valio rahka", [mixed], []);
    renderSheet();
    await search("banaani 120 kuivattu");
    type("");
    await settle();
    expect(within(body()).getByRole("heading", { name: "Favourites" })).toBeInTheDocument();

    const next = deferred<FoodSearchResult>();
    jest.mocked(searchFoods).mockImplementationOnce(() => next.promise);
    type("valio rahka");
    await settle();
    await waitFor(() => expect(searchFoods).toHaveBeenLastCalledWith("valio rahka", expect.anything()));
    // The answer is out. The old rows do not come back under the new text, and nothing offers to add it.
    expect(naming()).toEqual([]);
    expect(nearSection()).toBeNull();
    expect(rowNames()).not.toContain(beef9.name);
    expect(within(body()).getByRole("heading", { name: "Favourites" })).toBeInTheDocument();

    await act(async () => next.resolve(server.answers["valio rahka"]));
    await waitFor(() => expect(foodNames()).toEqual([mixed.name]));
    expect(naming()).toEqual([]);
  });

  it("names no half-typed text over the old rows when the field passes under two characters between two texts", async () => {
    answer("banaani 120", [], [beef9]);
    renderSheet();
    await search("banaani 120");
    type("b");
    await settle();
    const next = deferred<FoodSearchResult>();
    jest.mocked(searchFoods).mockImplementationOnce(() => next.promise);
    type("ba");
    await settle();
    await waitFor(() => expect(searchFoods).toHaveBeenLastCalledWith("ba", expect.anything()));
    // "ba" was typed in passing: no press can add it, and no line says what it does not know.
    expect(naming()).toEqual([]);
    expect(nearSection()).toBeNull();

    await act(async () => next.resolve({ foods: [], near: [beef9, beef7] }));
    expect(await within(body()).findByText("No exact match for “ba”.")).toBeInTheDocument();
    expect(nearNames()).toEqual([beef9.name, beef7.name]);
  });
});
